// Ponto de encontro entre o computador principal de uma loja e um caixa
// adicional que está fora dela.
//
// ── O problema ───────────────────────────────────────────────────────────────
// Dentro da loja, o caixa adicional fala direto com o computador principal. Fora
// dela isso não funciona: o computador da loja está atrás do roteador, sem
// endereço alcançável pela internet, e pedir ao lojista para configurar
// redirecionamento de porta é pedir demais.
//
// Então os dois se encontram aqui. O computador principal deixa um pedido
// pendurado ("estou ouvindo") e o servidor responde a ele assim que uma chamada
// chega do caixa adicional.
//
// ── O que este servidor NÃO faz, e não pode fazer ────────────────────────────
// **Ele não lê o que passa.** O corpo das mensagens vai cifrado com uma chave
// que as duas máquinas combinaram no pareamento, dentro da loja. Aqui só
// trafegam bytes opacos; tudo que o servidor precisa para encaminhar viaja em
// cabeçalhos HTTP, fora do conteúdo.
//
// Isso é escolha deliberada: o que passa por aqui é o movimento das lojas dos
// nossos clientes — vendas, valores, CPF. Não conseguir ler é melhor que
// prometer não ler.
//
// ── Por que pedido pendurado, e não WebSocket ────────────────────────────────
// Faria o mesmo trabalho com uma dependência nova e uma mudança no arranque
// deste serviço, que valida licença de lojas reais. O ganho de desempenho seria
// invisível no volume esperado. Não compensou o risco.

import type { Hono } from 'hono'
import { exigirLicenca } from './licencaGuard.ts'
import { calcularHMAC } from './licenca.ts'

/** Quanto tempo um pedido do computador principal fica pendurado antes de voltar vazio. */
const ESPERA_MS = 25_000
/** Quanto tempo o caixa adicional espera pela resposta antes de desistir. */
const RESPOSTA_MS = 30_000
/** Chamadas que podem ficar na fila de uma loja cujo computador demora a buscar. */
const FILA_MAXIMA = 50
/**
 * Quanto uma chamada espera por alguém que a busque antes de desistir.
 *
 * Existe por causa do vaivém: o computador da loja fica pendurado, recebe
 * "nada por enquanto" ao fim do tempo e se pendura DE NOVO. Nesse intervalo —
 * uma ida e volta de rede — não há ninguém ouvindo, embora a loja esteja
 * perfeitamente no ar. Responder "indisponível" aí seria mentira, e das que
 * acontecem várias vezes por minuto.
 */
const GRACA_MS = 5_000
/**
 * Por quanto tempo uma loja continua "conhecida" depois do último ouvinte.
 *
 * Enquanto estiver dentro disso, a chamada espera. Passado isso, o computador
 * está mesmo desligado ou sem internet, e aí dizer logo é melhor que pendurar
 * quem chamou.
 */
const LOJA_VIVA_MS = 90_000
/** Corpo máximo aceito — o mesmo teto do servidor local. */
const CORPO_MAXIMO = 32 * 1024 * 1024

interface ChamadaEmTransito {
  id: string
  terminal: string
  corpo: Uint8Array
}

interface EstadoLoja {
  /** Pedidos do computador principal aguardando trabalho. */
  ouvintes: Array<(chamada: ChamadaEmTransito | null) => void>
  /** Chamadas que chegaram sem ninguém ouvindo no momento. */
  fila: ChamadaEmTransito[]
  /** Chamadas entregues, aguardando a resposta do computador principal. */
  aguardandoResposta: Map<string, (corpo: Uint8Array | null) => void>
  /** Quando o computador da loja apareceu pela última vez. */
  ultimoOuvinteEm: number
}

const lojas = new Map<string, EstadoLoja>()

function estadoDa(clienteId: string): EstadoLoja {
  let estado = lojas.get(clienteId)
  if (!estado) {
    estado = { ouvintes: [], fila: [], aguardandoResposta: new Map(), ultimoOuvinteEm: 0 }
    lojas.set(clienteId, estado)
  }
  return estado
}

function recolherSeVazia(clienteId: string): void {
  const estado = lojas.get(clienteId)
  if (!estado) return
  const ocupada =
    estado.ouvintes.length > 0 || estado.fila.length > 0 || estado.aguardandoResposta.size > 0
  // Só esquece a loja quando ela some de verdade. Apagar no primeiro intervalo
  // entre um pendurar e outro faria a próxima chamada receber "indisponível".
  if (!ocupada && Date.now() - estado.ultimoOuvinteEm > LOJA_VIVA_MS) {
    lojas.delete(clienteId)
  }
}

/**
 * Confere que quem diz ser a loja realmente tem a chave dela.
 *
 * Só o clienteId não serviria: ele circula em pedidos comuns, e quem o
 * conhecesse poderia se pendurar aqui e RECEBER as chamadas destinadas àquela
 * loja. A chave de licença prova posse — o HMAC dela só fecha com o segredo que
 * mora neste servidor.
 *
 * O conteúdo continuaria cifrado mesmo se alguém passasse por aqui, mas
 * interceptar o encaminhamento já seria dano suficiente.
 */
async function chaveConfere(segredo: string, clienteId: string, chave: string): Promise<boolean> {
  const partes = String(chave ?? '').split(':')
  if (partes.length !== 3) return false
  const [cliente, expiracao, hmac] = partes
  if (cliente !== clienteId) return false
  const esperado = await calcularHMAC(segredo, cliente, expiracao)
  if (esperado.length !== hmac.length) return false
  // Comparação de tamanho constante: o tempo de resposta não deve contar
  // quantos caracteres já estão certos.
  let diferenca = 0
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ hmac.charCodeAt(i)
  return diferenca === 0
}

export function registrarRotasRelay(app: Hono, segredoHmac: string): void {
  /**
   * O computador principal se pendura aqui dizendo "estou ouvindo".
   *
   * Responde 200 com a chamada assim que uma chegar, ou 204 quando o tempo
   * acaba — e aí ele se pendura de novo. É esse vaivém que substitui uma
   * conexão permanente.
   */
  app.post('/relay/ouvir', async (c) => {
    const { clienteId, chave } = await c.req.json<{ clienteId?: string; chave?: string }>()
    if (!clienteId || !(await chaveConfere(segredoHmac, clienteId, chave ?? ''))) {
      return c.json({ erro: 'loja não autorizada' }, 401)
    }
    const licenca = exigirLicenca(clienteId)
    if (!licenca.ok) return c.json({ erro: licenca.erro }, licenca.status)

    const estado = estadoDa(clienteId)
    estado.ultimoOuvinteEm = Date.now()

    const chamada = await new Promise<ChamadaEmTransito | null>((resolve) => {
      const daFila = estado.fila.shift()
      if (daFila) return resolve(daFila)

      const relogio = setTimeout(() => {
        estado.ouvintes = estado.ouvintes.filter((o) => o !== ouvinte)
        resolve(null)
      }, ESPERA_MS)

      const ouvinte = (recebida: ChamadaEmTransito | null): void => {
        clearTimeout(relogio)
        resolve(recebida)
      }
      estado.ouvintes.push(ouvinte)
    })

    if (!chamada) {
      recolherSeVazia(clienteId)
      return c.body(null, 204)
    }
    return c.body(chamada.corpo as unknown as ArrayBuffer, 200, {
      'Content-Type': 'application/octet-stream',
      'X-Chamada': chamada.id,
      'X-Terminal': chamada.terminal
    })
  })

  /** O computador principal devolve o resultado de uma chamada que recebeu. */
  app.post('/relay/responder', async (c) => {
    const clienteId = c.req.header('X-Loja') ?? ''
    const chave = c.req.header('X-Chave') ?? ''
    const id = c.req.header('X-Chamada') ?? ''
    if (!clienteId || !(await chaveConfere(segredoHmac, clienteId, chave))) {
      return c.json({ erro: 'loja não autorizada' }, 401)
    }

    const estado = lojas.get(clienteId)
    const entregar = estado?.aguardandoResposta.get(id)
    if (!estado || !entregar) {
      // A chamada já desistiu de esperar. Descartar é o certo: o caixa
      // adicional já mostrou "sem resposta" e refazer não é decisão daqui.
      return c.json({ ok: true, aproveitada: false })
    }

    const corpo = new Uint8Array(await c.req.arrayBuffer())
    if (corpo.byteLength > CORPO_MAXIMO) return c.json({ erro: 'resposta grande demais' }, 413)

    estado.aguardandoResposta.delete(id)
    entregar(corpo)
    recolherSeVazia(clienteId)
    return c.json({ ok: true, aproveitada: true })
  })

  /**
   * O caixa adicional chama a loja dele.
   *
   * Sem autenticação aqui de propósito: o caixa prova quem é ao computador
   * principal, não a este servidor — é ele quem tem a chave para abrir o
   * conteúdo. Este servidor não conseguiria conferir nada sem passar a saber
   * demais.
   */
  app.post('/relay/chamar', async (c) => {
    const clienteId = c.req.header('X-Loja') ?? ''
    const terminal = c.req.header('X-Terminal') ?? ''
    if (!clienteId) return c.json({ erro: 'loja não informada' }, 400)

    const corpo = new Uint8Array(await c.req.arrayBuffer())
    if (corpo.byteLength === 0) return c.json({ erro: 'chamada vazia' }, 400)
    if (corpo.byteLength > CORPO_MAXIMO) return c.json({ erro: 'chamada grande demais' }, 413)

    const estado = lojas.get(clienteId)
    // A loja é desconhecida, ou não aparece há tempo demais: está desligada,
    // sem internet, ou com o multicaixa desativado. Dizer logo é melhor que
    // pendurar quem chamou por meio minuto.
    const nuncaApareceu = !estado || Date.now() - estado.ultimoOuvinteEm > LOJA_VIVA_MS
    if (nuncaApareceu || estado.fila.length >= FILA_MAXIMA) {
      return c.json({ erro: 'O computador da loja não está disponível.' }, 503)
    }

    const id = crypto.randomUUID()
    const chamada: ChamadaEmTransito = { id, terminal, corpo }

    const resposta = await new Promise<Uint8Array | null | 'ninguem-buscou'>((resolve) => {
      const relogio = setTimeout(() => {
        estado.aguardandoResposta.delete(id)
        resolve(null)
      }, RESPOSTA_MS)

      // Prazo curto só para ser BUSCADA — cobre o intervalo entre o computador
      // da loja largar um pedido pendurado e pendurar o próximo.
      //
      // A condição é "ainda está na fila?", e não uma marca de entrega: quem
      // busca da fila é o outro handler, que não alcança estes relógios. Se a
      // chamada saiu da fila, alguém a levou, e daí em diante quem manda é o
      // prazo de resposta.
      const relogioGraca = setTimeout(() => {
        if (!estado.fila.some((c) => c.id === id)) return
        clearTimeout(relogio)
        estado.fila = estado.fila.filter((c) => c.id !== id)
        estado.aguardandoResposta.delete(id)
        resolve('ninguem-buscou')
      }, GRACA_MS)

      estado.aguardandoResposta.set(id, (recebida) => {
        clearTimeout(relogio)
        clearTimeout(relogioGraca)
        resolve(recebida)
      })

      const ouvinte = estado.ouvintes.shift()
      if (ouvinte) ouvinte(chamada)
      else estado.fila.push(chamada)
    })

    recolherSeVazia(clienteId)
    if (resposta === 'ninguem-buscou') {
      return c.json({ erro: 'O computador da loja não está disponível.' }, 503)
    }
    if (!resposta) {
      return c.json({ erro: 'O computador da loja não respondeu a tempo.' }, 504)
    }
    return c.body(resposta as unknown as ArrayBuffer, 200, {
      'Content-Type': 'application/octet-stream'
    })
  })
}

/** Só para teste: devolve o relay ao estado inicial entre casos. */
export function limparRelay(): void {
  lojas.clear()
}

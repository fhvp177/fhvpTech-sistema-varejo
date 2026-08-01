/**
 * O computador principal atendendo caixas que estão fora da loja.
 *
 * ── Como funciona ────────────────────────────────────────────────────────────
 * Dentro da loja, o caixa adicional acha este computador pelo endereço de rede.
 * De fora não acha: ele está atrás do roteador, sem endereço público, e pedir ao
 * lojista para configurar redirecionamento de porta é pedir demais.
 *
 * Então os dois se encontram no servidor. Este módulo mantém pedidos
 * PENDURADOS lá ("estou ouvindo"); quando uma chamada chega, o servidor
 * responde a um deles, e aqui a chamada é aberta, executada e devolvida.
 *
 * ── O que o servidor do meio vê ──────────────────────────────────────────────
 * Bytes. O conteúdo vai cifrado com a chave que esta máquina e aquele caixa
 * combinaram no pareamento, dentro da loja. Nem o pedido nem a resposta passam
 * legíveis por lá.
 *
 * ── Por que vários pedidos pendurados ────────────────────────────────────────
 * Um caixa costuma fazer várias chamadas quase juntas ao abrir uma tela. Com um
 * pendurado só, a segunda esperaria a primeira terminar e voltar a se pendurar.
 * Com alguns em paralelo, elas são atendidas ao mesmo tempo.
 */
import { app } from 'electron'
import { despachar } from '@fhvptech/core/electron/roteador'
import { lerConfigMulticaixa } from '@fhvptech/core/electron/multicaixa/config'
import { processarChamada } from '@fhvptech/core/electron/multicaixa/servidor'
import { abrir, selar } from '@fhvptech/core/electron/multicaixa/sigilo'
import { chaveLicencaLocal, extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'
import { canalAtendePelaRede } from './canais'

/**
 * Quantos pedidos ficam pendurados no servidor ao mesmo tempo.
 *
 * Abrir uma tela dispara várias chamadas quase juntas — a tela de Configurações
 * sozinha faz umas sete, uma por seção recolhível. Com poucos pendurados, as
 * excedentes esperariam a fila, e o que era uma viagem de rede viraria duas ou
 * três. Oito cobre as rajadas conhecidas com folga, e pendurado ocioso não
 * custa quase nada.
 */
const OUVINTES = 8
/** Espera antes de tentar de novo depois de uma falha de rede. */
const ESPERA_APOS_FALHA_MS = 5_000

const URL_RELAY = 'https://licenca-gnmodas.fly.dev'

let ligado = false
let clienteId: string | null = null
let chaveLicenca: string | null = null

/**
 * Liga o atendimento a caixas de fora.
 *
 * Devolve `false` quando a máquina não tem licença legível — sem ela não há
 * como provar ao servidor que esta é mesmo a loja, e sem essa prova qualquer um
 * poderia se pendurar no lugar dela e receber as chamadas dos caixas dela.
 */
export function ligarAtendimentoRemoto(): boolean {
  if (ligado) return true
  clienteId = extrairClienteIdLocal()
  chaveLicenca = chaveLicencaLocal()
  if (!clienteId || !chaveLicenca) return false

  ligado = true
  for (let i = 0; i < OUVINTES; i++) void manterOuvindo()
  return true
}

export function desligarAtendimentoRemoto(): void {
  ligado = false
}

export function atendimentoRemotoLigado(): boolean {
  return ligado
}

/**
 * Um lugar na fila de pendurados, que se renova enquanto o atendimento estiver
 * ligado.
 *
 * Quando uma chamada chega, `ouvirUmaVez` já criou o substituto e devolve
 * `true` — então ESTE laço encerra. Sem isso, os laços se multiplicariam a cada
 * chamada atendida.
 */
async function manterOuvindo(): Promise<void> {
  while (ligado) {
    try {
      if (await ouvirUmaVez()) return
    } catch {
      // Internet caiu, servidor reiniciou, qualquer coisa. Espera e insiste —
      // desistir deixaria o caixa de fora sem atendimento até alguém reabrir o
      // sistema aqui, e ninguém faria essa ligação.
      await respirar(ESPERA_APOS_FALHA_MS)
    }
  }
}

/** Devolve `true` quando atendeu uma chamada (e já repôs o substituto). */
async function ouvirUmaVez(): Promise<boolean> {
  const resposta = await fetch(`${URL_RELAY}/relay/ouvir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, chave: chaveLicenca })
  })

  if (resposta.status === 204) return false // nada por enquanto; pendura de novo
  if (!resposta.ok) {
    // 401/403/404 significam licença ou cadastro com problema. Insistir a cada
    // instante só geraria tráfego inútil.
    await respirar(ESPERA_APOS_FALHA_MS)
    return false
  }

  const idChamada = resposta.headers.get('X-Chamada') ?? ''
  const terminal = resposta.headers.get('X-Terminal') ?? ''
  const pacote = Buffer.from(await resposta.arrayBuffer())
  if (!idChamada) return false

  // Repõe o pendurado ANTES de executar, e não depois. Executar uma venda leva
  // milésimos, mas enquanto isso este lugar na fila estaria vago — e as
  // chamadas seguintes da mesma tela esperariam à toa. Assim a quantidade de
  // pendurados disponíveis não cai quando o movimento aperta.
  void manterOuvindo()

  const devolucao = await executar(terminal, pacote)
  await fetch(`${URL_RELAY}/relay/responder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Loja': clienteId ?? '',
      'X-Chave': chaveLicenca ?? '',
      'X-Chamada': idChamada
    },
    body: devolucao as unknown as BodyInit
  })
  return true
}

/**
 * Abre a chamada, executa e sela a resposta.
 *
 * Abrir com sucesso já prova de quem é a chamada: só aquele caixa tem a chave.
 * É uma prova mais forte que um token, porque não há o que interceptar — quem
 * não tem a chave não consegue nem produzir um pedido válido.
 */
async function executar(terminal: string, pacote: Buffer): Promise<Buffer> {
  const registro = lerConfigMulticaixa().terminais.find((t) => t.id === terminal)
  if (!registro?.chaveSigilo) {
    // Caixa removido, ou pareado antes de o sigilo existir. Sem chave não há
    // como responder de forma que ele entenda; o silêncio vira "sem resposta"
    // do lado dele, que é o certo.
    return Buffer.alloc(0)
  }

  let pedido: { caminho?: string } & Record<string, unknown>
  try {
    pedido = abrir(registro.chaveSigilo, pacote, terminal) as typeof pedido
  } catch {
    return Buffer.alloc(0)
  }

  // O handshake não passa pelo roteador: é pergunta sobre a instalação, não
  // sobre a loja. Mesmo conteúdo que o servidor local responde.
  if (pedido.caminho === '/handshake') {
    return selar(
      registro.chaveSigilo,
      { status: 200, corpo: { ok: true, versao: app.getVersion() } },
      terminal
    )
  }

  const resultado = await processarChamada(
    {
      canalPermitido: canalAtendePelaRede,
      despachar: (canal, args, origem) => despachar(canal, args, { origem })
    },
    pedido,
    terminal
  )
  return selar(registro.chaveSigilo, resultado, terminal)
}

function respirar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Endereço do servidor de encontro, para entregar ao caixa no pareamento. */
export function dadosDoRelay(): { url: string; loja: string } | null {
  const id = clienteId ?? extrairClienteIdLocal()
  return id ? { url: URL_RELAY, loja: id } : null
}

/** Versão desta instalação — usada no handshake. */
export function versaoLocal(): string {
  return app.getVersion()
}

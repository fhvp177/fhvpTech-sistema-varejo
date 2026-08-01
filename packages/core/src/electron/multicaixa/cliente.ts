/**
 * O lado do terminal: encaminha cada chamada para o caixa principal.
 *
 * Este módulo é o que faz o segundo caixa parecer um sistema normal. A
 * interface dele chama `window.api.vendas.criar(...)` como sempre; a ponte IPC
 * entrega ao roteador; e o roteador, em vez de executar, manda para cá. A tela
 * não sabe que a resposta veio de outra máquina — e é isso que evita ter duas
 * versões de cada tela.
 *
 * ── A regra que não se negocia ───────────────────────────────────────────────
 * **Escrita nunca é repetida sozinha.**
 *
 * Quando uma chamada falha por rede, existem dois mundos possíveis e nenhum
 * jeito de distinguir: ou o pedido não chegou, ou chegou, foi executado e a
 * RESPOSTA é que se perdeu no caminho. Repetir uma leitura nesse caso não custa
 * nada. Repetir uma venda registra a venda duas vezes — e ninguém descobre no
 * dia, só na conferência de estoque semanas depois.
 *
 * Então falha de escrita para e avisa o operador, que decide. Um pedido a mais é
 * irritante; uma venda a mais é dinheiro errado.
 *
 * ── Sobre o tempo de espera ──────────────────────────────────────────────────
 * Dez segundos. Curto o bastante para não deixar o operador travado na frente
 * do cliente, e longo o bastante para aguentar internet ruim. Sem timeout, uma
 * queda de rede deixaria a tela pendurada para sempre, que é pior do que um
 * erro claro.
 */
import { randomUUID } from 'node:crypto'
import { abrir, selar } from './sigilo'

export const TIMEOUT_PADRAO_MS = 10_000

export interface OpcoesCliente {
  /** Endereço do caixa principal na rede da loja, ex.: `http://192.168.0.10:4877`. */
  url: string
  token: string
  /**
   * Caminho alternativo, para quando este caixa está longe da loja.
   *
   * O computador principal não é alcançável de fora — está atrás do roteador.
   * Então os dois se encontram num servidor, e o conteúdo viaja cifrado com a
   * chave combinada no pareamento: o servidor encaminha bytes que não abre.
   */
  relay?: { url: string; loja: string; terminal: string; chaveSigilo: string }
  /** Diz se o canal pode ser repetido depois de falha de rede (só leitura). */
  podeRepetir(canal: string): boolean
  timeoutMs?: number
  /** Injetável para teste; por padrão o `fetch` global. */
  buscar?: typeof fetch
  /** Avisado a cada mudança de estado da conexão — alimenta o aviso na tela. */
  aoMudarConexao?(conectado: boolean): void
}

export class FalhaDeConexao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'FalhaDeConexao'
  }
}

export class ClienteMulticaixa {
  private conectadoAgora = true
  private readonly timeoutMs: number
  private readonly buscar: typeof fetch
  /**
   * Por onde as chamadas estão indo agora.
   *
   * A escolha é lembrada em vez de refeita a cada chamada: tentar a rede local
   * e esperar ela falhar antes de cada pedido acrescentaria a espera do timeout
   * a TODAS as chamadas quando o caixa está fora da loja. Descobre uma vez,
   * usa; se o caminho falhar, tenta o outro na próxima.
   */
  private caminho: 'local' | 'relay' | 'indefinido' = 'indefinido'

  constructor(private readonly opcoes: OpcoesCliente) {
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS
    this.buscar = opcoes.buscar ?? fetch
  }

  conectado(): boolean {
    return this.conectadoAgora
  }

  /** Confere se o caixa principal responde e com qual versão. */
  async handshake(): Promise<{ versao: string }> {
    const resposta = await this.enviarPorAlgumCaminho('/handshake', undefined)
    return { versao: String((resposta as { versao?: unknown }).versao ?? '') }
  }

  /**
   * Executa um canal no caixa principal e devolve exatamente o que o handler
   * devolveria em casa. Exceção do handler vira exceção aqui.
   */
  async chamar(canal: string, args: readonly unknown[] = []): Promise<unknown> {
    // opId acompanha a operação para o caso de um dia existir deduplicação do
    // lado do caixa principal. Hoje ela não é necessária, porque escrita não se
    // repete sozinha — mas mandar o identificador desde já evita ter de mudar o
    // protocolo depois, quando já houver terminais em campo.
    const corpo = { canal, args, opId: randomUUID() }

    try {
      return this.desembrulhar(await this.enviarPorAlgumCaminho('/rpc', corpo))
    } catch (erro) {
      if (!(erro instanceof FalhaDeConexao)) throw erro
      if (!this.opcoes.podeRepetir(canal)) throw erro
      // Só leitura chega aqui. Uma tentativa a mais, e olhe lá — e como a
      // tentativa anterior falhou, o caminho é redescoberto (pode ser que o
      // caixa tenha saído da loja, ou voltado para ela).
      this.caminho = 'indefinido'
      return this.desembrulhar(
        await this.enviarPorAlgumCaminho('/rpc', { ...corpo, opId: randomUUID() })
      )
    }
  }

  /** Separa "o handler recusou" (valor) de "o handler lançou" (exceção). */
  private desembrulhar(resposta: unknown): unknown {
    const r = resposta as { ok?: boolean; valor?: unknown; erro?: string }
    if (r.ok) return r.valor
    throw new Error(r.erro ?? 'Falha no caixa principal.')
  }

  /**
   * Escolhe por onde falar e mantém a escolha.
   *
   * Na loja, o caminho local é direto e rápido. Fora dela, ele nem existe — e é
   * por isso que a escolha é lembrada: se cada chamada tentasse o local antes,
   * o caixa fora da loja pagaria o tempo de espera do local em TODAS elas.
   */
  private async enviarPorAlgumCaminho(caminho: string, corpo: unknown): Promise<unknown> {
    const tentarLocal = (): Promise<unknown> => this.enviar(caminho, corpo)
    const tentarRelay = (): Promise<unknown> => this.enviarPeloRelay(caminho, corpo)

    if (this.caminho === 'local') return tentarLocal()
    if (this.caminho === 'relay') return tentarRelay()

    // Primeira chamada da sessão: descobre. A rede local vem primeiro porque,
    // quando existe, é sempre melhor — direta e sem intermediário.
    try {
      const valor = await tentarLocal()
      this.caminho = 'local'
      return valor
    } catch (erro) {
      if (!(erro instanceof FalhaDeConexao) || !this.opcoes.relay) throw erro
      const valor = await tentarRelay()
      this.caminho = 'relay'
      return valor
    }
  }

  /**
   * Manda pelo servidor de encontro, cifrado de ponta a ponta.
   *
   * O `terminal` entra como vínculo da cifra, não só como cabeçalho: um pacote
   * legítimo não pode ser reapresentado em nome de outro caixa.
   */
  private async enviarPeloRelay(caminho: string, corpo: unknown): Promise<unknown> {
    const relay = this.opcoes.relay
    if (!relay) throw new FalhaDeConexao('Sem conexão com o caixa principal.')

    const pedido = caminho === '/handshake' ? { caminho } : { caminho, ...(corpo as object) }
    const cancelador = new AbortController()
    const relogio = setTimeout(() => cancelador.abort(), this.timeoutMs * 3)
    try {
      const resposta = await this.buscar(`${relay.url}/relay/chamar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Loja': relay.loja,
          'X-Terminal': relay.terminal
        },
        body: selar(relay.chaveSigilo, pedido, relay.terminal) as unknown as BodyInit,
        signal: cancelador.signal
      })

      // 503 e 504 vêm do servidor de encontro, não do caixa principal: o
      // computador da loja está desligado ou não respondeu. Para o operador é a
      // mesma coisa que ficar sem conexão.
      if (resposta.status === 503 || resposta.status === 504) {
        this.marcarConexao(false)
        throw new FalhaDeConexao('Sem conexão com o caixa principal.')
      }
      if (!resposta.ok) {
        this.marcarConexao(true)
        throw new Error('O caixa principal encontrou um erro ao processar o pedido.')
      }

      const bruto = Buffer.from(await resposta.arrayBuffer())
      if (bruto.length === 0) {
        // O caixa principal não conseguiu abrir nosso pacote — normalmente
        // porque este caixa foi removido lá.
        this.marcarConexao(true)
        throw new Error('Este caixa perdeu o acesso. Faça a conexão novamente no caixa principal.')
      }

      const devolvido = abrir(relay.chaveSigilo, bruto, relay.terminal) as {
        status?: number
        corpo?: unknown
      }
      this.marcarConexao(true)
      if (devolvido.status === 403) {
        throw new Error('Esta ação só pode ser feita no caixa principal.')
      }
      return devolvido.corpo ?? devolvido
    } catch (erro) {
      if (erro instanceof FalhaDeConexao) throw erro
      if (erro instanceof Error && (erro.name === 'AbortError' || erro.name === 'TypeError')) {
        this.marcarConexao(false)
        throw new FalhaDeConexao('Sem conexão com o caixa principal.')
      }
      throw erro
    } finally {
      clearTimeout(relogio)
    }
  }

  private async enviar(caminho: string, corpo: unknown): Promise<unknown> {
    const cancelador = new AbortController()
    const relogio = setTimeout(() => cancelador.abort(), this.timeoutMs)
    try {
      const resposta = await this.buscar(`${this.opcoes.url}${caminho}`, {
        method: corpo === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${this.opcoes.token}`,
          ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: cancelador.signal
      })

      if (resposta.status === 401) {
        this.marcarConexao(true) // respondeu: a rede está boa, o acesso é que não
        throw new Error('Este caixa perdeu o acesso. Faça a conexão novamente no caixa principal.')
      }
      if (resposta.status === 403) {
        this.marcarConexao(true)
        throw new Error('Esta ação só pode ser feita no caixa principal.')
      }
      if (!resposta.ok && resposta.status >= 500) {
        this.marcarConexao(true)
        throw new Error('O caixa principal encontrou um erro ao processar o pedido.')
      }

      this.marcarConexao(true)
      return await resposta.json()
    } catch (erro) {
      // Só falha de TRANSPORTE vira FalhaDeConexao — é o que autoriza repetir
      // uma leitura. Recusa do servidor (401/403/500) é resposta, não queda, e
      // repetir não ajudaria em nada.
      if (erro instanceof Error && (erro.name === 'AbortError' || erro.name === 'TypeError')) {
        this.marcarConexao(false)
        throw new FalhaDeConexao('Sem conexão com o caixa principal.')
      }
      throw erro
    } finally {
      clearTimeout(relogio)
    }
  }

  private marcarConexao(conectado: boolean): void {
    if (this.conectadoAgora === conectado) return
    this.conectadoAgora = conectado
    this.opcoes.aoMudarConexao?.(conectado)
  }
}

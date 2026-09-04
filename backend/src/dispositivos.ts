/**
 * Quantas máquinas uma loja pode abrir o sistema.
 *
 * ── O que este módulo decide, e o que ele NÃO decide ─────────────────────────
 * Dada a lista de máquinas que já pediram vaga nesta loja e o limite combinado,
 * ele responde se a máquina que está pedindo agora entra. Não fala HTTP, não
 * conhece banco e não sabe o que é revendedor: recebe a lista pronta e devolve
 * o veredito com o registro a gravar.
 *
 * ── Por que este módulo existe ───────────────────────────────────────────────
 * A licença é validada OFFLINE (HMAC dentro de um arquivo cifrado, em
 * `packages/core/src/electron/licenca.ts`). Isso é ótimo para a loja, que
 * continua vendendo com a internet caída, e péssimo para a contagem: copiar o
 * `licenca.lic` para outro computador sempre funcionou, e ninguém ficava
 * sabendo. Este é o primeiro lugar do sistema onde máquinas são CONTADAS, e por
 * isso ele mora no servidor. As máquinas não têm como se contar entre si.
 *
 * ── Como uma máquina é reconhecida ───────────────────────────────────────────
 * Por DOIS números, e o segundo é o que evita ligação de suporte:
 *
 *   `deviceId`  sorteado na primeira execução, guardado na pasta de dados
 *   `digital`   impressão do hardware (placa-mãe, disco), recalculada sempre
 *
 * Formatou o PC: o `deviceId` se perde, a `digital` volta igual, a máquina é
 * RECONHECIDA e fica com a mesma vaga. Copiou a pasta de dados inteira para um
 * segundo PC (que é a forma esperta de burlar): o `deviceId` é o mesmo, a
 * `digital` é outra, logo são duas máquinas e ocupam duas vagas.
 *
 * ⚠️ É por isso que a identidade é o PAR, nunca o `deviceId` sozinho. Trocar a
 * busca por `d.deviceId === pedido.deviceId` tem cara de simplificação e
 * devolveria a cópia de pasta ao patamar de hoje, em silêncio. Há teste.
 *
 * ── O limite ausente não é o limite zero ─────────────────────────────────────
 * `limite: null` significa "ninguém combinou limite com esta loja", e toda loja
 * que já existia quando isto nasceu está nesse estado. Ler ausência como zero
 * derrubaria a ativação de todo mundo de uma vez. O mesmo cuidado que a cota de
 * notas tomou, pelo mesmo motivo.
 */

/**
 * Dias sem dar sinal de vida até a vaga voltar sozinha.
 *
 * Existe para o caso mais comum do mundo real: o PC queimou, ou o cliente
 * vendeu o computador. Sem isto, toda troca de máquina vira uma solicitação
 * para atender no sábado. Máquina dormente NÃO é apagada: ela continua na
 * lista, marcada, porque saber que existiu é o que explica a conta.
 */
export const DIAS_SEM_SINAL_LIBERA = 30

/**
 * De quanto em quanto tempo a máquina reconfere a vaga com o servidor.
 *
 * ⚠️ Passar do prazo NÃO bloqueia nada. O passe local guarda a última
 * resposta EXPLÍCITA do servidor, e só um "não" explícito fecha o sistema.
 * Servidor fora do ar, internet caída ou máquina que nunca conseguiu falar
 * continuam trabalhando: silêncio não é resposta. É a mesma regra do
 * guardião de relógio, pelo mesmo motivo, loja parada é o pior desfecho.
 *
 * Mora aqui, e não no app, para os dois lados não discordarem do prazo.
 */
export const HORAS_ENTRE_CONFERENCIAS = 12

/** De onde a máquina abre o sistema. */
export type OrigemDispositivo =
  /** Instalação completa, com o banco de dados dela. */
  | 'principal'
  /**
   * Segundo caixa do multicaixa, que lê os dados do principal pela rede.
   *
   * Conta vaga por decisão comercial de 2026-09-03: é uma máquina a mais
   * abrindo o sistema, e é exatamente o que o plano de 2 dispositivos vende.
   * Não contar esvaziaria o limite no dia em que o multicaixa entrasse.
   */
  | 'terminal'

export type Dispositivo = {
  deviceId: string
  digital: string
  /** Nome da máquina, para dar para reconhecer qual liberar no painel. */
  nome: string
  origem: OrigemDispositivo
  primeiroEm: string
  ultimoEm: string
  versao?: string
  /**
   * Quando a vaga foi devolvida no painel.
   *
   * O registro NÃO é apagado: saber que aquela máquina existiu é o que
   * explica a conta depois. Ela só deixa de segurar vaga.
   */
  liberadoEm?: string
}

export type PedidoDeVaga = {
  deviceId: string
  digital: string
  nome: string
  origem: OrigemDispositivo
  versao?: string
}

export type MotivoConcessao =
  /** A mesma máquina de sempre, só renovando o passe. */
  | 'ja-tinha'
  /** Hardware conhecido com identificador novo: formatou o PC, reusa a vaga. */
  | 'reconhecida'
  /** Máquina nova, e havia vaga. */
  | 'nova'
  /** Passou do limite, mas esta loja tem liberação ligada no painel. */
  | 'acima-do-limite-liberado'

export type Veredito =
  | {
      concedida: true
      motivo: MotivoConcessao
      registro: Dispositivo
      /** `deviceId` antigo que este registro substitui, quando reconhecida. */
      substitui?: string
      /** Quantas vagas ficam ocupadas depois desta. */
      emUso: number
    }
  | {
      concedida: false
      motivo: 'limite'
      limite: number
      emUso: Dispositivo[]
      mensagem: string
    }

const MAX_NOME = 60

/**
 * Limpa o nome da máquina antes de ele virar linha no painel.
 *
 * O texto vem da máquina do cliente, então é conteúdo de fora: caractere de
 * controle e tamanho sem teto não entram num banco que uma tela vai ler. O
 * escape de HTML é responsabilidade do painel; aqui é só sanidade do dado.
 */
export function nomeSeguroDeMaquina(bruto: unknown): string {
  const texto = typeof bruto === 'string' ? bruto : ''
  // eslint-disable-next-line no-control-regex
  const limpo = texto.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, MAX_NOME)
  return limpo || 'Máquina sem nome'
}

/** Esta máquina ainda segura uma vaga? */
export function estaAtiva(
  d: Pick<Dispositivo, 'ultimoEm' | 'liberadoEm'>,
  agoraMs: number,
  diasSemSinal = DIAS_SEM_SINAL_LIBERA
): boolean {
  if (d.liberadoEm) return false
  const visto = Date.parse(d.ultimoEm)
  if (!Number.isFinite(visto)) return false
  return agoraMs - visto < diasSemSinal * 86_400_000
}

export type SituacaoDispositivos = {
  /** `null` = loja sem limite combinado. Conta, não compara. */
  limite: number | null
  /** Máquinas que ainda seguram vaga. */
  emUso: number
  /** Quantas ainda cabem. `null` quando não há limite. Nunca negativo. */
  livres: number | null
  /** Passou do combinado. Falso quando não há limite. */
  acimaDoLimite: boolean
  /** Máquinas caladas há tempo demais, cuja vaga já voltou sozinha. */
  dormentes: number
  /** Máquinas cuja vaga foi devolvida à mão, no painel. */
  liberadas: number
}

/**
 * Retrato da loja para o painel.
 *
 * Separado de `decidirVaga` de propósito: a tela precisa do número mesmo quando
 * ninguém está pedindo vaga nenhuma, e ela não pode ter que simular um pedido
 * para descobrir isso.
 */
export function avaliarDispositivos(
  existentes: Dispositivo[],
  limite: number | null | undefined,
  agoraMs: number
): SituacaoDispositivos {
  const ativos = existentes.filter((d) => estaAtiva(d, agoraMs))
  const liberadas = existentes.filter((d) => Boolean(d.liberadoEm)).length
  const dormentes = existentes.length - ativos.length - liberadas

  if (limite === null || limite === undefined) {
    return {
      limite: null,
      emUso: ativos.length,
      livres: null,
      acimaDoLimite: false,
      dormentes,
      liberadas
    }
  }

  const teto = Math.max(0, Math.floor(limite))
  return {
    limite: teto,
    emUso: ativos.length,
    livres: Math.max(0, teto - ativos.length),
    acimaDoLimite: ativos.length > teto,
    dormentes,
    liberadas
  }
}

function mensagemDeRecusa(limite: number, emUso: Dispositivo[]): string {
  const nomes = emUso.map((d) => d.nome).join(', ')
  const plural = limite === 1 ? 'máquina' : 'máquinas'
  return (
    `Este plano permite ${limite} ${plural}. ` +
    (nomes ? `Em uso: ${nomes}. ` : '') +
    'Para liberar uma delas e usar o sistema aqui, fale com a FHVP Tech.'
  )
}

/**
 * A máquina que está pedindo entra?
 *
 * A ordem das perguntas importa e é o coração do módulo:
 *
 *  1. É exatamente a mesma máquina (par completo)? Renova, sem gastar vaga.
 *  2. É o mesmo hardware com identificador novo? Formatou o PC: herda a vaga.
 *  3. Nada bate: é máquina nova, e aí sim o limite fala.
 *
 * Máquina que teve a vaga LIBERADA no painel cai no passo 3 mesmo sendo
 * conhecida: ela mantém a história, mas disputa a vaga de novo.
 *
 * ⚠️ O passo 2 NÃO pode virar "mesmo deviceId, digital diferente". Esse é o
 * caso da pasta copiada, e ele tem que gastar vaga, que é o ponto do recurso
 * inteiro.
 *
 * Máquina sem digital (a coleta de hardware pode falhar num PC qualquer) cai
 * para a identidade só pelo `deviceId`. Perder a contagem é pior que perder a
 * precisão: quem falha na coleta é a minoria, e travar a instalação dela seria
 * punir o cliente por um driver.
 */
export function decidirVaga(opcoes: {
  existentes: Dispositivo[]
  pedido: PedidoDeVaga
  limite: number | null | undefined
  permitirAcimaDoLimite?: boolean
  agoraMs: number
}): Veredito {
  const { existentes, pedido, limite, agoraMs } = opcoes
  const agoraISO = new Date(agoraMs).toISOString()
  const nome = nomeSeguroDeMaquina(pedido.nome)
  const temDigital = pedido.digital !== ''

  const renovar = (anterior: Dispositivo): Dispositivo => ({
    deviceId: pedido.deviceId,
    digital: pedido.digital,
    nome,
    origem: pedido.origem,
    primeiroEm: anterior.primeiroEm,
    ultimoEm: agoraISO,
    versao: pedido.versao
  })

  const mesmaMaquina = existentes.find(
    (d) =>
      d.deviceId === pedido.deviceId &&
      (temDigital && d.digital !== '' ? d.digital === pedido.digital : true)
  )

  // Mesmo hardware, identificador novo.
  //
  // ⚠️ O `temDigital` é quem segura a máquina SEM digital: sem ele, vazio
  // casaria com vazio e toda máquina que falhasse na coleta de hardware
  // herdaria a vaga da primeira que também tivesse falhado.
  const conhecida =
    mesmaMaquina ??
    (temDigital ? existentes.find((d) => d.digital === pedido.digital) : undefined)

  // Máquina conhecida que ainda tem a vaga dela: renova e vai embora, sem
  // passar pelo limite. É o caminho de 99% dos pedidos.
  if (conhecida && !conhecida.liberadoEm) {
    const registro = renovar(conhecida)
    const outras = existentes.filter(
      (d) => d.deviceId !== conhecida.deviceId && estaAtiva(d, agoraMs)
    )
    return {
      concedida: true,
      motivo: mesmaMaquina ? 'ja-tinha' : 'reconhecida',
      registro,
      substitui: mesmaMaquina ? undefined : conhecida.deviceId,
      emUso: outras.length + 1
    }
  }

  // ★ Daqui para baixo a máquina PRECISA de vaga: ou é nova, ou é uma que foi
  // liberada no painel. A liberada volta a competir de igual para igual, e é
  // isso que faz "liberar" funcionar: sem esta distinção, o computador que
  // você acabou de tirar retomaria a vaga na conferência seguinte, e o botão
  // de liberar viraria enfeite.
  const ativos = existentes.filter((d) => estaAtiva(d, agoraMs))
  const registro: Dispositivo = conhecida
    ? renovar(conhecida)
    : {
        deviceId: pedido.deviceId,
        digital: pedido.digital,
        nome,
        origem: pedido.origem,
        primeiroEm: agoraISO,
        ultimoEm: agoraISO,
        versao: pedido.versao
      }
  const substitui =
    conhecida && conhecida.deviceId !== pedido.deviceId ? conhecida.deviceId : undefined
  const motivoDeEntrada: MotivoConcessao = conhecida ? 'reconhecida' : 'nova'

  if (limite === null || limite === undefined) {
    return {
      concedida: true,
      motivo: motivoDeEntrada,
      registro,
      substitui,
      emUso: ativos.length + 1
    }
  }

  const teto = Math.max(0, Math.floor(limite))
  if (ativos.length < teto) {
    return {
      concedida: true,
      motivo: motivoDeEntrada,
      registro,
      substitui,
      emUso: ativos.length + 1
    }
  }

  if (opcoes.permitirAcimaDoLimite === true) {
    return {
      concedida: true,
      motivo: 'acima-do-limite-liberado',
      registro,
      substitui,
      emUso: ativos.length + 1
    }
  }

  return {
    concedida: false,
    motivo: 'limite',
    limite: teto,
    emUso: ativos,
    mensagem: mensagemDeRecusa(teto, ativos)
  }
}

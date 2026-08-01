/**
 * Roteador central de canais IPC.
 *
 * ── O problema que ele resolve ───────────────────────────────────────────────
 * Até aqui cada módulo chamava `ipcMain.handle('grupo:acao', fn)` direto. Isso
 * amarra o handler ao Electron e à janela local: só quem está no processo do
 * app consegue chamar. Para o segundo caixa (um notebook que fala com o PC da
 * loja pela rede) é preciso poder disparar o MESMO handler vindo de outro
 * lugar, sem duplicar lógica nenhuma.
 *
 * A saída é guardar os handlers num Map aqui no meio. O `ipcMain` vira apenas
 * UM dos caminhos de entrada — a ponte local. Depois o servidor HTTP vira o
 * outro, e os dois desembocam no mesmo `despachar()`.
 *
 * ── Quem está chamando ───────────────────────────────────────────────────────
 * Um handler precisa saber de quem veio a chamada: a venda tem que sair no nome
 * do vendedor logado NAQUELA máquina, não no do último que logou em qualquer
 * uma. Passar isso por parâmetro obrigaria a mexer na assinatura de todos os
 * handlers e de todo código que eles chamam.
 *
 * Em vez disso o roteador embrulha cada despacho num `AsyncLocalStorage`, que é
 * um contexto que acompanha a execução — inclusive através de `await`. Quem
 * precisar saber a origem chama `origemAtual()` de onde estiver, sem receber
 * nada por parâmetro.
 *
 * Repare que o contexto guarda só a IDENTIDADE de quem chamou, e não a sessão
 * em si. O contexto morre no fim do despacho, mas o login precisa durar entre
 * uma chamada e outra — então quem guarda "origem → vendedor logado" é o módulo
 * de sessão do app, usando `origemAtual()` como chave.
 *
 * ── O que este módulo NÃO faz ────────────────────────────────────────────────
 * Não trata erro. Hoje cada handler devolve `{ success: false, error }` por
 * conta própria, e o que escapar disso vira uma promessa rejeitada do lado do
 * renderer. O roteador deixa passar exatamente igual: transformar exceção em
 * resposta aqui mudaria o comportamento de 134 canais de uma vez.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** Um handler de canal: recebe os argumentos do chamador e devolve a resposta. */
export type HandlerCanal = (...args: never[]) => unknown

/** Origem usada pela janela da própria máquina. */
export const ORIGEM_LOCAL = 'local'

/**
 * Quem disparou a chamada. Hoje só carrega a origem; se um dia precisar de mais
 * (idioma, versão do chamador), cresce aqui sem tocar nos handlers.
 */
export interface ContextoChamada {
  /** `'local'` para a janela desta máquina, ou o id do terminal pareado. */
  origem: string
}

const canais = new Map<string, HandlerCanal>()
const contexto = new AsyncLocalStorage<ContextoChamada>()
let ponte: PonteIpc | null = null
let encaminhador: Encaminhador | null = null

/**
 * Desvio usado pelo segundo caixa: em vez de executar o handler local, manda a
 * chamada para o caixa principal.
 *
 * Fica aqui, e não em cada handler, porque o roteador já é o funil por onde
 * tudo passa. Um único ponto decide "isto roda aqui ou lá", e nenhum dos 134
 * handlers precisa saber que existe um segundo caixa.
 */
export interface Encaminhador {
  /** Manda a chamada para a outra máquina. */
  enviar(canal: string, args: readonly unknown[]): Promise<unknown>
  /** Diz quais canais saem daqui. O que não sair, roda local (impressora, licença). */
  deveEnviar(canal: string): boolean
}

/** Superfície mínima do `ipcMain` — evita arrastar o Electron para dentro do core. */
export interface PonteIpc {
  handle(canal: string, ouvinte: (evento: unknown, ...args: unknown[]) => unknown): void
}

/**
 * Registra um canal. Substitui o antigo `ipcMain.handle`.
 *
 * Recusa nome repetido pelo mesmo motivo que o Electron recusa — dois handlers
 * no mesmo canal significa que um deles nunca vai rodar, e descobrir isso com o
 * app aberto na loja é tarde demais.
 */
export function registrarCanal(canal: string, handler: HandlerCanal): void {
  if (!canal) {
    throw new Error('Canal sem nome.')
  }
  if (canais.has(canal)) {
    throw new Error(`Canal "${canal}" registrado duas vezes.`)
  }
  canais.set(canal, handler)
  // Nem todo canal nasce antes da ponte: os 3 do atualizador só se registram
  // depois que a janela principal existe. Ligar o retardatário na hora evita
  // que ele fique invisível para o renderer — um "não é uma função" que só
  // apareceria com o app aberto.
  if (ponte) ligarAoIpc(ponte, canal)
}

function ligarAoIpc(ipc: PonteIpc, canal: string): void {
  ipc.handle(canal, (_evento, ...args) => despachar(canal, args))
}

/** Nomes de todos os canais registrados, em ordem. Base do teste de inventário. */
export function listarCanais(): string[] {
  return [...canais.keys()].sort()
}

export function temCanal(canal: string): boolean {
  return canais.has(canal)
}

/**
 * Executa o handler do canal dentro do contexto de quem chamou.
 *
 * Devolve exatamente o que o handler devolveu — valor cru se ele é síncrono,
 * promessa se é assíncrono. Não envolve em promessa por conta própria: handler
 * síncrono tem que continuar rodando até o fim sem ceder a vez, que é o que
 * mantém venda concorrente segura (conferir estoque e gravar sem brecha no
 * meio).
 */
export function despachar(
  canal: string,
  args: readonly unknown[] = [],
  ctx: ContextoChamada = { origem: ORIGEM_LOCAL }
): unknown {
  // No segundo caixa, o que é dado da loja sai pela rede antes de procurar
  // handler local — o handler existe, mas executá-lo aqui não faria sentido:
  // não há banco nesta máquina.
  if (encaminhador?.deveEnviar(canal)) {
    return encaminhador.enviar(canal, args)
  }

  const handler = canais.get(canal)
  if (!handler) {
    throw new Error(`Canal "${canal}" não existe.`)
  }
  return contexto.run(ctx, () => (handler as (...a: unknown[]) => unknown)(...args))
}

/**
 * Liga o desvio para o caixa principal. Passar `null` volta ao normal.
 *
 * Chamado uma vez no boot, quando a máquina está configurada como segundo
 * caixa. Nenhum handler é alterado: eles continuam registrados e prontos, só
 * deixam de ser chamados para os canais que saem pela rede.
 */
export function configurarEncaminhador(novo: Encaminhador | null): void {
  encaminhador = novo
}

/**
 * Origem da chamada em andamento.
 *
 * Fora de um despacho (boot do app, timer do backup, tarefa agendada) devolve
 * `'local'`: é código da própria máquina, e tratar como local é o padrão seguro.
 */
export function origemAtual(): string {
  return contexto.getStore()?.origem ?? ORIGEM_LOCAL
}

/**
 * Liga os canais registrados ao `ipcMain`, um `handle` por canal.
 *
 * O primeiro parâmetro que o Electron entrega ao ouvinte é o evento, que os
 * handlers não usam mais — some aqui. A única exceção histórica era o
 * `impressao:listarImpressoras`, que pegava a lista de impressoras pelo
 * `event.sender`; ele passou a usar a janela diretamente.
 *
 * Canal registrado DEPOIS desta chamada também é ligado — os 3 do atualizador
 * só nascem quando a janela principal já existe.
 */
export function montarPonteIpc(ipc: PonteIpc): void {
  if (ponte) {
    throw new Error('Ponte IPC montada duas vezes.')
  }
  for (const canal of canais.keys()) {
    ligarAoIpc(ipc, canal)
  }
  // A partir daqui, canal registrado tarde se liga sozinho (ver registrarCanal).
  ponte = ipc
}

/** Só para teste: devolve o roteador ao estado inicial entre casos. */
export function limparCanais(): void {
  canais.clear()
  ponte = null
  encaminhador = null
}

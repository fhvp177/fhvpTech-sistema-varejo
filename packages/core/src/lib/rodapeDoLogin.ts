/**
 * Quando a tela de login deve mostrar seu rodapé — o telefone do suporte, o
 * "recupere por e-mail" e o atalho "Configurar este computador".
 *
 * ── O bug que esta função existe pra impedir ─────────────────────────────────
 * O rodapé é a saída de emergência de quem NÃO consegue entrar. O atalho de
 * configurar a máquina, em particular, é a única porta pra virar caixa adicional
 * ou trazer os dados de outra: numa instalação nova ninguém sabe o PIN do
 * vendedor que veio junto, então não há como logar e chegar às Configurações.
 *
 * A primeira versão só mostrava o rodapé enquanto ninguém estivesse selecionado,
 * ou seja, na LISTA de contas. Parecia certo, mas a tela pula a lista quando
 * existe uma conta só: ela seleciona sozinha e vai direto pro PIN. Sem lista,
 * `selecionado` nunca é null e o rodapé inteiro sumia — nem havia volta, porque
 * o botão "trocar" também se esconde com uma conta só.
 *
 * E sumia justamente onde mais importa: uma instalação nova nasce com UM
 * vendedor ('Gerente', criado pela migration 013). Ou seja, a máquina recém
 * formatada — o caso de uso inteiro do atalho — era a que nunca via nem o
 * telefone do suporte nem o botão.
 *
 * A regra, então, é sobre ter ou não uma porta de saída: mostra na lista, e
 * mostra também quando não existe lista pra onde voltar.
 *
 * ⚠️ Só decide SE o rodapé aparece. O que ele escreve é da tela, que enxuga o
 * texto na etapa do PIN pra não repetir o "Esqueci meu PIN" logo acima.
 */
export function deveMostrarRodapeDoLogin(args: {
  /** Alguma conta já está selecionada (a tela está pedindo o PIN). */
  alguemSelecionado: boolean
  /** Quantas contas a tela listou. Com 0 ou 1 não há lista pra voltar. */
  totalDeContas: number
}): boolean {
  return !args.alguemSelecionado || args.totalDeContas <= 1
}

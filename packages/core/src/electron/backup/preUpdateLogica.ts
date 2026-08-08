/**
 * A decisão do backup pré-atualização, sem Electron nem banco por perto.
 *
 * ── Por que isto é um arquivo separado ───────────────────────────────────────
 * Mesmo motivo do `segredoLogica.ts`: `BackupPreUpdate.ts` importa o
 * BackupManager, que importa o `app` do Electron e o better-sqlite3. Nada disso
 * carrega no runtime dos testes. A regra que precisa de prova mora aqui, onde o
 * teste alcança; lá fica só a fiação.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 * Esta função **não pode lançar**. Nunca. Ela roda no caminho do "Reiniciar e
 * instalar", logo antes de disparar o instalador, e uma exceção aqui não vira
 * mensagem de erro: vira o app parado na tela "Instalando a nova versão…" para
 * sempre, porque o roteador de IPC não converte exceção em resposta e o modal
 * espera uma promessa que nunca volta.
 *
 * Foi exatamente o que aconteceu com o segundo caixa. Ele não tem banco — os
 * dados moram no PC principal —, então não tem BackupManager, então
 * `obterBackupManager()` lançava, e o terminal ficava impossibilitado de se
 * atualizar. Não em algumas máquinas: em todas, sempre, de forma determinística.
 *
 * ── Três desfechos, e por que "sem backup" não é o mesmo que "falhou" ────────
 * `nao-se-aplica` é o segundo caixa: não existe backup a fazer, e isso está
 * certo. `falhou` é uma máquina que TEM dados e não conseguiu guardá-los —
 * a atualização segue assim mesmo (a política já era essa), mas o lojista
 * precisa ver, senão fica sem rede de proteção sem nunca saber.
 */

/** O que aconteceu com o backup antes de instalar a atualização. */
export type ResultadoPreUpdate =
  | { estado: 'feito' }
  | { estado: 'nao-se-aplica' }
  | { estado: 'falhou'; erro: string }

/**
 * Quem sabe fazer backup nesta máquina — se é que alguém sabe.
 *
 * `disponivel()` existe para poder perguntar antes em vez de descobrir por
 * exceção. É a diferença entre "não há o que fazer aqui" e "deu errado".
 */
export interface FonteBackup {
  disponivel(): boolean
  executar(): Promise<{ sucesso: boolean; erro?: string }>
}

/**
 * Roda o backup pré-atualização e devolve o que aconteceu.
 *
 * Engole qualquer exceção de propósito: o valor de devolta é a única saída
 * daqui. Quem chama está a uma linha de fechar o app para instalar e não tem
 * como tratar um `throw`.
 */
export async function executarBackupPreUpdateCom(
  fonte: FonteBackup
): Promise<ResultadoPreUpdate> {
  try {
    if (!fonte.disponivel()) {
      return { estado: 'nao-se-aplica' }
    }
    const resultado = await fonte.executar()
    if (resultado.sucesso) {
      return { estado: 'feito' }
    }
    return { estado: 'falhou', erro: resultado.erro ?? 'Motivo não informado.' }
  } catch (err) {
    return { estado: 'falhou', erro: (err as Error)?.message ?? String(err) }
  }
}

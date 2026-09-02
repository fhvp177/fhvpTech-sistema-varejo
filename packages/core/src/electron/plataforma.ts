/**
 * De onde o núcleo tira os fatos da máquina onde está rodando.
 *
 * ── O problema ───────────────────────────────────────────────────────────────
 * O núcleo precisava de três coisas do Electron: a pasta de dados, a pasta
 * temporária e a versão do app. Buscava direto, com `import { app } from
 * 'electron'` no topo de cinco arquivos.
 *
 * Isso amarra o núcleo ao Electron por um motivo pequeno demais. Um `import` de
 * 'electron' não falha só na hora de usar — ele falha na hora de CARREGAR o
 * arquivo, num processo Node comum. Ou seja: bastava um desses cinco arquivos
 * na cadeia de imports para o núcleo inteiro se recusar a rodar fora de uma
 * janela do Electron.
 *
 * O núcleo já resolvia esse mesmo problema em dois lugares — `configurarNucleo`
 * para schema e migrations, `PonteIpc` para o `ipcMain`. Este módulo é a
 * terceira aplicação da mesma ideia: quem sabe responder é quem chama, e o
 * núcleo só declara o que precisa saber.
 *
 * ── Por que FUNÇÕES, e não valores ───────────────────────────────────────────
 * Repare que `Plataforma` pede funções, não strings. Não é preciosismo: é a
 * defesa contra o pior bug que este arquivo poderia causar.
 *
 * O app resolve qual pasta de dados usar no boot — e pode RENOMEAR a pasta no
 * caminho, por causa da migração de marca de 2026. Só depois disso ele chama
 * `app.setPath('userData', ...)`. Se a plataforma guardasse o valor lido no
 * momento da configuração, uma ordem de chamada infeliz congelaria o caminho
 * errado, e a loja abriria com o banco vazio pedindo licença do zero.
 *
 * Guardando a função, quem responde continua sendo o `app` — na hora da
 * pergunta, com o `setPath` já aplicado. A ordem de configuração deixa de
 * importar, e o incidente que custou uma noite de forense em julho não tem por
 * onde voltar.
 */

/** Os fatos da máquina que o núcleo não tem como descobrir sozinho. */
export interface Plataforma {
  /** Onde ficam banco, licença, backups e configuração desta instalação. */
  pastaDados: () => string
  /** Pasta descartável para arquivo intermediário (backup, restauração). */
  pastaTemp: () => string
  /** Versão do app, como aparece para o usuário. */
  versao: () => string
}

let plataforma: Plataforma | null = null

/**
 * Liga o núcleo à máquina. Chamado UMA vez no boot de cada app, antes de abrir
 * banco ou backup.
 *
 * No Electron, as três funções repassam para o `app`. Num servidor, vêm de
 * variável de ambiente. O núcleo não distingue os dois casos, que é o ponto.
 */
export function configurarPlataforma(p: Plataforma): void {
  plataforma = p
}

function exigir(): Plataforma {
  if (!plataforma) {
    throw new Error(
      'Plataforma não configurada: chame configurarPlataforma() no boot antes de usar banco/backup/licença.'
    )
  }
  return plataforma
}

/** Pasta de dados desta instalação. */
export function pastaDados(): string {
  return exigir().pastaDados()
}

/** Pasta temporária do sistema. */
export function pastaTemp(): string {
  return exigir().pastaTemp()
}

/** Versão do app. */
export function versaoApp(): string {
  return exigir().versao()
}

/** Só para teste: devolve o módulo ao estado inicial entre casos. */
export function limparPlataforma(): void {
  plataforma = null
}

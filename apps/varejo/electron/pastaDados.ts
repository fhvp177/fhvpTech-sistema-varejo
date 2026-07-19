import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gravarConfig, lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { corrigirCaminhosBackup, resolverPastaDadosEm } from './pastaDadosLogica'

// Resolve qual pasta de dados (userData) o app deve usar no boot — e, desde a
// migração de marca, renomeia a pasta legada pro nome oficial ("FHVP Tech
// Varejo") quando dá pra fazer isso com segurança.
//
// Contexto do bug que a resolução conserta: até a 1.11.0 o Electron gravava em
// `%APPDATA%\sistema-rt` (o `name` do pacote). A 1.11.1 fixou o userData em
// "Sistema RT" achando que era esse o nome antigo — mas não era. Resultado:
// máquinas que pulavam de uma versão antiga direto pra 1.11.1+ passavam a abrir
// "Sistema RT" (vazia) e pareciam ter perdido tudo (pediam licença do zero).
// Por isso a regra de ouro daqui: quem manda é a pasta que TEM dados, e a
// migração de nome é um rename atômico (nunca cópia) com fallback pra pasta
// legada se o Windows recusar. A lógica e os cenários estão em
// pastaDadosLogica.ts, com testes em __tests__/pastaDadosLogica.test.ts.
//
// Atenção pro par com os scripts de socorro (recuperar-dados.bat etc.): eles
// precisam conhecer TODOS os nomes de pasta, o oficial e os legados.

// Conta registros "de negócio" num banco candidato. Banco ausente, ilegível ou
// recém-criado (sem produtos/clientes/vendas) conta 0 = "sem dados".
function contarRegistros(caminhoBanco: string): number {
  try {
    const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
    try {
      const r = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM produtos)
                + (SELECT COUNT(*) FROM clientes)
                + (SELECT COUNT(*) FROM vendas) AS n`
        )
        .get() as { n: number } | undefined
      return r?.n ?? 0
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

// boot.log: uma linha por decisão de boot (versão, pasta eleita, rename,
// correções de config), gravado DENTRO da pasta de dados — assim ele viaja
// junto num rename e conta a história completa da máquina. Diagnóstico
// pós-fato de migração; nasceu do incidente de 2026-07-18 em que reconstruir
// "quem abriu qual pasta e quando" custou uma noite de forense.
const MAX_LINHAS_BOOT_LOG = 400

// Nunca pode derrubar o boot: qualquer erro aqui é engolido.
function registrarBootLog(pasta: string, linhas: string[]): void {
  if (linhas.length === 0) return
  try {
    mkdirSync(pasta, { recursive: true })
    const arquivo = join(pasta, 'boot.log')
    const agora = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const novas = linhas.map((l) => `[${agora} UTC] ${l}`).join('\n') + '\n'
    let conteudo = (existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '') + novas
    const todas = conteudo.split('\n')
    if (todas.length > MAX_LINHAS_BOOT_LOG) {
      conteudo = todas.slice(todas.length - MAX_LINHAS_BOOT_LOG).join('\n')
    }
    writeFileSync(arquivo, conteudo)
  } catch {
    // log é diagnóstico, nunca requisito
  }
}

export function resolverPastaDados(): string {
  const linhas: string[] = [`boot v${app.getVersion()}`]
  const pasta = resolverPastaDadosEm(app.getPath('appData'), contarRegistros, (l) => linhas.push(l))
  registrarBootLog(pasta, linhas)
  return pasta
}

// Roda depois das migrations (precisa do banco aberto) e antes do
// BackupManager: conserta backup_pasta_padrao/secundaria que apontem pra pasta
// de nome legado — desta instalação (recém-renomeada) ou de outra máquina
// (banco restaurado de backup alheio traz o caminho de lá).
export function corrigirCaminhosBackupLegados(): void {
  const linhas: string[] = []
  corrigirCaminhosBackup(
    app.getPath('userData'),
    { ler: lerConfig, gravar: gravarConfig },
    (l) => linhas.push(l)
  )
  registrarBootLog(app.getPath('userData'), linhas)
}

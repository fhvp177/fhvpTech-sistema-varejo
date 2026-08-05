import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gravarConfig, lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { corrigirCaminhosBackup, resolverPastaDadosEm } from './pastaDadosLogica'

// Resolve qual pasta de dados (userData) o app deve usar no boot.
//
// A assistência nasceu com o nome definitivo ("FHVP Tech Assistencia") e nunca
// gravou em outro lugar, então aqui não há migração de nome pendente como no
// varejo — o mecanismo fica de pé só pra sobreviver a um rename futuro sem
// repetir o bug que o varejo pagou caro (o contexto está em pastaDadosLogica.ts).
//
// A regra que importa neste app é a outra: a lista de pastas candidatas tem UM
// item só, o dela. Um PC com varejo e assistência instalados jamais pode ter um
// app abrindo o banco do outro.

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
// pós-fato de migração; nasceu do incidente de 2026-07-18 no varejo, em que
// reconstruir "quem abriu qual pasta e quando" custou uma noite de forense.
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
// de dados de outra instalação — inclusive a de outro app FHVP, que é o caso
// quando o lojista restaura aqui o backup que ele tinha no varejo.
export function corrigirCaminhosBackupLegados(): void {
  const linhas: string[] = []
  corrigirCaminhosBackup(
    app.getPath('userData'),
    { ler: lerConfig, gravar: gravarConfig },
    (l) => linhas.push(l)
  )
  registrarBootLog(app.getPath('userData'), linhas)
}

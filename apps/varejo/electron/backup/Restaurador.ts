import { existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { extrairZip } from './Compactador'
import { lerConfig } from './configBackup'
import { obterBackupManager } from './BackupManager'
import { fecharBancoDeDados, inicializarBancoDeDados, obterBancoDeDados } from '../db/conexao'
import { executarMigrations } from './migrations'

const SUBPASTAS_ORDEM = [
  'manuais',
  'diarios',
  'semanais',
  'mensais',
  'automaticos',
  'por-venda',
  'pre-restauracao',
  'pre-update',
]

export type BackupDisponivel = {
  nome: string
  caminho: string
  subpasta: string
  dataModificacao: number  // timestamp em ms
  tamanhoBytes: number
}

export type ResultadoRestauracao = {
  sucesso: boolean
  erro?: string
}

export function listarBackupsDisponiveis(): BackupDisponivel[] {
  const pastaPadrao = lerConfig('backup_pasta_padrao')
  if (!pastaPadrao) return []

  const backups: BackupDisponivel[] = []

  for (const subpasta of SUBPASTAS_ORDEM) {
    const pasta = join(pastaPadrao, subpasta)
    if (!existsSync(pasta)) continue

    const arquivos = readdirSync(pasta)
      .filter((f) => f.endsWith('.zip'))
      .sort()
      .reverse() // mais recente primeiro dentro de cada subpasta

    for (const nome of arquivos) {
      const caminho = join(pasta, nome)
      try {
        const stat = statSync(caminho)
        backups.push({ nome, caminho, subpasta, dataModificacao: stat.mtimeMs, tamanhoBytes: stat.size })
      } catch {
        // arquivo inacessível — ignora
      }
    }
  }

  return backups
}

export async function restaurarBackup(caminhoZip: string): Promise<ResultadoRestauracao> {
  if (!existsSync(caminhoZip)) {
    return { sucesso: false, erro: 'Arquivo de backup não encontrado.' }
  }

  const caminhoDb = join(app.getPath('userData'), 'database.sqlite')
  const caminhoTemp = join(app.getPath('temp'), `restauracao_${Date.now()}`)

  try {
    // 1. Backup de segurança pré-restauração (proteção contra restauração mal sucedida)
    await obterBackupManager().executarBackup('pre-restauracao')

    // 2. Extrai o ZIP em pasta temporária
    const extracao = extrairZip(caminhoZip, caminhoTemp)
    if (!extracao.sucesso || !extracao.caminhoDb) {
      return { sucesso: false, erro: extracao.erro ?? 'Falha ao extrair o arquivo de backup.' }
    }

    // 3. Valida o SQLite extraído antes de sobrescrever o banco ativo
    const validacao = validarSQLite(extracao.caminhoDb)
    if (!validacao.valido) {
      return { sucesso: false, erro: `Arquivo inválido: ${validacao.motivo}` }
    }

    // 4. Fecha a conexão ativa com o banco
    fecharBancoDeDados()

    // 5. Remove arquivos WAL/SHM para evitar inconsistência ao reabrir
    for (const sufixo of ['-wal', '-shm']) {
      const arq = caminhoDb + sufixo
      if (existsSync(arq)) rmSync(arq, { force: true })
    }

    // 6. Substitui o banco pelo arquivo restaurado
    copyFileSync(extracao.caminhoDb, caminhoDb)

    // 7. Reabre o banco e re-executa migrations (garante schema atualizado)
    inicializarBancoDeDados()
    executarMigrations(obterBancoDeDados())

    return { sucesso: true }
  } catch (err) {
    // Garante que o banco seja reaberto mesmo em caso de erro parcial
    try { inicializarBancoDeDados() } catch { /* ignora */ }
    return { sucesso: false, erro: (err as Error).message }
  } finally {
    if (existsSync(caminhoTemp)) rmSync(caminhoTemp, { recursive: true, force: true })
  }
}

function validarSQLite(caminho: string): { valido: boolean; motivo?: string } {
  let db: Database.Database | null = null
  try {
    db = new Database(caminho, { readonly: true })
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const nomes = new Set(tabelas.map((t) => t.name))
    for (const tabela of ['produtos', 'clientes', 'vendas', 'config']) {
      if (!nomes.has(tabela)) {
        return { valido: false, motivo: `Tabela obrigatória "${tabela}" não encontrada.` }
      }
    }
    return { valido: true }
  } catch (err) {
    return { valido: false, motivo: (err as Error).message }
  } finally {
    try { db?.close() } catch { /* ignora */ }
  }
}

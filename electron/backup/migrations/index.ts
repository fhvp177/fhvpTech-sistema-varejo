import type Database from 'better-sqlite3'
import { aplicar001ModuloBackup } from './001_modulo_backup'
import { aplicar002AtivarBackup } from './002_ativar_backup'
import { aplicar003HashSenhaRestauracao } from './003_hash_senha_restauracao'
import { aplicar004ClientesCpfNascimento } from './004_clientes_cpf_nascimento'
import { aplicar005Parcelas } from './005_parcelas'
import { aplicar006ParceladoStatus } from './006_parcelado_status'
import { aplicar007ValorPago } from './007_valor_pago'
import { aplicar008ClientesPj } from './008_clientes_pj'
import { aplicar009Vendedores } from './009_vendedores'
import { aplicar010DescontoVenda } from './010_desconto_venda'
import { aplicar011AuthPin } from './011_auth_pin'
import { aplicar012NormalizarAutoLock } from './012_normalizar_auto_lock'
import { aplicar013VendedoresAuth } from './013_vendedores_auth'
import { aplicar014TetoDesconto } from './014_teto_desconto'
import { aplicar015CleanupPinLegado } from './015_cleanup_pin_legado'

type Migration = {
  nome: string
  aplicar: (db: Database.Database) => void
}

const MIGRATIONS: Migration[] = [
  { nome: '001_modulo_backup', aplicar: aplicar001ModuloBackup },
  { nome: '002_ativar_backup', aplicar: aplicar002AtivarBackup },
  { nome: '003_hash_senha_restauracao', aplicar: aplicar003HashSenhaRestauracao },
  { nome: '004_clientes_cpf_nascimento', aplicar: aplicar004ClientesCpfNascimento },
  { nome: '005_parcelas', aplicar: aplicar005Parcelas },
  { nome: '006_parcelado_status', aplicar: aplicar006ParceladoStatus },
  { nome: '007_valor_pago', aplicar: aplicar007ValorPago },
  { nome: '008_clientes_pj', aplicar: aplicar008ClientesPj },
  { nome: '009_vendedores', aplicar: aplicar009Vendedores },
  { nome: '010_desconto_venda', aplicar: aplicar010DescontoVenda },
  { nome: '011_auth_pin', aplicar: aplicar011AuthPin },
  { nome: '012_normalizar_auto_lock', aplicar: aplicar012NormalizarAutoLock },
  { nome: '013_vendedores_auth', aplicar: aplicar013VendedoresAuth },
  { nome: '014_teto_desconto', aplicar: aplicar014TetoDesconto },
  { nome: '015_cleanup_pin_legado', aplicar: aplicar015CleanupPinLegado },
]

export function executarMigrations(db: Database.Database): void {
  // Garante que a tabela de controle existe antes de qualquer verificação
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const migration of MIGRATIONS) {
    const jaAplicada = db
      .prepare('SELECT 1 FROM _migrations WHERE nome = ?')
      .get(migration.nome)

    if (!jaAplicada) {
      console.log(`[migrations] Aplicando: ${migration.nome}`)
      migration.aplicar(db)
      console.log(`[migrations] Concluído: ${migration.nome}`)
    }
  }
}

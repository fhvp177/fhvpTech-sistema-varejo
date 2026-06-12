import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { criarZip, extrairZip, type MetadadoBackup } from '@fhvptech/core/electron/backup/Compactador'

const tmpBase = mkdtempSync(join(tmpdir(), 'compactador-test-'))

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

const metadata: MetadadoBackup = {
  versao_app: '1.0.0',
  data: '2024-03-15T14:30:00.000Z',
  tipo: 'manual',
  tamanho_db_bytes: 8192,
}

// ─── criarZip ─────────────────────────────────────────────────────────────────

describe('criarZip', () => {
  it('cria um arquivo ZIP no caminho de destino', async () => {
    const dbPath = join(tmpBase, 'db-para-zip.sqlite')
    const zipPath = join(tmpBase, 'subpasta', 'backup_test.zip')
    writeFileSync(dbPath, 'conteudo-fake-db')

    const resultado = await criarZip(dbPath, zipPath, metadata)

    expect(resultado.sucesso).toBe(true)
    expect(existsSync(zipPath)).toBe(true)
    expect(resultado.tamanhoBytes).toBeGreaterThan(0)
  })

  it('cria a pasta de destino se ela não existir', async () => {
    const dbPath = join(tmpBase, 'db2.sqlite')
    const zipPath = join(tmpBase, 'pasta-nova', 'nested', 'backup.zip')
    writeFileSync(dbPath, 'outro-conteudo')

    const resultado = await criarZip(dbPath, zipPath, metadata)

    expect(resultado.sucesso).toBe(true)
    expect(existsSync(zipPath)).toBe(true)
  })

  it('o ZIP gerado tem tamanho maior que zero', async () => {
    const dbPath = join(tmpBase, 'db-size-check.sqlite')
    const zipPath = join(tmpBase, 'size-check.zip')
    writeFileSync(dbPath, 'conteudo-qualquer')

    const resultado = await criarZip(dbPath, zipPath, metadata)

    expect(resultado.sucesso).toBe(true)
    expect(resultado.tamanhoBytes).toBeGreaterThan(0)
  })
})

// ─── extrairZip ───────────────────────────────────────────────────────────────

describe('extrairZip', () => {
  it('extrai database.sqlite e metadata.json corretamente', async () => {
    const dbPath = join(tmpBase, 'original.sqlite')
    const conteudoDb = 'SQLite format 3\x00' + 'dados-do-banco'
    writeFileSync(dbPath, conteudoDb)

    const zipPath = join(tmpBase, 'para-extrair.zip')
    await criarZip(dbPath, zipPath, metadata)

    const pastaExtracao = join(tmpBase, 'extraido')
    const resultado = extrairZip(zipPath, pastaExtracao)

    expect(resultado.sucesso).toBe(true)
    expect(resultado.caminhoDb).toBe(join(pastaExtracao, 'database.sqlite'))
    expect(existsSync(resultado.caminhoDb!)).toBe(true)
    expect(readFileSync(resultado.caminhoDb!, 'utf8')).toBe(conteudoDb)
  })

  it('retorna os metadados corretamente', async () => {
    const dbPath = join(tmpBase, 'original2.sqlite')
    writeFileSync(dbPath, 'dados')

    const zipPath = join(tmpBase, 'com-metadata.zip')
    await criarZip(dbPath, zipPath, metadata)

    const resultado = extrairZip(zipPath, join(tmpBase, 'extraido-meta'))

    expect(resultado.metadata).toMatchObject({
      versao_app: '1.0.0',
      tipo: 'manual',
      tamanho_db_bytes: 8192,
    })
    expect(resultado.metadata?.data).toBe('2024-03-15T14:30:00.000Z')
  })

  it('retorna sucesso=false para ZIP inexistente', () => {
    const resultado = extrairZip(join(tmpBase, 'fantasma.zip'), join(tmpBase, 'dest'))
    expect(resultado.sucesso).toBe(false)
    expect(resultado.erro).toBeDefined()
  })
})

// ─── round-trip ───────────────────────────────────────────────────────────────

describe('round-trip criarZip → extrairZip', () => {
  it('preserva o conteúdo do banco após compactação e extração', async () => {
    const conteudo = 'SQLite format 3\x00' + 'A'.repeat(4096)
    const dbOriginal = join(tmpBase, 'roundtrip-original.sqlite')
    writeFileSync(dbOriginal, conteudo)

    const zipPath = join(tmpBase, 'roundtrip.zip')
    const compResult = await criarZip(dbOriginal, zipPath, {
      ...metadata,
      tamanho_db_bytes: conteudo.length,
    })
    expect(compResult.sucesso).toBe(true)

    const extResult = extrairZip(zipPath, join(tmpBase, 'roundtrip-dest'))
    expect(extResult.sucesso).toBe(true)
    expect(readFileSync(extResult.caminhoDb!, 'utf8')).toBe(conteudo)
  })
})

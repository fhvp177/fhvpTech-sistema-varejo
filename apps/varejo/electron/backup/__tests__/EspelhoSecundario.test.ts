import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { espelharBackup } from '@fhvptech/core/electron/backup/EspelhoSecundario'

const tmpBase = mkdtempSync(join(tmpdir(), 'espelho-test-'))

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

function criarZipFake(pasta: string, nome: string): string {
  const caminho = join(pasta, nome)
  writeFileSync(caminho, `fake-zip-content-${nome}`)
  return caminho
}

function listarZips(pasta: string): string[] {
  if (!existsSync(pasta)) return []
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.zip'))
    .sort()
}

// ─── comportamento básico ─────────────────────────────────────────────────────

describe('espelharBackup', () => {
  it('retorna sucesso=true e não faz nada quando pastaSecundaria está vazia', () => {
    const origem = join(tmpBase, 'backup_2024-01-01_10-00-00_manual.zip')
    writeFileSync(origem, 'fake')
    const resultado = espelharBackup(origem, '', 'manuais')
    expect(resultado.sucesso).toBe(true)
  })

  it('copia o arquivo para pasta-secundaria/subpasta/', () => {
    const srcDir = mkdtempSync(join(tmpBase, 'src-'))
    const dstDir = mkdtempSync(join(tmpBase, 'dst-'))
    const zipOrigem = criarZipFake(srcDir, 'backup_2024-03-15_10-00-00_diario.zip')

    const resultado = espelharBackup(zipOrigem, dstDir, 'diarios')

    expect(resultado.sucesso).toBe(true)
    const arquivos = listarZips(join(dstDir, 'diarios'))
    expect(arquivos).toContain('backup_2024-03-15_10-00-00_diario.zip')
  })

  it('cria as pastas de destino automaticamente', () => {
    const srcDir = mkdtempSync(join(tmpBase, 'src2-'))
    const dstDir = join(tmpBase, 'novo-destino-criado')
    const zipOrigem = criarZipFake(srcDir, 'backup_2024-03-15_10-00-00_manual.zip')

    const resultado = espelharBackup(zipOrigem, dstDir, 'manuais')

    expect(resultado.sucesso).toBe(true)
    expect(existsSync(join(dstDir, 'manuais'))).toBe(true)
  })

  it('retorna sucesso=false quando o arquivo de origem não existe', () => {
    const dstDir = mkdtempSync(join(tmpBase, 'dst2-'))
    const resultado = espelharBackup(join(tmpBase, 'fantasma.zip'), dstDir, 'manuais')
    expect(resultado.sucesso).toBe(false)
    expect(resultado.erro).toBeDefined()
  })
})

// ─── FIFO na pasta secundária ─────────────────────────────────────────────────

describe('FIFO na pasta secundária', () => {
  it('mantém exatamente o limite de arquivos em automaticos (limite=5)', () => {
    const srcDir = mkdtempSync(join(tmpBase, 'fifo-src-'))
    const dstDir = mkdtempSync(join(tmpBase, 'fifo-dst-'))

    for (let i = 1; i <= 6; i++) {
      const nome = `backup_2024-01-${String(i).padStart(2, '0')}_10-00-00_automatico.zip`
      const caminho = criarZipFake(srcDir, nome)
      espelharBackup(caminho, dstDir, 'automaticos')
    }

    const arquivos = listarZips(join(dstDir, 'automaticos'))
    expect(arquivos).toHaveLength(5)
    // O mais antigo (dia 01) deve ter sido removido
    expect(arquivos[0]).toContain('2024-01-02')
  })

  it('mantém o mais recente quando excede o limite', () => {
    const srcDir = mkdtempSync(join(tmpBase, 'fifo2-src-'))
    const dstDir = mkdtempSync(join(tmpBase, 'fifo2-dst-'))

    for (let i = 1; i <= 12; i++) {
      const nome = `backup_2024-01-${String(i).padStart(2, '0')}_10-00-00_diario.zip`
      const caminho = criarZipFake(srcDir, nome)
      espelharBackup(caminho, dstDir, 'diarios')
    }

    const arquivos = listarZips(join(dstDir, 'diarios'))
    expect(arquivos).toHaveLength(7) // limite de diarios = 7
    expect(arquivos[arquivos.length - 1]).toContain('2024-01-12')
  })

  it('não remove arquivos quando ainda dentro do limite', () => {
    const srcDir = mkdtempSync(join(tmpBase, 'fifo3-src-'))
    const dstDir = mkdtempSync(join(tmpBase, 'fifo3-dst-'))

    for (let i = 1; i <= 3; i++) {
      const nome = `backup_2024-01-${String(i).padStart(2, '0')}_10-00-00_manual.zip`
      const caminho = criarZipFake(srcDir, nome)
      espelharBackup(caminho, dstDir, 'manuais')
    }

    const arquivos = listarZips(join(dstDir, 'manuais'))
    expect(arquivos).toHaveLength(3) // limite de manuais = 10
  })
})

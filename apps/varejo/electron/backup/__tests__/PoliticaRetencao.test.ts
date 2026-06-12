import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  parsearDataDoNome,
  arquivosParaDeletar,
  precisaPromocaoSemanal,
  precisaPromocaoMensal,
  aplicarPoliticaCompleta,
  type ArquivoBackup,
} from '../PoliticaRetencao'

// ─── parsearDataDoNome ────────────────────────────────────────────────────────

describe('parsearDataDoNome', () => {
  it('extrai data de um nome de arquivo válido', () => {
    const d = parsearDataDoNome('backup_2024-03-15_14-30-45_diario.zip')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
    expect(d!.getMonth()).toBe(2) // 0-indexado → março
    expect(d!.getDate()).toBe(15)
    expect(d!.getHours()).toBe(14)
    expect(d!.getMinutes()).toBe(30)
    expect(d!.getSeconds()).toBe(45)
  })

  it('extrai data corretamente para tipo manual', () => {
    const d = parsearDataDoNome('backup_2025-12-01_00-00-00_manual.zip')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2025)
    expect(d!.getMonth()).toBe(11) // dezembro
    expect(d!.getDate()).toBe(1)
  })

  it('retorna null para nome sem padrão esperado', () => {
    expect(parsearDataDoNome('database.sqlite')).toBeNull()
    expect(parsearDataDoNome('backup_incompleto.zip')).toBeNull()
    expect(parsearDataDoNome('')).toBeNull()
  })

  it('retorna null para data inválida no nome', () => {
    expect(parsearDataDoNome('backup_9999-99-99_25-61-61_diario.zip')).toBeNull()
  })
})

// ─── arquivosParaDeletar ──────────────────────────────────────────────────────

describe('arquivosParaDeletar', () => {
  const makeArquivo = (timestamp: number): ArquivoBackup => ({
    caminho: `/backups/backup_${timestamp}.zip`,
    data: new Date(timestamp),
    tamanhoBytes: 1000,
  })

  it('retorna vazio quando o número de arquivos está no limite', () => {
    const arquivos = [1000, 2000, 3000].map(makeArquivo)
    expect(arquivosParaDeletar(arquivos, 3)).toHaveLength(0)
  })

  it('retorna vazio quando abaixo do limite', () => {
    const arquivos = [1000, 2000].map(makeArquivo)
    expect(arquivosParaDeletar(arquivos, 5)).toHaveLength(0)
  })

  it('retorna os N arquivos mais antigos quando acima do limite', () => {
    const arquivos = [1000, 2000, 3000, 4000, 5000].map(makeArquivo)
    const paraDeletar = arquivosParaDeletar(arquivos, 3)
    expect(paraDeletar).toHaveLength(2)
    expect(paraDeletar[0].data.getTime()).toBe(1000) // mais antigo primeiro
    expect(paraDeletar[1].data.getTime()).toBe(2000)
  })

  it('ordena corretamente mesmo quando o input está desordenado', () => {
    const arquivos = [5000, 1000, 3000].map(makeArquivo)
    const paraDeletar = arquivosParaDeletar(arquivos, 2)
    expect(paraDeletar).toHaveLength(1)
    expect(paraDeletar[0].data.getTime()).toBe(1000)
  })
})

// ─── precisaPromocaoSemanal ───────────────────────────────────────────────────

describe('precisaPromocaoSemanal', () => {
  it('retorna true quando ultimaPromocao é null', () => {
    expect(precisaPromocaoSemanal(null, new Date('2024-03-15'))).toBe(true)
  })

  it('retorna true quando ultimaPromocao é anterior ao domingo mais recente', () => {
    // 2024-03-15 é sexta-feira → domingo mais recente = 2024-03-10
    const agora = new Date('2024-03-15')
    const ultimaPromocao = new Date('2024-03-09') // antes do domingo
    expect(precisaPromocaoSemanal(ultimaPromocao, agora)).toBe(true)
  })

  it('retorna false quando ultimaPromocao é posterior ao domingo mais recente', () => {
    // 2024-03-15 é sexta-feira → domingo mais recente = 2024-03-10
    const agora = new Date('2024-03-15')
    const ultimaPromocao = new Date('2024-03-11') // depois do domingo
    expect(precisaPromocaoSemanal(ultimaPromocao, agora)).toBe(false)
  })

  it('retorna false quando agora é domingo e ultimaPromocao é hoje', () => {
    const domingo = new Date('2024-03-10T10:00:00') // domingo
    const ultimaPromocao = new Date('2024-03-10T08:00:00')
    expect(precisaPromocaoSemanal(ultimaPromocao, domingo)).toBe(false)
  })

  it('retorna true quando agora é domingo e ultimaPromocao é da semana passada', () => {
    const domingo = new Date('2024-03-10') // domingo
    const ultimaPromocao = new Date('2024-03-03') // domingo anterior
    expect(precisaPromocaoSemanal(ultimaPromocao, domingo)).toBe(true)
  })
})

// ─── precisaPromocaoMensal ────────────────────────────────────────────────────

describe('precisaPromocaoMensal', () => {
  it('retorna true quando ultimaPromocao é null', () => {
    expect(precisaPromocaoMensal(null, new Date('2024-03-15'))).toBe(true)
  })

  it('retorna true quando ultimaPromocao é do mês anterior', () => {
    const agora = new Date('2024-03-15')
    const ultimaPromocao = new Date('2024-02-28')
    expect(precisaPromocaoMensal(ultimaPromocao, agora)).toBe(true)
  })

  it('retorna false quando ultimaPromocao é deste mês', () => {
    // Usa construtor local (não ISO string) para evitar diferença UTC vs local
    const agora = new Date(2024, 2, 15)       // 15/mar/2024 local
    const ultimaPromocao = new Date(2024, 2, 1) // 01/mar/2024 local
    expect(precisaPromocaoMensal(ultimaPromocao, agora)).toBe(false)
  })

  it('retorna false quando ultimaPromocao é no início do mês atual', () => {
    const agora = new Date('2024-03-31')
    const ultimaPromocao = new Date('2024-03-02')
    expect(precisaPromocaoMensal(ultimaPromocao, agora)).toBe(false)
  })

  it('retorna true quando ultimaPromocao é exatamente o 1° do mês anterior', () => {
    const agora = new Date('2024-03-15')
    const ultimaPromocao = new Date('2024-02-01')
    expect(precisaPromocaoMensal(ultimaPromocao, agora)).toBe(true)
  })
})

// ─── aplicarPoliticaCompleta (integração com sistema de arquivos) ─────────────

const tmpBase = mkdtempSync(join(tmpdir(), 'politica-test-'))
const SUBPASTAS = ['automaticos', 'diarios', 'semanais', 'mensais', 'manuais', 'pre-update', 'pre-restauracao']

function criarEstruturaPastas(base: string) {
  for (const sub of SUBPASTAS) mkdirSync(join(base, sub), { recursive: true })
}

function criarZipFake(pasta: string, nome: string, conteudo = 'fake') {
  writeFileSync(join(pasta, nome), conteudo)
}

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

describe('aplicarPoliticaCompleta', () => {
  it('retorna zeros quando as pastas estão vazias', () => {
    const base = mkdtempSync(join(tmpBase, 'vazio-'))
    criarEstruturaPastas(base)

    const resultado = aplicarPoliticaCompleta(base, {
      ultimaPromocaoSemanal: new Date(),
      ultimaPromocaoMensal: new Date(),
    })

    expect(resultado.arquivosDeletados).toBe(0)
    expect(resultado.arquivosPromovidos).toBe(0)
    expect(resultado.alertaTamanho).toBe(false)
  })

  it('remove arquivos que excedem o limite FIFO em automaticos (limite=5)', () => {
    const base = mkdtempSync(join(tmpBase, 'fifo-'))
    criarEstruturaPastas(base)
    const pasta = join(base, 'automaticos')

    // Cria 7 arquivos (limite é 5 → 2 devem ser deletados)
    for (let i = 1; i <= 7; i++) {
      const data = `2024-01-${String(i).padStart(2, '0')}`
      criarZipFake(pasta, `backup_${data}_10-00-00_automatico.zip`)
    }

    const resultado = aplicarPoliticaCompleta(base, {
      ultimaPromocaoSemanal: new Date(),
      ultimaPromocaoMensal: new Date(),
    })

    expect(resultado.arquivosDeletados).toBe(2)
  })

  it('executa promoção semanal quando necessário (diarios → semanais)', () => {
    const base = mkdtempSync(join(tmpBase, 'promocao-'))
    criarEstruturaPastas(base)

    criarZipFake(join(base, 'diarios'), 'backup_2024-03-14_10-00-00_diario.zip')

    // Simula "agora" como sexta-feira; última promoção semanal em data anterior ao domingo
    const agora = new Date('2024-03-15') // sexta
    const ultimaPromocaoSemanal = new Date('2024-03-04') // antes do domingo 2024-03-10

    const resultado = aplicarPoliticaCompleta(base, {
      ultimaPromocaoSemanal,
      ultimaPromocaoMensal: new Date(),
      agora,
    })

    expect(resultado.arquivosPromovidos).toBeGreaterThanOrEqual(1)
    expect(resultado.novaDataPromocaoSemanal).toBeDefined()
  })
})

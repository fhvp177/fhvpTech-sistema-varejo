import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('@fhvptech/core/electron/backup/configBackup')

import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { temSenhaConfigurada, verificarSenha, definirSenha } from '@fhvptech/core/electron/backup/SenhaRestauracao'

const CHAVE_HASH = 'backup_hash_senha_restauracao'

beforeEach(() => {
  vi.mocked(lerConfig).mockReset()
  vi.mocked(gravarConfig).mockReset()
  vi.mocked(lerConfig).mockReturnValue('')
})

// ─── temSenhaConfigurada ──────────────────────────────────────────────────────

describe('temSenhaConfigurada', () => {
  it('retorna false quando lerConfig devolve string vazia', () => {
    vi.mocked(lerConfig).mockReturnValue('')
    expect(temSenhaConfigurada()).toBe(false)
  })

  it('retorna true quando lerConfig devolve um hash', () => {
    vi.mocked(lerConfig).mockReturnValue('$2b$12$qualquerhash')
    expect(temSenhaConfigurada()).toBe(true)
  })
})

// ─── verificarSenha ───────────────────────────────────────────────────────────

describe('verificarSenha', () => {
  it('retorna false quando não há hash configurado', async () => {
    vi.mocked(lerConfig).mockReturnValue('')
    expect(await verificarSenha('qualquercoisa')).toBe(false)
  })

  it('retorna true para senha correta', async () => {
    const senha = 'minhasenha123'
    const hash = await bcrypt.hash(senha, 4) // rounds baixos para o teste ser rápido
    vi.mocked(lerConfig).mockReturnValue(hash)
    expect(await verificarSenha(senha)).toBe(true)
  })

  it('retorna false para senha errada', async () => {
    const hash = await bcrypt.hash('correta', 4)
    vi.mocked(lerConfig).mockReturnValue(hash)
    expect(await verificarSenha('errada')).toBe(false)
  })

  it('consulta a chave correta no configBackup', async () => {
    vi.mocked(lerConfig).mockReturnValue('')
    await verificarSenha('qualquer')
    expect(vi.mocked(lerConfig)).toHaveBeenCalledWith(CHAVE_HASH)
  })
})

// ─── definirSenha ─────────────────────────────────────────────────────────────

describe('definirSenha', () => {
  it('chama gravarConfig com a chave correta e um hash bcrypt válido', async () => {
    await definirSenha('senhaqualquer')
    expect(vi.mocked(gravarConfig)).toHaveBeenCalledOnce()
    const [chave, valor] = vi.mocked(gravarConfig).mock.calls[0]
    expect(chave).toBe(CHAVE_HASH)
    expect(valor).toMatch(/^\$2[ab]\$\d{2}\$/)
  })

  it('o hash gerado é verificável pela própria verificarSenha', async () => {
    vi.mocked(gravarConfig).mockImplementation((_, valor) => {
      vi.mocked(lerConfig).mockReturnValue(valor)
    })

    const senha = 'senhaforte456'
    await definirSenha(senha)
    expect(await verificarSenha(senha)).toBe(true)
  })

  it('senhas diferentes geram hashes diferentes', async () => {
    const hashes: string[] = []
    vi.mocked(gravarConfig).mockImplementation((_, valor) => hashes.push(valor))

    await definirSenha('senha-a')
    await definirSenha('senha-b')

    expect(hashes).toHaveLength(2)
    expect(hashes[0]).not.toBe(hashes[1])
  })
})

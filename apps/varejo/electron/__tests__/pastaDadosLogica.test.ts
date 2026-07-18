/**
 * Testes da resolução/migração da pasta de dados (pastaDadosLogica.ts).
 *
 * O leitor de banco real (better-sqlite3, em pastaDados.ts) é um addon nativo
 * compilado pro Electron e não carrega no runtime dos testes (Node) — ver a
 * nota em backup/__tests__/migrations.test.ts. Aqui usamos o node:sqlite do
 * próprio Node 22 como gêmeo do contador (mesma query, mesma semântica de
 * erro→0), em cima de pastas e bancos SQLite REAIS em diretório temporário —
 * inclusive o cenário de rename com o banco aberto por outra conexão, que é
 * como uma instância antiga do app trava a migração no Windows.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  corrigirCaminhosBackup,
  resolverPastaDadosEm,
  type ConfigStore,
  type ContadorRegistros,
} from '../pastaDadosLogica'

const OFICIAL = 'FHVP Tech Varejo'

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pasta-dados-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

// Gêmeo node:sqlite do contarRegistros de produção: mesma query, e qualquer
// erro (arquivo ausente/ilegível/sem as tabelas) conta como 0.
const contar: ContadorRegistros = (caminhoBanco) => {
  try {
    const db = new DatabaseSync(caminhoBanco, { readOnly: true })
    try {
      const r = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM produtos)
                + (SELECT COUNT(*) FROM clientes)
                + (SELECT COUNT(*) FROM vendas) AS n`
        )
        .get() as { n: number | bigint } | undefined
      return Number(r?.n ?? 0)
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

// Cria uma pasta de dados com banco no schema mínimo e `registros` produtos.
function criarPastaComBanco(nome: string, registros: number): string {
  const pasta = join(base, nome)
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, 'database.sqlite')
  const db = new DatabaseSync(caminho)
  db.exec(`
    CREATE TABLE produtos (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE clientes (id INTEGER PRIMARY KEY);
    CREATE TABLE vendas (id INTEGER PRIMARY KEY);
  `)
  const ins = db.prepare('INSERT INTO produtos (nome) VALUES (?)')
  for (let i = 0; i < registros; i++) ins.run(`p${i}`)
  db.close()
  return pasta
}

function definirMtime(pasta: string, epocaSegundos: number): void {
  utimesSync(join(pasta, 'database.sqlite'), epocaSegundos, epocaSegundos)
}

describe('resolverPastaDadosEm — instalação nova', () => {
  it('sem nenhuma pasta, aponta pro nome oficial', () => {
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })

  it('não cria a pasta (isso é papel do Electron depois)', () => {
    resolverPastaDadosEm(base, contar)
    expect(existsSync(join(base, OFICIAL))).toBe(false)
  })

  it('pasta legada existe mas com banco VAZIO (0 registros de negócio) → instalação nova', () => {
    criarPastaComBanco('Sistema RT', 0)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })

  it('pasta legada existe mas o arquivo de banco é ilegível → instalação nova', () => {
    const pasta = join(base, 'Sistema RT')
    mkdirSync(pasta)
    writeFileSync(join(pasta, 'database.sqlite'), 'isto não é um sqlite')
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })

  it('contador que lança não trava o boot → cai no oficial', () => {
    criarPastaComBanco('Sistema RT', 5)
    const explosivo: ContadorRegistros = () => {
      throw new Error('boom')
    }
    expect(resolverPastaDadosEm(base, explosivo)).toBe(join(base, OFICIAL))
  })
})

describe('resolverPastaDadosEm — migração do nome legado', () => {
  it('renomeia "Sistema RT" com dados pro nome oficial', () => {
    criarPastaComBanco('Sistema RT', 10)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(existsSync(join(base, 'Sistema RT'))).toBe(false)
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(10)
  })

  it('renomeia "sistema-rt" (o nome pré-1.11.1) também', () => {
    criarPastaComBanco('sistema-rt', 7)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(existsSync(join(base, 'sistema-rt'))).toBe(false)
  })

  it('leva TUDO junto: licença, heartbeat e os zips de backup, byte a byte', () => {
    const pasta = criarPastaComBanco('Sistema RT', 3)
    writeFileSync(join(pasta, 'licenca.lic'), 'licenca-do-cliente')
    mkdirSync(join(pasta, 'Backups', 'manuais'), { recursive: true })
    writeFileSync(join(pasta, 'Backups', 'manuais', 'backup_x_manual.zip'), 'zip-fake')

    resolverPastaDadosEm(base, contar)

    const nova = join(base, OFICIAL)
    expect(readFileSync(join(nova, 'licenca.lic'), 'utf8')).toBe('licenca-do-cliente')
    expect(readFileSync(join(nova, 'Backups', 'manuais', 'backup_x_manual.zip'), 'utf8')).toBe('zip-fake')
  })

  it('é idempotente: o boot seguinte só devolve a oficial, sem mexer em nada', () => {
    criarPastaComBanco('Sistema RT', 10)
    resolverPastaDadosEm(base, contar)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(10)
  })

  it('com duas legadas com dados, migra a de uso mais recente e preserva a relíquia', () => {
    const antiga = criarPastaComBanco('sistema-rt', 50)
    const ativa = criarPastaComBanco('Sistema RT', 99)
    definirMtime(antiga, 1_000_000)
    definirMtime(ativa, 2_000_000)

    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(99)
    // A relíquia fica onde está (nunca apagamos nada)…
    expect(contar(join(base, 'sistema-rt', 'database.sqlite'))).toBe(50)
    // …e o boot seguinte continua elegendo a oficial (mtime dela é o mais novo).
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })
})

describe('resolverPastaDadosEm — quando NÃO pode migrar', () => {
  it.runIf(process.platform === 'win32')(
    'banco aberto por outra conexão (instância antiga rodando): fica na legada, dados intactos',
    () => {
      const pasta = criarPastaComBanco('Sistema RT', 10)
      // Conexão aberta segura o arquivo — o Windows recusa renomear a pasta.
      const trava = new DatabaseSync(join(pasta, 'database.sqlite'))
      try {
        expect(resolverPastaDadosEm(base, contar)).toBe(pasta)
        expect(existsSync(join(base, OFICIAL))).toBe(false)
      } finally {
        trava.close()
      }
      // Com a "instância antiga" fechada, o boot seguinte migra normalmente.
      expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
      expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(10)
    }
  )

  it('se a pasta oficial já existe (mesmo sem dados), não renomeia nem apaga nada', () => {
    criarPastaComBanco('Sistema RT', 10)
    mkdirSync(join(base, OFICIAL))
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, 'Sistema RT'))
    expect(existsSync(join(base, OFICIAL))).toBe(true)
    expect(contar(join(base, 'Sistema RT', 'database.sqlite'))).toBe(10)
  })

  it('oficial e legada com dados: vence a de uso mais recente, sem rename', () => {
    const legada = criarPastaComBanco('Sistema RT', 50)
    const oficial = criarPastaComBanco(OFICIAL, 99)
    definirMtime(legada, 1_000_000)
    definirMtime(oficial, 2_000_000)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    // Invertendo (legada mais recente — ex.: alguém reinstalou versão velha e
    // vendeu nela), vence a legada e nada é renomeado nem apagado.
    definirMtime(legada, 3_000_000)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, 'Sistema RT'))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(99)
  })
})

describe('corrigirCaminhosBackup', () => {
  let gravadas: Array<[string, string]>
  let valores: Map<string, string>

  const config: ConfigStore = {
    ler: (chave) => valores.get(chave) ?? '',
    gravar: (chave, valor) => {
      valores.set(chave, valor)
      gravadas.push([chave, valor])
    },
  }

  beforeEach(() => {
    gravadas = []
    valores = new Map()
  })

  it('userData ainda legado (rename falhou): não toca em nada', () => {
    valores.set('backup_pasta_padrao', join(base, 'Sistema RT', 'Backups'))
    corrigirCaminhosBackup(join(base, 'Sistema RT'), config)
    expect(gravadas).toEqual([])
  })

  it('padrao apontando pra legada da mesma base → vira o Backups da oficial', () => {
    valores.set('backup_pasta_padrao', join(base, 'Sistema RT', 'Backups'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_padrao')).toBe(join(base, OFICIAL, 'Backups'))
  })

  it('padrao de OUTRA máquina (banco restaurado de backup alheio) → vira o desta', () => {
    valores.set('backup_pasta_padrao', 'C:\\Users\\outra-pessoa\\AppData\\Roaming\\Sistema RT\\Backups')
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_padrao')).toBe(join(base, OFICIAL, 'Backups'))
  })

  it('padrao de outra máquina JÁ no nome oficial → também vira o desta', () => {
    valores.set('backup_pasta_padrao', `C:\\Users\\outra-pessoa\\AppData\\Roaming\\${OFICIAL}\\Backups`)
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_padrao')).toBe(join(base, OFICIAL, 'Backups'))
  })

  it('padrao já correto: nenhuma gravação', () => {
    valores.set('backup_pasta_padrao', join(base, OFICIAL, 'Backups'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('padrao vazio: nenhuma gravação (o BackupManager semeia)', () => {
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('padrao fora do formato de default (não termina em <pasta-do-app>\\Backups): intocado', () => {
    valores.set('backup_pasta_padrao', 'D:\\MeusBackups')
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('secundaria DENTRO da legada da mesma base → prefixo reescrito preservando o resto', () => {
    valores.set('backup_pasta_secundaria', join(base, 'Sistema RT', 'Backups', 'espelho'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_secundaria')).toBe(join(base, OFICIAL, 'Backups', 'espelho'))
  })

  it('secundaria em disco externo (escolha do lojista): intocada', () => {
    valores.set('backup_pasta_secundaria', 'E:\\Espelho GN')
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('secundaria com caminho legado de OUTRA base: intocada (pode ser um disco que não está plugado)', () => {
    valores.set('backup_pasta_secundaria', 'F:\\backup-antigo\\Sistema RT\\algo')
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('secundaria exatamente igual à pasta legada → vira a oficial', () => {
    valores.set('backup_pasta_secundaria', join(base, 'sistema-rt'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_secundaria')).toBe(join(base, OFICIAL))
  })
})

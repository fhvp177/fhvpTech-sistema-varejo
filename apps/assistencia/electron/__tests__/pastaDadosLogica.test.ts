/**
 * Testes da resolução da pasta de dados (pastaDadosLogica.ts).
 *
 * O leitor de banco real (better-sqlite3, em pastaDados.ts) é um addon nativo
 * compilado pro Electron e não carrega no runtime dos testes (Node) — ver a
 * nota em backup/__tests__/migrations.test.ts. Aqui usamos o node:sqlite do
 * próprio Node 22 como gêmeo do contador (mesma query, mesma semântica de
 * erro→0), em cima de pastas e bancos SQLite REAIS em diretório temporário.
 *
 * DIFERENÇA PRO VAREJO: lá o assunto destes testes é a MIGRAÇÃO de nome de
 * pasta ("Sistema RT" → "FHVP Tech Varejo"), porque o varejo carrega esse
 * legado. A assistência nasceu com o nome definitivo e tem `PASTAS_LEGADAS`
 * vazia, então aqui não há rename a exercitar — o que precisa de prova é o
 * contrário: que este app NUNCA eleja a pasta de outro app FHVP instalado na
 * mesma máquina, por mais cheia de dados que ela esteja.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  corrigirCaminhosBackup,
  resolverPastaDadosEm,
  type ConfigStore,
  type ContadorRegistros,
} from '../pastaDadosLogica'

const OFICIAL = 'FHVP Tech Assistencia'
// As pastas dos outros apps FHVP que podem coexistir na mesma máquina.
const PASTA_VAREJO = 'FHVP Tech Varejo'
const PASTA_VAREJO_ANTIGA = 'Sistema RT'

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pasta-dados-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

/**
 * O `node:sqlite` aceita opções no construtor desde o Node 22 — que é o Node
 * usado aqui —, mas o `@types/node` do monorepo ainda está na linha 20, anterior
 * a esse módulo. Os tipos é que estão atrasados, não o código.
 *
 * A afirmação abaixo é sobre a DECLARAÇÃO, não sobre comportamento. Tirar o
 * `readOnly` faria o gêmeo CRIAR o arquivo quando ele não existe, e é
 * justamente o caso "banco ausente conta como zero" que estes testes cobrem.
 *
 * Some sozinha quando o `@types/node` da raiz subir para a linha 22.
 */
const AbrirBancoSomenteLeitura = DatabaseSync as unknown as new (
  caminho: string,
  opcoes?: { readOnly?: boolean }
) => DatabaseSync

// Gêmeo node:sqlite do contarRegistros de produção: mesma query, e qualquer
// erro (arquivo ausente/ilegível/sem as tabelas) conta como 0.
const contar: ContadorRegistros = (caminhoBanco) => {
  try {
    const db = new AbrirBancoSomenteLeitura(caminhoBanco, { readOnly: true })
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

  it('pasta oficial existe mas com banco VAZIO (0 registros de negócio) → instalação nova', () => {
    criarPastaComBanco(OFICIAL, 0)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })

  it('pasta oficial existe mas o arquivo de banco é ilegível → instalação nova', () => {
    const pasta = join(base, OFICIAL)
    mkdirSync(pasta)
    writeFileSync(join(pasta, 'database.sqlite'), 'isto não é um sqlite')
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
  })

  it('contador que lança não trava o boot → cai no oficial', () => {
    criarPastaComBanco(OFICIAL, 5)
    const explosivo: ContadorRegistros = () => {
      throw new Error('boom')
    }
    expect(resolverPastaDadosEm(base, explosivo)).toBe(join(base, OFICIAL))
  })
})

describe('resolverPastaDadosEm — pasta própria', () => {
  it('oficial com dados é eleita', () => {
    criarPastaComBanco(OFICIAL, 12)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(12)
  })

  it('é idempotente: chamar de novo devolve a mesma pasta e não mexe em nada', () => {
    criarPastaComBanco(OFICIAL, 8)
    resolverPastaDadosEm(base, contar)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(8)
  })
})

// ─── O grupo que justifica este arquivo existir na assistência ───────────────
describe('resolverPastaDadosEm — isolamento entre apps FHVP', () => {
  // ⚠️ Estes dois casos precisam checar a pasta do OUTRO app, não só o retorno.
  // Se o isolamento quebrar, o resolvedor elege a pasta do varejo e a RENOMEIA
  // pro nome oficial — e aí ele devolve o caminho oficial do mesmo jeito. Só
  // olhando o valor de retorno, o teste passaria com o estrago já feito.
  it('IGNORA a pasta do varejo cheia de dados e trata como instalação nova', () => {
    criarPastaComBanco(PASTA_VAREJO, 40)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, PASTA_VAREJO, 'database.sqlite'))).toBe(40)
  })

  it('IGNORA também o nome antigo do varejo ("Sistema RT")', () => {
    criarPastaComBanco(PASTA_VAREJO_ANTIGA, 40)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, PASTA_VAREJO_ANTIGA, 'database.sqlite'))).toBe(40)
  })

  it('NUNCA renomeia a pasta do varejo — os dados dele ficam onde estão', () => {
    criarPastaComBanco(PASTA_VAREJO, 40)
    resolverPastaDadosEm(base, contar)
    expect(existsSync(join(base, PASTA_VAREJO))).toBe(true)
    expect(contar(join(base, PASTA_VAREJO, 'database.sqlite'))).toBe(40)
    expect(existsSync(join(base, OFICIAL))).toBe(false)
  })

  it('com o varejo MAIS recente e mais cheio, ainda assim vence a pasta própria', () => {
    const varejo = criarPastaComBanco(PASTA_VAREJO, 40)
    const propria = criarPastaComBanco(OFICIAL, 2)
    definirMtime(propria, 1_000_000)
    definirMtime(varejo, 9_000_000)
    expect(resolverPastaDadosEm(base, contar)).toBe(join(base, OFICIAL))
    expect(contar(join(base, OFICIAL, 'database.sqlite'))).toBe(2)
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

  it('userData que não é a pasta oficial: não toca em nada', () => {
    valores.set('backup_pasta_padrao', join(base, PASTA_VAREJO, 'Backups'))
    corrigirCaminhosBackup(join(base, PASTA_VAREJO), config)
    expect(gravadas).toEqual([])
  })

  // O cenário real: o lojista restaurou aqui o backup que ele tinha no varejo.
  it('padrao herdado do VAREJO (backup restaurado) → vira o Backups desta pasta', () => {
    valores.set('backup_pasta_padrao', join(base, PASTA_VAREJO, 'Backups'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_padrao')).toBe(join(base, OFICIAL, 'Backups'))
  })

  it('padrao herdado do nome antigo do varejo também é corrigido', () => {
    valores.set('backup_pasta_padrao', join(base, PASTA_VAREJO_ANTIGA, 'Backups'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_padrao')).toBe(join(base, OFICIAL, 'Backups'))
  })

  it('padrao de OUTRA máquina (backup alheio) → vira o desta', () => {
    valores.set(
      'backup_pasta_padrao',
      `C:\\Users\\outra-pessoa\\AppData\\Roaming\\${OFICIAL}\\Backups`
    )
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

  it('secundaria DENTRO da pasta do varejo na mesma base → prefixo reescrito', () => {
    valores.set('backup_pasta_secundaria', join(base, PASTA_VAREJO, 'Backups', 'espelho'))
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(valores.get('backup_pasta_secundaria')).toBe(join(base, OFICIAL, 'Backups', 'espelho'))
  })

  it('secundaria em disco externo (escolha do lojista): intocada', () => {
    valores.set('backup_pasta_secundaria', 'E:\\Espelho da assistencia')
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })

  it('secundaria com caminho de OUTRA base: intocada (pode ser um disco não plugado)', () => {
    valores.set('backup_pasta_secundaria', `F:\\backup-antigo\\${PASTA_VAREJO}\\algo`)
    corrigirCaminhosBackup(join(base, OFICIAL), config)
    expect(gravadas).toEqual([])
  })
})

describe('log de boot (eventos emitidos pro boot.log)', () => {
  let linhas: string[]
  const log = (l: string) => linhas.push(l)

  beforeEach(() => {
    linhas = []
  })

  it('instalação nova é registrada', () => {
    resolverPastaDadosEm(base, contar, log)
    expect(linhas.join('\n')).toContain('instalação nova')
  })

  it('oficial com dados eleita direto é registrada', () => {
    criarPastaComBanco(OFICIAL, 5)
    resolverPastaDadosEm(base, contar, log)
    expect(linhas.join('\n')).toContain('oficial, com dados')
  })

  it('pasta de outro app não gera evento de rename nenhum', () => {
    criarPastaComBanco(PASTA_VAREJO, 5)
    resolverPastaDadosEm(base, contar, log)
    expect(linhas.join('\n')).not.toContain('renomeada')
    expect(linhas.join('\n')).toContain('instalação nova')
  })

  it('correção de config é registrada com de/para', () => {
    const valores = new Map([['backup_pasta_padrao', join(base, PASTA_VAREJO, 'Backups')]])
    corrigirCaminhosBackup(
      join(base, OFICIAL),
      { ler: (c) => valores.get(c) ?? '', gravar: (c, v) => void valores.set(c, v) },
      log
    )
    expect(linhas.join('\n')).toContain('backup_pasta_padrao corrigida')
  })
})

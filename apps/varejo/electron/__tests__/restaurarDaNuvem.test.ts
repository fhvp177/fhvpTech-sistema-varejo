/**
 * Trazer um backup de volta da nuvem.
 *
 * ── O que mais importa aqui ─────────────────────────────────────────────────
 * A pasta de cada loja no R2 é `lojas/<clienteId>/`. Quem pede o download
 * escolhe a chave — e sem conferir o prefixo, bastaria mandar a chave de OUTRA
 * loja para trazer o banco dela para dentro desta.
 *
 * A trava de gerente não ajuda em nada nesse caso: o gerente desta loja é dono
 * legítimo AQUI e de mais nada. É a conferência do prefixo que separa uma loja
 * da outra, e por isso ela tem teste próprio.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { lerListagem } from '../../servidor/r2'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FONTE = readFileSync(join(AQUI, '..', '..', 'servidor', 'restaurarDaNuvem.ts'), 'utf8')
const SERVIDOR = readFileSync(join(AQUI, '..', '..', 'servidor', 'index.ts'), 'utf8')
const RESTAURADOR = readFileSync(
  join(AQUI, '..', '..', '..', '..', 'packages', 'core', 'src', 'electron', 'backup', 'Restaurador.ts'),
  'utf8'
)

/** Uma resposta de listagem como o R2 devolve. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Contents>
    <Key>lojas/NETO/diario/backup_2026-09-01_03-00-00_diario.zip</Key>
    <LastModified>2026-09-01T03:00:05.000Z</LastModified>
    <Size>240128</Size>
  </Contents>
  <Contents>
    <Key>lojas/NETO/pre-update/backup_2026-09-02_20-00-55_pre-update.zip</Key>
    <LastModified>2026-09-02T20:00:58.000Z</LastModified>
    <Size>238991</Size>
  </Contents>
</ListBucketResult>`

describe('lendo o que existe guardado', () => {
  it('entende a listagem que o R2 devolve', () => {
    const itens = lerListagem(XML)
    expect(itens).toHaveLength(2)
    expect(itens[0].chave).toBe('lojas/NETO/diario/backup_2026-09-01_03-00-00_diario.zip')
    expect(itens[0].tamanhoBytes).toBe(240128)
    expect(itens[1].quando).toBe('2026-09-02T20:00:58.000Z')
  })

  it('bucket vazio não é erro', () => {
    expect(lerListagem('<?xml version="1.0"?><ListBucketResult></ListBucketResult>')).toEqual([])
  })

  it('item sem chave é ignorado em vez de virar entrada torta', () => {
    const torto = XML.replace('<Key>lojas/NETO/diario/backup_2026-09-01_03-00-00_diario.zip</Key>', '')
    expect(lerListagem(torto)).toHaveLength(1)
  })
})

describe('uma loja não alcança o backup de outra', () => {
  /**
   * O modo de falha, se esta conferência sumir, não dá erro nenhum: a
   * restauração funciona e a loja passa a operar com o banco do vizinho.
   */
  it('o download confere o prefixo da própria loja', () => {
    expect(FONTE, 'sumiu a conferência de dono do arquivo').toContain(
      "const meu = `lojas/${ctx.clienteId}/`"
    )
    expect(FONTE).toContain('chave.startsWith(meu)')
    expect(FONTE).toContain('Este backup não pertence a esta loja.')
  })

  it('e a conferência vem ANTES de qualquer download', () => {
    const posConfere = FONTE.indexOf('chave.startsWith(meu)')
    const posBaixa = FONTE.indexOf('await baixarDoR2')
    expect(posConfere, 'a conferência sumiu').toBeGreaterThan(-1)
    expect(posConfere, 'conferir depois de baixar não protege nada').toBeLessThan(posBaixa)
  })

  it('o nome gravado no disco não pode escapar da pasta', () => {
    // `basename` mais uma limpeza: sem isso, uma chave com `../` escreveria
    // fora de Backups — inclusive por cima do próprio banco.
    expect(FONTE).toContain('basename(chave)')
    expect(FONTE).toMatch(/replace\(\/\[\^A-Za-z0-9\._-\]\/g, '_'\)/)
  })
})

describe('sem licença não há o que buscar', () => {
  /**
   * Máquina nova nasce com banco vazio E sem licença. Devolver lista vazia
   * pareceria "não há backup nenhum" — a pior mentira possível para quem acabou
   * de perder o disco.
   */
  it('a ausência de licença é explicada, não escondida', () => {
    expect(FONTE).toContain('Ative a licença desta loja primeiro')
  })

  it('e a falta de configuração é uma mensagem diferente', () => {
    expect(FONTE).toContain('não está configurado nesta loja')
  })
})

describe('o arquivo trazido aparece na tela de restauração', () => {
  /**
   * Baixar sem que a tela enxergue seria pior que não baixar: dá a impressão de
   * que funcionou e não há como usar o arquivo.
   */
  it('a pasta de destino está na lista que a tela varre', () => {
    expect(FONTE, 'o destino mudou de nome').toContain("SUBPASTA_DESTINO = 'da-nuvem'")
    expect(RESTAURADOR, 'a tela não varre a pasta onde o download cai').toContain("'da-nuvem'")
  })

  it('e aparece primeiro, que é onde quem acabou de baixar procura', () => {
    const lista = RESTAURADOR.slice(
      RESTAURADOR.indexOf('SUBPASTAS_ORDEM'),
      RESTAURADOR.indexOf(']', RESTAURADOR.indexOf('SUBPASTAS_ORDEM'))
    )
    expect(lista.indexOf("'da-nuvem'")).toBeLessThan(lista.indexOf("'manuais'"))
  })

  /**
   * Restaurar continua sendo a operação de sempre — mesma senha, mesma cópia de
   * segurança antes de sobrescrever. Estes canais só trazem o arquivo.
   */
  it('estes canais não restauram nada por conta própria', () => {
    expect(FONTE, 'restaurar aqui duplicaria o caminho perigoso').not.toContain('restaurarBackup')
  })
})


describe('a tela enxerga a pasta certa desta máquina', () => {
  /**
   * ── O bug que isto trava ────────────────────────────────────────────────────
   * Quem GRAVA backup usa sempre a pasta desta máquina. Quem LISTA usa
   * `backup_pasta_padrao`, que viaja DENTRO do banco.
   *
   * Um lojista que sai do aplicativo instalado para a loja hospedada traz junto
   * um caminho de Windows apontando para o computador antigo. Aqui ele não
   * existe: os backups continuam sendo feitos, certinhos, e a tela de
   * restauração lista NADA.
   *
   * Silencioso, e descoberto no dia em que a pessoa precisa restaurar. Foi
   * encontrado por acaso, num teste em que o banco tinha sido copiado de outra
   * pasta — e o mesmo aconteceria com todo cliente migrando.
   */
  it('o servidor reancora a pasta de backup na própria máquina', () => {
    expect(SERVIDOR, 'sumiu a reancoragem').toContain('function ancorarPastaDeBackup')
    expect(SERVIDOR).toContain("gravarConfig('backup_pasta_padrao', nossa)")
  })

  it('e a pasta secundária herdada é descartada', () => {
    // Espelhar num segundo disco não faz sentido num servidor, e um caminho de
    // outra máquina só produziria falha de cópia a cada backup.
    expect(SERVIDOR).toContain("gravarConfig('backup_pasta_secundaria', '')")
  })

  it('a reancoragem acontece DEPOIS das migrations', () => {
    // A tabela `config` pode ser criada por uma migration; gravar antes disso
    // não teria onde.
    const posMigrar = SERVIDOR.indexOf('executarMigrations(obterBancoDeDados()')
    const posAncorar = SERVIDOR.indexOf('ancorarPastaDeBackup()', posMigrar)
    expect(posMigrar, 'as migrations sumiram do boot').toBeGreaterThan(-1)
    expect(posAncorar, 'a reancoragem não roda depois das migrations').toBeGreaterThan(posMigrar)
  })
})

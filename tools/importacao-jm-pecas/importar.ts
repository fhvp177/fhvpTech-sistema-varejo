// Importador JM PEÇAS E ACESSORIOS (sistema "MEU SYSTEMA", Firebird 1.5) para o
// FHVP Tech Varejo. Lê o SQLite extraído fielmente do .FDB e escreve um
// database.sqlite no estado pós-boot (schema real + 30 migrations carimbadas).
//
// Decisões de mapeamento (todas apoiadas em conferência do dado, não em palpite):
//
// - VENDA A VISTA (COD_CLI 00000001) é cliente-fantasma de balcão, não vira
//   cliente: a venda entra com cliente_id NULL. Os outros 9 são reais.
// - Toda venda é à vista, sem desconto e sem cancelamento (conferido: TIP_VEN
//   sempre VAREJO, DESCONT sempre 0, STATUS sempre nulo) → status 'pago' e
//   valor_pago = total.
// - As 46 vendas cuja soma de itens não fechava com o valor pago são exatamente
//   as 46 que têm devolução, e o buraco é exatamente a soma das 57 devoluções
//   (R$ 3.847,10). O item devolvido fica na origem com QUANTID zerado mas
//   preserva VR_UNIT e QTDEVOL, então a venda ORIGINAL é reconstruível:
//   quantidade = QUANTID + QTDEVOL. Com isso a soma dos itens fecha com o total
//   nas 8.999, e as devoluções entram como devolução de verdade — que é como o
//   app registra (registrarDevolucao não mexe em total nem em valor_pago, só
//   grava o registro e repõe estoque; aqui o estoque da origem já vem líquido,
//   então não repomos nada).
// - codigo_barras = CODIGO da origem (é o EAN em 94% dos produtos; nos demais é
//   o código interno, que a loja usa em etiqueta). Como o destino exige código
//   único e há 18 repetidos, o desempate cai pro COD_PRO (único) e, se ainda
//   colidir, o produto fica sem código.
// - referencia = numérica curta 1..N (decisão do Flávio): fácil no balcão e
//   deixa proximaReferencia() seguir de N+1. O código antigo não se perde —
//   continua pesquisável como código de barras.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { criarBancoPosBoot } from './bancoBase'

const ORIGEM = process.argv[2] ?? join(process.env.USERPROFILE ?? '', 'Downloads', 'jm_pecas_meusystema.sqlite')
const DESTINO = process.argv[3] ?? join(dirname(ORIGEM), 'jm_pecas_importado', 'database.sqlite')

const DONO = 'JUCIEL'                 // escolhido pelo Flávio
const CLIENTE_BALCAO = '00000001'     // "VENDA A VISTA" — não é cliente
const MARCADOR = 'importacao_jm_pecas'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const arred2 = (n: number) => Math.round(n * 100) / 100
const texto = (v: unknown) => (v == null ? '' : String(v).trim())

/** Formata no padrão que a máscara do app espera; lixo sem dígito vira ''. */
function telefone(...valores: unknown[]): string {
  for (const v of valores) {
    const d = texto(v).replace(/\D/g, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]}.${d.slice(3, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return ''
}

/** DAT_VEN vem como data à meia-noite e a hora num campo separado. */
function dataHora(data: unknown, hora: unknown): string {
  const d = texto(data).slice(0, 10)
  const h = texto(hora).slice(0, 8)
  return h.length === 8 ? `${d} ${h}` : `${d} 00:00:00`
}

// ---------------------------------------------------------------- origem
if (!existsSync(ORIGEM)) throw new Error(`Origem não encontrada: ${ORIGEM}`)
const org = new DatabaseSync(ORIGEM, { readOnly: true })
const ler = <T>(sql: string): T[] => org.prepare(sql).all() as T[]

// ---------------------------------------------------------------- destino
mkdirSync(dirname(DESTINO), { recursive: true })
for (const sufixo of ['', '-wal', '-shm']) {
  if (existsSync(DESTINO + sufixo)) rmSync(DESTINO + sufixo, { force: true })
}
const db = criarBancoPosBoot(DESTINO)

if ((db.prepare(`SELECT COUNT(*) AS n FROM config WHERE chave = ?`).get(MARCADOR) as { n: number }).n > 0) {
  throw new Error('Este banco já recebeu a importação da JM PEÇAS.')
}

const passo = (t: string) => console.log(`\n▸ ${t}`)

db.transaction(() => {
  // ------------------------------------------------------------ fornecedores
  passo('fornecedores')
  const insForn = db.prepare(
    'INSERT INTO fornecedores (nome, cnpj, telefone, email, endereco) VALUES (?, ?, ?, ?, ?)'
  )
  const mapaForn = new Map<string, number>()
  for (const f of ler<Record<string, unknown>>(
    'SELECT * FROM FORNECEDOR ORDER BY COD_FOR'
  )) {
    const cnpj = texto(f.CNPJ).replace(/\D/g, '')
    const endereco = [texto(f.ENDEREC), texto(f.BAIRRO), texto(f.CIDADE), texto(f.ESTADO)]
      .filter(Boolean)
      .join(', ')
    const r = insForn.run(
      texto(f.FORNECE) || texto(f.RAZ_SOC),
      cnpj.length === 14 ? cnpj : null,
      telefone(f.FONE1, f.FONE2),
      texto(f.EMAIL) || null,
      endereco || null
    )
    mapaForn.set(texto(f.COD_FOR), Number(r.lastInsertRowid))
  }
  console.log(`  ${mapaForn.size} fornecedores`)

  // ------------------------------------------------------------ clientes
  passo('clientes')
  const insCli = db.prepare(
    `INSERT INTO clientes (nome, telefone, endereco, tipo_pessoa, cnpj, razao_social, data_cadastro, cpf)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const mapaCli = new Map<string, number>()
  for (const c of ler<Record<string, unknown>>(
    `SELECT * FROM CLIENTES WHERE COD_CLI <> '${CLIENTE_BALCAO}' ORDER BY COD_CLI`
  )) {
    const doc = texto(c.CPF).replace(/\D/g, '')
    const pj = doc.length === 14
    const endereco = [texto(c.ENDEREC), texto(c.BAIRRO), texto(c.CIDADE), texto(c.ESTADO)]
      .filter(Boolean)
      .join(', ')
    const r = insCli.run(
      texto(c.NOM_CLI),
      telefone(c.CELULAR, c.FONE),
      endereco || null,
      pj ? 'juridica' : 'fisica',
      pj ? doc : null,
      pj ? texto(c.NOM_CLI) : null,
      texto(c.DAT_CAD) || null,
      doc.length === 11 ? doc : null
    )
    mapaCli.set(texto(c.COD_CLI), Number(r.lastInsertRowid))
  }
  console.log(`  ${mapaCli.size} clientes (o "VENDA A VISTA" virou venda sem cliente)`)

  // ------------------------------------------------------------ vendedores
  passo('vendedores')
  const usadosEmVenda = new Set(
    ler<{ VENDEDO: string }>('SELECT DISTINCT VENDEDO FROM VENDA').map((v) => texto(v.VENDEDO))
  )
  const insVend = db.prepare(
    'INSERT INTO vendedores (nome, ativo, papel, pin_hash, email) VALUES (?, 1, ?, NULL, NULL)'
  )
  // A migration 013 já deixa um vendedor "Dono" (papel dono, sem PIN) no banco
  // recém-nascido — é ELE que o fluxo de primeiro acesso procura. Criar um
  // segundo dono deixaria o banco em estado que o app nunca produz, então
  // batizamos esse com o nome do dono real.
  const donoNascido = db
    .prepare("SELECT id FROM vendedores WHERE papel = 'dono' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined
  const renomearDono = db.prepare('UPDATE vendedores SET nome = ? WHERE id = ?')

  const mapaVend = new Map<string, number>()
  let donoBatizado = false
  const usuarios = ler<Record<string, unknown>>('SELECT * FROM USUARIO ORDER BY COD_USUARIO')
  for (const u of usuarios) {
    const cod = texto(u.COD_USUARIO)
    const nome = texto(u.USUARIO)
    const ehDono = nome.toUpperCase() === DONO
    // Entram quem vendeu (senão a venda perde o autor) e o dono escolhido.
    // As contas genéricas do sistema antigo que nunca venderam ficam de fora.
    if (!usadosEmVenda.has(cod) && !ehDono) continue
    if (ehDono && donoNascido) {
      renomearDono.run(nome, donoNascido.id)
      mapaVend.set(cod, donoNascido.id)
      donoBatizado = true
    } else {
      const r = insVend.run(nome, ehDono ? 'dono' : 'vendedor')
      mapaVend.set(cod, Number(r.lastInsertRowid))
    }
  }
  // Dono escolhido que não existe como usuário na origem: só renomeia o nascido.
  if (!donoBatizado && donoNascido) renomearDono.run(DONO, donoNascido.id)
  const donos = db.prepare("SELECT COUNT(*) AS n FROM vendedores WHERE papel = 'dono'").get() as { n: number }
  if (donos.n !== 1) throw new Error(`Precisa existir exatamente 1 dono; achei ${donos.n}.`)
  console.log(`  ${mapaVend.size} vendedores — dono: ${DONO} (sem PIN: define no 1º acesso)`)

  // ------------------------------------------------------------ produtos
  passo('produtos')
  const insProd = db.prepare(
    `INSERT INTO produtos (codigo_barras, nome, categoria, preco, custo, estoque, fornecedor_id, referencia)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  )
  const mapaProd = new Map<string, number>()
  const codigosUsados = new Set<string>()
  let semCodigo = 0
  let referencia = 0
  for (const p of ler<Record<string, unknown>>(
    'SELECT * FROM PRODUTO ORDER BY CAST(COD_PRO AS INTEGER), COD_PRO'
  )) {
    const codPro = texto(p.COD_PRO)
    // 1ª opção o código da origem (EAN na maioria); 2ª o código interno; senão
    // fica sem — codigo_barras é UNIQUE no destino e a origem tem 18 repetidos.
    let codigo: string | null = null
    for (const cand of [texto(p.CODIGO), codPro]) {
      if (cand && !codigosUsados.has(cand)) {
        codigo = cand
        codigosUsados.add(cand)
        break
      }
    }
    if (!codigo) semCodigo++
    const r = insProd.run(
      codigo,
      texto(p.NOM_PRO),
      arred2(Number(p.PRE_VEN) || 0),
      arred2(Number(p.VR_UNID) || 0),
      Math.round(Number(p.ESTOQUE) || 0),
      mapaForn.get(texto(p.COD_FOR)) ?? null,
      String(++referencia)
    )
    mapaProd.set(codPro, Number(r.lastInsertRowid))
  }
  console.log(`  ${mapaProd.size} produtos — referência 1..${referencia}, ${semCodigo} sem código de barras`)

  // ------------------------------------------------------------ vendas + itens
  passo('vendas e itens')
  const insVenda = db.prepare(
    `INSERT INTO vendas (cliente_id, data, total, status_pagamento, valor_pago, vendedor_id,
                         desconto, entrada, cancelada)
     VALUES (?, ?, ?, 'pago', ?, ?, 0, 0, 0)`
  )
  const insItem = db.prepare(
    'INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)'
  )
  const mapaVenda = new Map<string, number>()
  const mapaItem = new Map<string, number>()

  const itensPorVenda = new Map<string, Array<Record<string, unknown>>>()
  for (const it of ler<Record<string, unknown>>('SELECT * FROM VITEM_VENDA ORDER BY COD_VEN, COD_ITE')) {
    const k = texto(it.COD_VEN)
    if (!itensPorVenda.has(k)) itensPorVenda.set(k, [])
    itensPorVenda.get(k)!.push(it)
  }

  let totalItens = 0
  for (const v of ler<Record<string, unknown>>('SELECT * FROM VENDA ORDER BY DAT_VEN, HOR_VEN, COD_VEN')) {
    const codVen = texto(v.COD_VEN)
    const codCli = texto(v.COD_CLI)
    const total = arred2(Number(v.VR_PAGA) || 0)
    const r = insVenda.run(
      codCli === CLIENTE_BALCAO ? null : (mapaCli.get(codCli) ?? null),
      dataHora(v.DAT_VEN, v.HOR_VEN),
      total,
      total,
      mapaVend.get(texto(v.VENDEDO)) ?? null
    )
    const vendaId = Number(r.lastInsertRowid)
    mapaVenda.set(codVen, vendaId)

    for (const it of itensPorVenda.get(codVen) ?? []) {
      // Quantidade ORIGINAL da venda: o que ficou + o que voltou em devolução.
      const qtd = Math.round((Number(it.QUANTID) || 0) + (Number(it.QTDEVOL) || 0))
      if (qtd <= 0) continue
      const ri = insItem.run(
        vendaId,
        mapaProd.get(texto(it.COD_PRO))!,
        qtd,
        arred2(Number(it.VR_UNIT) || 0)
      )
      mapaItem.set(texto(it.COD_ITE), Number(ri.lastInsertRowid))
      totalItens++
    }
  }
  console.log(`  ${mapaVenda.size} vendas, ${totalItens} itens`)

  // ------------------------------------------------------------ devoluções
  passo('devoluções')
  const insDev = db.prepare(
    `INSERT INTO devolucoes (venda_id, data, vendedor_id, autorizado_por_id, tipo, valor_total, motivo)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`
  )
  const insItemDev = db.prepare(
    `INSERT INTO itens_devolucao (devolucao_id, item_venda_id, produto_id, quantidade,
                                  valor_unitario_devolvido, restocado)
     VALUES (?, ?, ?, ?, ?, 1)`
  )
  // Uma devolução do app pode ter vários itens; na origem cada linha é um item.
  // Agrupamos pelo evento: mesma venda, mesma data e hora.
  const grupos = new Map<string, Array<Record<string, unknown>>>()
  for (const d of ler<Record<string, unknown>>('SELECT * FROM DEVOLUCAO ORDER BY DAT_DEV, HOR_DEV, COD_DEV')) {
    const k = `${texto(d.COD_VEN)}|${texto(d.DAT_DEV)}|${texto(d.HOR_DEV)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(d)
  }
  let itensDev = 0
  for (const linhas of grupos.values()) {
    const p = linhas[0]
    const vendaId = mapaVenda.get(texto(p.COD_VEN))
    if (!vendaId) throw new Error(`Devolução aponta pra venda inexistente: ${texto(p.COD_VEN)}`)
    const valor = arred2(linhas.reduce((a, l) => a + (Number(l.VAL_DEV) || 0), 0))
    const r = insDev.run(
      vendaId,
      dataHora(p.DAT_DEV, p.HOR_DEV),
      mapaVend.get(texto(p.VENDEDO)) ?? null,
      texto(p.TIP_PAG).toUpperCase() === 'DINHEIRO' ? 'dinheiro' : 'credito',
      valor,
      'Devolução importada do sistema anterior'
    )
    const devId = Number(r.lastInsertRowid)
    for (const l of linhas) {
      const itemId = mapaItem.get(texto(l.COD_ITE))
      if (!itemId) throw new Error(`Devolução aponta pra item inexistente: ${texto(l.COD_ITE)}`)
      const qtd = Math.round(Number(l.QUANTID) || 0)
      insItemDev.run(
        devId,
        itemId,
        mapaProd.get(texto(l.COD_PRO))!,
        qtd,
        arred2((Number(l.VAL_DEV) || 0) / (qtd || 1))
      )
      itensDev++
    }
  }
  console.log(`  ${grupos.size} devoluções, ${itensDev} itens devolvidos`)

  // ------------------------------------------------------------ identidade da loja
  passo('identidade da loja')
  const emp = ler<Record<string, unknown>>('SELECT * FROM EMPRESA')[0] ?? {}
  const cep = texto(emp.CEPS).replace(/\D/g, '')
  const gravar = db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)')
  const identidade: Array<[string, string]> = [
    ['loja_nome', texto(emp.NFANTAS)],
    ['loja_razao_social', ''], // na origem esse campo guarda o nome do software, não da loja
    ['loja_cnpj', texto(emp.CNPJ)],
    ['loja_endereco', [texto(emp.ENDEREC), texto(emp.BAIRRO)].filter(Boolean).join(' - ')],
    ['loja_cidade', texto(emp.CIDADE).replace(/\s*-\s*[A-Z]{2}$/, '')],
    ['loja_uf', texto(emp.ESTADO)],
    ['loja_cep', cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : ''],
    ['loja_telefone', telefone(emp.FONE)],
    ['loja_logo', ''],
    ['loja_exibir_logo', '0'],
    ['loja_configurada', '1']
  ]
  for (const [chave, valor] of identidade) gravar.run(chave, valor)
  gravar.run(MARCADOR, new Date().toISOString())
  console.log(`  ${texto(emp.NFANTAS)} — ${texto(emp.CIDADE)}${texto(emp.CNPJ) ? '' : ' (CNPJ em branco na origem)'}`)
})()

// ---------------------------------------------------------------- auditoria
console.log('\n' + '='.repeat(64))
console.log('CONFERÊNCIA — destino x origem')
console.log('='.repeat(64))

const um = <T>(sql: string, base: DatabaseSync | typeof db = db): T =>
  (base === db ? db.prepare(sql).get() : (base as DatabaseSync).prepare(sql).get()) as T

let falhas = 0
function conferir(rotulo: string, destino: number, origem: number, tol = 0.011): void {
  const ok = Math.abs(destino - origem) <= tol
  if (!ok) falhas++
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : brl(n))
  console.log(`${ok ? 'ok  ' : 'ERRO'}  ${rotulo.padEnd(34)} destino ${fmt(destino).padStart(16)}   origem ${fmt(origem).padStart(16)}`)
}

const oNum = (sql: string) => Number(Object.values(org.prepare(sql).get() as object)[0])
const dNum = (sql: string) => Number(Object.values(db.prepare(sql).get() as object)[0])

conferir('produtos', dNum('SELECT COUNT(*) FROM produtos'), oNum('SELECT COUNT(*) FROM PRODUTO'))
conferir('estoque (soma de unidades)', dNum('SELECT SUM(estoque) FROM produtos'), oNum('SELECT SUM(ESTOQUE) FROM PRODUTO'))
conferir('estoque a custo', arred2(dNum('SELECT SUM(estoque*custo) FROM produtos')), arred2(oNum('SELECT SUM(ESTOQUE*VR_UNID) FROM PRODUTO')), 0.5)
conferir('fornecedores', dNum('SELECT COUNT(*) FROM fornecedores'), oNum('SELECT COUNT(*) FROM FORNECEDOR'))
conferir('clientes', dNum('SELECT COUNT(*) FROM clientes'), oNum(`SELECT COUNT(*) FROM CLIENTES WHERE COD_CLI <> '${CLIENTE_BALCAO}'`))
conferir('vendas', dNum('SELECT COUNT(*) FROM vendas'), oNum('SELECT COUNT(*) FROM VENDA'))
conferir('faturamento', arred2(dNum('SELECT SUM(total) FROM vendas')), arred2(oNum('SELECT SUM(VR_PAGA) FROM VENDA')), 0.5)
conferir('valor pago', arred2(dNum('SELECT SUM(valor_pago) FROM vendas')), arred2(oNum('SELECT SUM(VR_PAGA) FROM VENDA')), 0.5)
conferir('itens de venda', dNum('SELECT COUNT(*) FROM itens_venda'), oNum('SELECT COUNT(*) FROM VITEM_VENDA'))
conferir('soma dos itens', arred2(dNum('SELECT SUM(quantidade*preco_unitario) FROM itens_venda')), arred2(oNum('SELECT SUM(VR_UNIT*(QUANTID+QTDEVOL)) FROM VITEM_VENDA')), 0.5)
conferir('devoluções', dNum('SELECT COUNT(*) FROM itens_devolucao'), oNum('SELECT COUNT(*) FROM DEVOLUCAO'))
conferir('valor devolvido', arred2(dNum('SELECT SUM(valor_total) FROM devolucoes')), arred2(oNum('SELECT SUM(VAL_DEV) FROM DEVOLUCAO')), 0.5)

console.log('\n--- coerência interna do destino')
const somaItens = arred2(dNum('SELECT SUM(quantidade*preco_unitario) FROM itens_venda'))
const somaTotal = arred2(dNum('SELECT SUM(total) FROM vendas'))
console.log(`${Math.abs(somaItens - somaTotal) < 0.5 ? 'ok  ' : 'ERRO'}  soma dos itens = soma dos totais   ${brl(somaItens)} x ${brl(somaTotal)}`)
if (Math.abs(somaItens - somaTotal) >= 0.5) falhas++

const desalinhadas = dNum(`
  SELECT COUNT(*) FROM (
    SELECT v.id FROM vendas v JOIN itens_venda i ON i.venda_id = v.id
    GROUP BY v.id HAVING ABS(SUM(i.quantidade*i.preco_unitario) - v.total) > 0.011)`)
console.log(`${desalinhadas === 0 ? 'ok  ' : 'ERRO'}  vendas cujo detalhe não fecha: ${desalinhadas}`)
if (desalinhadas !== 0) falhas++

for (const [rotulo, sql] of [
  ['itens sem venda', 'SELECT COUNT(*) FROM itens_venda i LEFT JOIN vendas v ON v.id=i.venda_id WHERE v.id IS NULL'],
  ['itens sem produto', 'SELECT COUNT(*) FROM itens_venda i LEFT JOIN produtos p ON p.id=i.produto_id WHERE p.id IS NULL'],
  ['vendas sem vendedor', 'SELECT COUNT(*) FROM vendas WHERE vendedor_id IS NULL'],
  ['produtos com preço zero', 'SELECT COUNT(*) FROM produtos WHERE preco <= 0'],
  ['código de barras repetido', 'SELECT COUNT(*) FROM (SELECT codigo_barras FROM produtos WHERE codigo_barras IS NOT NULL GROUP BY 1 HAVING COUNT(*)>1)'],
  ['referência repetida', 'SELECT COUNT(*) FROM (SELECT referencia FROM produtos GROUP BY 1 HAVING COUNT(*)>1)']
] as const) {
  const n = dNum(sql)
  console.log(`${n === 0 ? 'ok  ' : 'AVISO'}  ${rotulo}: ${n}`)
}

const fk = db.prepare('PRAGMA foreign_key_check').all() as unknown[]
const integridade = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check
console.log(`${fk.length === 0 ? 'ok  ' : 'ERRO'}  foreign_key_check: ${fk.length} violações`)
console.log(`${integridade === 'ok' ? 'ok  ' : 'ERRO'}  integrity_check: ${integridade}`)
if (fk.length || integridade !== 'ok') falhas++

const migs = dNum('SELECT COUNT(*) FROM _migrations')
console.log(`${migs === 30 ? 'ok  ' : 'ERRO'}  migrations carimbadas: ${migs}/30`)
if (migs !== 30) falhas++

db.close()
org.close()

console.log(`\nbanco: ${DESTINO}  (${(statSync(DESTINO).size / 1048576).toFixed(2)} MB)`)
console.log(falhas === 0 ? '\n✔ TUDO CONFERIDO' : `\n✘ ${falhas} PROBLEMA(S) — não empacotar`)
process.exit(falhas === 0 ? 0 : 1)

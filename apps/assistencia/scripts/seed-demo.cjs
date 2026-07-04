/*
 * Seed de demonstração — popula o banco com ~3 meses de "uso" realista
 * (Abr–Jun/2026) pra deixar a dashboard cheia. NÃO é parte do app; roda à mão.
 *
 * Como rodar (com o app FECHADO — SQLite trava com o Electron aberto):
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/seed-demo.cjs
 *
 * O que faz:
 *  - APAGA dados transacionais e o catálogo de teste (vendas, itens, parcelas,
 *    devoluções, créditos, produtos, clientes). MANTÉM vendedores, categorias,
 *    licença, fornecedores, layouts.
 *  - Insere catálogo realista + clientes + vendas dia a dia, com sazonalidade
 *    (semana + pico de Dia das Mães), formas de pagamento variadas, parcelas
 *    futuras (recebível futuro), inadimplência, "vence hoje", estoque baixo,
 *    produtos parados e algumas devoluções.
 *
 * Determinístico: RNG com seed fixa, então re-rodar zera e regenera idêntico.
 */
const Database = require('better-sqlite3')
const path = require('path')

const CAMINHO = path.join(process.env.APPDATA, 'FHVP Tech Assistencia', 'database.sqlite')

// ── RNG determinístico (mulberry32) ───────────────────────────────────────────
let _seed = 0x9e3779b9
function rng() {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (min, max) => Math.floor(rng() * (max - min + 1)) + min     // inteiro [min,max]
const rf = (min, max) => rng() * (max - min) + min
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const chance = (p) => rng() < p
const round2 = (n) => Math.round(n * 100) / 100

// ── Datas (ancoradas no date('now') do próprio SQLite) ─────────────────────────
const addDaysUTC = (iso, d) => {
  const [y, m, dd] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, dd) + d * 86400000
  const x = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}`
}
const dowUTC = (iso) => {
  const [y, m, dd] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay() // 0=Dom ... 6=Sáb
}

// ── Catálogo realista ──────────────────────────────────────────────────────────
// peso = popularidade relativa na escolha de itens; slow movers ficam parados.
const PRODUTOS = [
  { nome: 'Vestido Floral Midi',        categoria: 'Roupas',     preco: 159.9, peso: 5 },
  { nome: 'Blusa de Tricô Canelada',    categoria: 'Roupas',     preco: 89.9,  peso: 5 },
  { nome: 'Calça Jeans Skinny',         categoria: 'Roupas',     preco: 139.9, peso: 6 },
  { nome: 'Camisa Social Slim',         categoria: 'Roupas',     preco: 119.9, peso: 4 },
  { nome: 'Saia Midi Plissada',         categoria: 'Roupas',     preco: 99.9,  peso: 3 },
  { nome: 'Jaqueta Jeans',              categoria: 'Roupas',     preco: 199.9, peso: 3 },
  { nome: 'Conjunto Moletom',           categoria: 'Roupas',     preco: 179.9, peso: 4 },
  { nome: 'Short Alfaiataria',          categoria: 'Roupas',     preco: 79.9,  peso: 3 },
  { nome: 'Boneca Bebê Reborn',         categoria: 'Brinquedos', preco: 249.9, peso: 2 },
  { nome: 'Carrinho de Controle Remoto',categoria: 'Brinquedos', preco: 129.9, peso: 3 },
  { nome: 'Quebra-Cabeça 500 peças',    categoria: 'Brinquedos', preco: 49.9,  peso: 3 },
  { nome: 'Pelúcia Urso 40cm',          categoria: 'Brinquedos', preco: 69.9,  peso: 4 },
  { nome: 'Jogo de Tabuleiro Família',  categoria: 'Brinquedos', preco: 89.9,  peso: 2, parado: true },
  { nome: 'Massinha de Modelar Kit',    categoria: 'Brinquedos', preco: 34.9,  peso: 3 },
  { nome: 'Perfume Floral 100ml',       categoria: 'Perfumes',   preco: 189.9, peso: 4 },
  { nome: 'Body Splash Frutal',         categoria: 'Perfumes',   preco: 59.9,  peso: 5 },
  { nome: 'Perfume Amadeirado Masc.',   categoria: 'Perfumes',   preco: 219.9, peso: 3 },
  { nome: 'Desodorante Colônia',        categoria: 'Perfumes',   preco: 44.9,  peso: 4 },
  { nome: 'Bolsa Transversal',          categoria: 'Acessórios', preco: 129.9, peso: 4 },
  { nome: 'Cinto de Couro',             categoria: 'Acessórios', preco: 69.9,  peso: 3 },
  { nome: 'Óculos de Sol',              categoria: 'Acessórios', preco: 99.9,  peso: 3 },
  { nome: 'Colar Folheado a Ouro',      categoria: 'Acessórios', preco: 79.9,  peso: 2, parado: true },
  { nome: 'Carteira Feminina',          categoria: 'Acessórios', preco: 89.9,  peso: 3 },
  { nome: 'Boné Aba Reta',              categoria: 'Acessórios', preco: 49.9,  peso: 3 },
  { nome: 'Caneca Personalizada',       categoria: 'Diversos',   preco: 39.9,  peso: 4 },
  { nome: 'Garrafa Térmica 1L',         categoria: 'Diversos',   preco: 59.9,  peso: 3 },
  { nome: 'Necessaire Estampada',       categoria: 'Diversos',   preco: 34.9,  peso: 3 },
  { nome: 'Kit Meias 3 pares',          categoria: 'Diversos',   preco: 29.9,  peso: 4 },
]

const CLIENTES = [
  'Maria Silva', 'João Santos', 'Ana Oliveira', 'Carlos Pereira', 'Juliana Costa',
  'Pedro Almeida', 'Fernanda Lima', 'Rafael Souza', 'Camila Rodrigues', 'Bruno Carvalho',
  'Patrícia Gomes', 'Lucas Martins', 'Aline Ferreira', 'Marcos Ribeiro', 'Beatriz Nascimento',
]
const telefone = () => `(11) 9${ri(1000, 9999)}-${ri(1000, 9999)}`

// ───────────────────────────────────────────────────────────────────────────────
const db = new Database(CAMINHO)
db.pragma('foreign_keys = ON')

const hoje = db.prepare("SELECT date('now') AS d").get().d // mesma base que a dashboard usa
const [hy, hm] = hoje.split('-').map(Number)
const inicio = `${hm <= 2 ? hy - 1 : hy}-${String(((hm - 3 + 12) % 12) + 1).padStart(2, '0')}-01` // 1º dia, 2 meses antes
const vendedores = db.prepare('SELECT id FROM vendedores').all().map((v) => v.id)
if (vendedores.length === 0) { console.error('Nenhum vendedor cadastrado — abortando.'); process.exit(1) }

console.log(`Banco: ${CAMINHO}`)
console.log(`Período: ${inicio} → ${hoje} | vendedores: ${vendedores.join(', ')}`)

const seed = db.transaction(() => {
  // 1) Limpa transacional + catálogo (ordem segura p/ FKs). Mantém vendedores etc.
  for (const t of ['itens_devolucao', 'creditos_cliente', 'devolucoes', 'parcelas', 'itens_venda', 'vendas', 'produtos', 'clientes']) {
    db.prepare(`DELETE FROM ${t}`).run()
  }
  db.prepare(
    `DELETE FROM sqlite_sequence WHERE name IN
     ('vendas','itens_venda','parcelas','devolucoes','itens_devolucao','creditos_cliente','produtos','clientes')`
  ).run()

  // 2) Catálogo
  const insProd = db.prepare(
    `INSERT INTO produtos (codigo_barras, nome, categoria, preco, estoque, data_cadastro)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const produtos = PRODUTOS.map((p, i) => {
    // Parados: estoque saudável (só pra não cair no card de estoque baixo).
    // ~alguns produtos com estoque baixo (1–5) pro card "Estoque baixo"; resto saudável.
    const estoque = p.parado ? ri(10, 20) : (i % 7 === 3 ? ri(1, 5) : ri(8, 45))
    const id = insProd.run(
      '78' + String(7000000000 + i),
      p.nome, p.categoria, p.preco, estoque,
      `${inicio.slice(0, 7)}-01 10:00:00`
    ).lastInsertRowid
    return { id, ...p }
  })
  // Parados ficam fora do pool de vendas → sem giro → aparecem em "Produtos parados".
  const poolPonderado = produtos.filter((p) => !p.parado).flatMap((p) => Array(p.peso).fill(p))

  const insCli = db.prepare('INSERT INTO clientes (nome, telefone, data_cadastro) VALUES (?, ?, ?)')
  const clientes = CLIENTES.map((nome) => ({
    id: insCli.run(nome, telefone(), `${inicio} 12:00:00`).lastInsertRowid,
    nome,
  }))

  // 3) Vendas
  const insVenda = db.prepare(
    `INSERT INTO vendas (cliente_id, data, total, status_pagamento, data_vencimento, num_parcelas, valor_pago, vendedor_id, desconto)
     VALUES (@cliente_id, @data, @total, @status, @venc, @nparc, @pago, @vend, @desc)`
  )
  const insItem = db.prepare(
    'INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)'
  )
  const insParc = db.prepare(
    'INSERT INTO parcelas (venda_id, numero, valor, data_vencimento, status) VALUES (?, ?, ?, ?, ?)'
  )

  const totalDias = (Date.UTC(...hoje.split('-').map((n, i) => i === 1 ? n - 1 : +n)) -
    Date.UTC(...inicio.split('-').map((n, i) => i === 1 ? n - 1 : +n))) / 86400000
  const baseDow = { 0: 0, 1: 4, 2: 4, 3: 5, 4: 5, 5: 7, 6: 9 } // Dom fechado, sobe até Sáb
  const vendasGeradas = []

  for (let d = 0; ; d++) {
    const dia = addDaysUTC(inicio, d)
    if (dia > hoje) break
    const dow = dowUTC(dia)
    let n = baseDow[dow]
    if (n === 0) continue
    const progresso = totalDias > 0 ? d / totalDias : 1
    const crescimento = 0.8 + progresso * 0.45          // tendência de alta no período
    const diaDasMaes = dia >= '2026-05-07' && dia <= '2026-05-11' ? 1.8 : 1
    n = Math.max(1, Math.round(n * crescimento * diaDasMaes * rf(0.7, 1.3)))

    for (let k = 0; k < n; k++) {
      // itens (1–4 produtos distintos, ponderados por popularidade)
      const nItens = ri(1, 4)
      const escolhidos = new Set()
      const itens = []
      let subtotal = 0
      let guard = 0
      while (itens.length < nItens && guard++ < 30) {
        const p = pick(poolPonderado)
        if (escolhidos.has(p.id)) continue
        escolhidos.add(p.id)
        const qtd = chance(0.75) ? 1 : ri(2, 3)
        itens.push({ produto_id: p.id, qtd, preco: p.preco })
        subtotal += qtd * p.preco
      }
      subtotal = round2(subtotal)
      const desconto = chance(0.15) ? round2(Math.min(subtotal * rf(0.05, 0.15), 60)) : 0
      const total = round2(subtotal - desconto)
      const hora = `${String(ri(9, 19)).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}:00`
      const vend = pick(vendedores)

      // forma de pagamento
      const roll = rng()
      let status, venc = null, nparc = null, pago = total, cliente_id = null
      if (roll < 0.62) {
        status = 'pago'
        cliente_id = chance(0.3) ? pick(clientes).id : null   // maioria à vista é "balcão"
      } else if (roll < 0.78) {
        status = 'parcelado'; cliente_id = pick(clientes).id
        nparc = ri(2, 6); pago = 0                            // parcelas tratadas abaixo
      } else {
        // a prazo simples (boleto/fiado). vence 30 dias depois.
        cliente_id = pick(clientes).id
        venc = addDaysUTC(dia, 30); pago = 0
        if (venc < hoje) {
          // já venceu: maioria pagou (atrasado), minoria virou caloteiro.
          if (chance(0.18)) status = 'inadimplente'
          else { status = 'pago'; pago = total; venc = null }
        } else {
          status = 'pendente'                                 // ainda aberto → recebível futuro
        }
      }

      const vendaId = insVenda.run({
        cliente_id, data: `${dia} ${hora}`, total, status, venc, nparc, pago, vend, desc: desconto,
      }).lastInsertRowid
      for (const it of itens) insItem.run(vendaId, it.produto_id, it.qtd, it.preco)

      if (status === 'parcelado') {
        const base = round2(total / nparc)
        const inadimplente = chance(0.15) // parte dos parcelados vira caloteiro
        let pagoAcc = 0
        let venceuStatus = 'parcelado'
        for (let i = 1; i <= nparc; i++) {
          const valor = i === nparc ? round2(total - base * (nparc - 1)) : base
          const vencP = addDaysUTC(dia, i * 30)
          let st
          if (vencP < hoje) {
            st = inadimplente ? 'inadimplente' : 'pago'
          } else {
            st = 'pendente'
          }
          if (st === 'pago') pagoAcc += valor
          if (st === 'inadimplente') venceuStatus = 'inadimplente'
          insParc.run(vendaId, i, valor, vencP, st)
        }
        db.prepare('UPDATE vendas SET valor_pago = ?, status_pagamento = ? WHERE id = ?')
          .run(round2(pagoAcc), venceuStatus, vendaId)
      }

      vendasGeradas.push({ id: vendaId, dia, cliente_id, itens, total })
    }
  }

  // 4) "Vencem hoje" — garante 2 vendas pendentes com vencimento = hoje
  for (let i = 0; i < 2; i++) {
    const cli = pick(clientes)
    const p = pick(produtos)
    const total = round2(p.preco * ri(1, 2))
    const vendaId = insVenda.run({
      cliente_id: cli.id, data: `${addDaysUTC(hoje, -ri(3, 20))} 15:00:00`,
      total, status: 'pendente', venc: hoje, nparc: null, pago: 0, vend: pick(vendedores), desc: 0,
    }).lastInsertRowid
    insItem.run(vendaId, p.id, 1, p.preco)
  }

  // 5) Devoluções (crédito na loja) — algumas vendas recentes com cliente
  const insDev = db.prepare(
    `INSERT INTO devolucoes (venda_id, data, vendedor_id, tipo, valor_total, motivo)
     VALUES (?, ?, ?, 'credito', ?, ?)`
  )
  const insItemDev = db.prepare(
    `INSERT INTO itens_devolucao (devolucao_id, item_venda_id, produto_id, quantidade, valor_unitario_devolvido, restocado)
     VALUES (?, ?, ?, ?, ?, 1)`
  )
  const insCredito = db.prepare(
    `INSERT INTO creditos_cliente (cliente_id, data, tipo, valor, devolucao_id) VALUES (?, ?, 'entrada', ?, ?)`
  )
  const motivos = ['Tamanho não serviu', 'Cliente desistiu', 'Defeito no produto', 'Cor diferente do esperado']
  const candidatas = vendasGeradas.filter((v) => v.cliente_id && v.dia >= addDaysUTC(hoje, -45) && v.itens.length > 0)
  let nDev = 0
  for (const v of candidatas) {
    if (nDev >= 5) break
    if (!chance(0.5)) continue
    const item = v.itens[0]
    const itemRow = db.prepare('SELECT id FROM itens_venda WHERE venda_id = ? AND produto_id = ? LIMIT 1')
      .get(v.id, item.produto_id)
    if (!itemRow) continue
    const valor = round2(item.preco) // devolve 1 unidade
    const dataDev = `${addDaysUTC(v.dia, ri(1, 7))} 14:00:00`
    if (dataDev.slice(0, 10) > hoje) continue
    const devId = insDev.run(v.id, dataDev, pick(vendedores), valor, pick(motivos)).lastInsertRowid
    insItemDev.run(devId, itemRow.id, item.produto_id, 1, item.preco)
    insCredito.run(v.cliente_id, dataDev, valor, devId)
    db.prepare('UPDATE produtos SET estoque = estoque + 1 WHERE id = ?').run(item.produto_id)
    nDev++
  }

  return { nVendas: vendasGeradas.length + 2, nProd: produtos.length, nCli: clientes.length, nDev }
})

const r = seed()

// ── Resumo ────────────────────────────────────────────────────────────────────
console.log('\n✅ Seed concluído.')
console.log(`  produtos: ${r.nProd} | clientes: ${r.nCli} | vendas: ${r.nVendas} | devoluções: ${r.nDev}`)
const porMes = db.prepare(
  `SELECT strftime('%Y-%m', data) mes, COUNT(*) qtd, ROUND(SUM(total),2) fat
   FROM vendas GROUP BY mes ORDER BY mes`
).all()
console.log('\n  Faturamento por mês:')
for (const m of porMes) console.log(`   ${m.mes}: ${m.qtd} vendas · R$ ${m.fat}`)
const dist = db.prepare('SELECT status_pagamento s, COUNT(*) n FROM vendas GROUP BY s').all()
console.log('\n  Formas de pagamento:', dist.map((d) => `${d.s}=${d.n}`).join(' '))
const receb = db.prepare(
  `SELECT ROUND(COALESCE(SUM(valor),0),2) t FROM parcelas
   WHERE status='pendente' AND date(data_vencimento) >= date('now')
     AND date(data_vencimento) <= date('now','+90 days')`
).get().t
console.log(`  Recebível futuro (90d, parcelas): R$ ${receb}`)
db.close()

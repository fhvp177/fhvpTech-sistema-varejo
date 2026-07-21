import { vi, describe, it, expect, beforeAll } from 'vitest'

// Teste da query que alimenta a nota fiscal, contra um SQLite DE VERDADE
// (node:sqlite por trás de um adaptador — mesmo truque do teste da 028).
//
// O que está em jogo: esta query decide o que vai declarado ao Fisco. Pegar o
// preço errado, esquecer o tamanho da variação ou trocar o código do produto
// produz uma nota que a SEFAZ autoriza e que está errada — o pior tipo de bug,
// porque não dá erro nenhum na hora.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

let banco: Adaptador | null = null

vi.mock('@fhvptech/core/electron/db/conexao', () => ({
  obterBancoDeDados: () => {
    if (!banco) throw new Error('banco de teste não inicializado')
    return banco
  }
}))

const {
  vendaParaNota,
  notaDaVenda,
  notasDasVendas,
  proximaTentativa,
  registrarNotaLocal,
  gravarFormaPagamento,
  diagnosticoFiscal,
  obterFiscalProduto,
  salvarFiscalProduto,
  listarParaClassificar,
  aplicarFiscalEmLote,
  categoriasPendentes,
  guardarXmlNota,
  obterXmlNota,
  notasDoMes,
  mesesComNotas
} = await import('../fiscal')

const SCHEMA = `
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    codigo_barras TEXT,
    referencia TEXT,
    categoria TEXT,
    preco REAL NOT NULL DEFAULT 0,
    ncm TEXT, cfop TEXT, cst_csosn TEXT, origem TEXT DEFAULT '0', unidade TEXT DEFAULT 'UN'
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tamanho TEXT,
    codigo_barras TEXT
  );
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, cpf TEXT, cnpj TEXT,
    tipo_pessoa TEXT NOT NULL DEFAULT 'fisica',
    razao_social TEXT, telefone TEXT,
    -- campos fiscais da migration 034 (destinatário da NF-e)
    endereco_logradouro TEXT, endereco_numero TEXT, endereco_complemento TEXT,
    endereco_bairro TEXT, cidade TEXT, uf TEXT, cep TEXT, codigo_municipio TEXT,
    inscricao_estadual TEXT, indicador_ie TEXT DEFAULT '9'
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    total REAL NOT NULL DEFAULT 0,
    desconto REAL NOT NULL DEFAULT 0,
    cancelada INTEGER NOT NULL DEFAULT 0,
    forma_pagamento TEXT
  );
  CREATE TABLE itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    variacao_id INTEGER,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL
  );
  CREATE TABLE nfce_emitidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    tentativa INTEGER NOT NULL DEFAULT 1,
    referencia TEXT NOT NULL UNIQUE,
    acbr_id TEXT,
    ambiente TEXT NOT NULL,
    modelo INTEGER NOT NULL DEFAULT 65,
    serie INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    chave TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    protocolo TEXT, motivo TEXT, xml TEXT,
    criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizada_em DATETIME
  );
`

beforeAll(() => {
  if (!sqlite) return
  const db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(`
    INSERT INTO produtos (id, nome, codigo_barras, referencia, preco, ncm, cfop, cst_csosn, origem, unidade)
      VALUES (1, 'Camiseta', '7891111111111', '10', 39.9, '61091000', '5102', '102', '0', 'UN'),
             (2, 'Sem classificacao', NULL, '11', 10, NULL, NULL, NULL, '0', 'UN');
    INSERT INTO produto_variacoes (id, produto_id, tamanho, codigo_barras)
      VALUES (1, 1, 'M', '7892222222222');
    INSERT INTO clientes (id, nome, cpf, tipo_pessoa) VALUES (1, 'Maria', '111.444.777-35', 'fisica');
    -- cliente PJ com cadastro fiscal completo (recebe NF-e)
    INSERT INTO clientes (id, nome, cnpj, tipo_pessoa, razao_social, telefone,
      endereco_logradouro, endereco_numero, endereco_bairro, cidade, uf, cep,
      codigo_municipio, inscricao_estadual, indicador_ie)
      VALUES (2, 'Loja do Zé', '11.444.777/0001-61', 'juridica', 'ZE COMERCIO LTDA', '1133334444',
        'Avenida Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', '01310300',
        '3550308', '123456789', '1');
    -- venda 1: com cliente, variação e desconto
    INSERT INTO vendas (id, cliente_id, total, desconto) VALUES (1, 1, 74.8, 5);
    INSERT INTO itens_venda (venda_id, produto_id, variacao_id, quantidade, preco_unitario)
      VALUES (1, 1, 1, 2, 39.9);
    -- venda 2: sem cliente (consumidor não identificado)
    INSERT INTO vendas (id, total) VALUES (2, 10);
    INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (2, 2, 1, 10);
    -- venda 3: cliente PJ (deve virar NF-e)
    INSERT INTO vendas (id, cliente_id, total) VALUES (3, 2, 250);
    INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario) VALUES (3, 1, 10, 25);
  `)
  let p = 0
  banco = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...a: unknown[]) => st.run(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...a: unknown[]) => st.get(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...a: unknown[]) => st.all(...(a as any[]))
      }
    },
    transaction:
      (fn) =>
      (...args) => {
        const sp = `sp_${p}`
        db.exec(p === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        p++
        try {
          const r = fn(...args)
          p--
          db.exec(p === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          p--
          db.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
})

describe.runIf(sqlite)('vendaParaNota', () => {
  it('traz a classificação fiscal de cada item', () => {
    const v = vendaParaNota(1)!
    expect(v.itens).toHaveLength(1)
    const i = v.itens[0]
    expect(i.ncm).toBe('61091000')
    expect(i.cfop).toBe('5102')
    expect(i.cst_csosn).toBe('102')
    expect(i.unidade).toBe('UN')
  })

  it('o nome do item leva o tamanho da variação, como no cupom', () => {
    // "Camiseta (M)" e não só "Camiseta" — a nota descreve o que o cliente
    // levou de fato.
    expect(vendaParaNota(1)!.itens[0].nome).toBe('Camiseta (M)')
  })

  it('usa o código de barras da variação quando existe', () => {
    expect(vendaParaNota(1)!.itens[0].codigo_barras).toBe('7892222222222')
  })

  it('usa o preço praticado na venda, não o preço atual do produto', () => {
    // Se o produto subir de preço amanhã, a nota da venda de hoje tem que
    // continuar com o valor cobrado na hora.
    expect(vendaParaNota(1)!.itens[0].valor_unitario).toBe(39.9)
  })

  it('traz desconto e total da venda', () => {
    const v = vendaParaNota(1)!
    expect(v.desconto).toBe(5)
    expect(v.total).toBe(74.8)
  })

  it('traz o CPF do cliente quando há um', () => {
    expect(vendaParaNota(1)!.cliente_cpf).toBe('111.444.777-35')
  })

  it('venda sem cliente vira consumidor não identificado', () => {
    const v = vendaParaNota(2)!
    expect(v.cliente_cpf).toBeNull()
    expect(v.cliente_nome).toBeNull()
  })

  it('expõe produto sem NCM como null (pra emissão barrar antes de enviar)', () => {
    expect(vendaParaNota(2)!.itens[0].ncm).toBeNull()
  })

  it('venda inexistente devolve null', () => {
    expect(vendaParaNota(999)).toBeNull()
  })
})

describe.runIf(sqlite)('destinatário — o que decide NF-e ou NFC-e', () => {
  it('cliente PJ é marcado como jurídica (vira NF-e)', () => {
    expect(vendaParaNota(3)!.cliente_tipo_pessoa).toBe('juridica')
  })

  it('cliente PF e venda sem cliente não viram NF-e', () => {
    expect(vendaParaNota(1)!.cliente_tipo_pessoa).toBe('fisica')
    expect(vendaParaNota(2)!.cliente_tipo_pessoa).toBeNull()
  })

  it('destinatário traz o endereço completo que a NF-e exige', () => {
    const d = vendaParaNota(3)!.destinatario!
    expect(d.logradouro).toBe('Avenida Paulista')
    expect(d.numero).toBe('1000')
    expect(d.bairro).toBe('Bela Vista')
    expect(d.cidade).toBe('São Paulo')
    expect(d.uf).toBe('SP')
    expect(d.codigo_municipio).toBe('3550308')
  })

  it('na nota vale a RAZÃO SOCIAL, não o apelido do cadastro', () => {
    // O lojista cadastra "Loja do Zé"; a nota tem que sair com o nome legal.
    const d = vendaParaNota(3)!.destinatario!
    expect(d.nome).toBe('ZE COMERCIO LTDA')
  })

  it('traz IE e indicador de contribuinte', () => {
    const d = vendaParaNota(3)!.destinatario!
    expect(d.inscricao_estadual).toBe('123456789')
    expect(d.indicador_ie).toBe('1') // contribuinte de ICMS
  })

  it('venda sem cliente não tem destinatário', () => {
    expect(vendaParaNota(2)!.destinatario).toBeNull()
  })

  it('cliente PF sem cadastro fiscal tem destinatário com campos vazios', () => {
    // Existe (tem nome), mas sem endereço — o que é normal: PF recebe NFC-e,
    // que não exige nada disso.
    const d = vendaParaNota(1)!.destinatario!
    expect(d.nome).toBe('Maria')
    expect(d.logradouro).toBeNull()
  })
})

describe.runIf(sqlite)('registro local das notas', () => {
  it('primeira tentativa é 1 e avança a cada registro', () => {
    expect(proximaTentativa(1)).toBe(1)
    registrarNotaLocal({
      venda_id: 1, tentativa: 1, referencia: 'v1-t1', acbr_id: 'a1',
      ambiente: 'homologacao', modelo: 65, serie: 1, numero: 5, chave: null,
      status: 'rejeitado', motivo: 'NCM inválido'
    })
    // Reenvio depois de rejeição precisa de referência nova.
    expect(proximaTentativa(1)).toBe(2)
  })

  it('notaDaVenda devolve a tentativa mais recente', () => {
    registrarNotaLocal({
      venda_id: 1, tentativa: 2, referencia: 'v1-t2', acbr_id: 'a2',
      ambiente: 'homologacao', modelo: 65, serie: 1, numero: 6, chave: 'CHAVE123',
      status: 'autorizado', motivo: null
    })
    const n = notaDaVenda(1)!
    expect(n.tentativa).toBe(2)
    expect(n.status).toBe('autorizado')
    expect(n.numero).toBe(6)
  })

  it('reenviar a mesma referência atualiza a linha em vez de duplicar', () => {
    const antes = banco!.prepare('SELECT COUNT(*) AS n FROM nfce_emitidas WHERE venda_id = 1').get() as { n: number }
    registrarNotaLocal({
      venda_id: 1, tentativa: 2, referencia: 'v1-t2', acbr_id: 'a2',
      ambiente: 'homologacao', modelo: 65, serie: 1, numero: 6, chave: 'CHAVE123',
      status: 'cancelado', motivo: null
    })
    const depois = banco!.prepare('SELECT COUNT(*) AS n FROM nfce_emitidas WHERE venda_id = 1').get() as { n: number }
    // Mesma referência = mesma linha, com o status novo.
    expect(depois.n).toBe(antes.n)
    expect(notaDaVenda(1)!.status).toBe('cancelado')
  })

  it('guarda QUAL documento a nota é (NFC-e ou NF-e)', () => {
    // Sem isto, imprimir/cancelar uma NF-e bateria no endereço da NFC-e na
    // ACBr e o documento "não existiria" — erro confuso, no pior momento.
    registrarNotaLocal({
      venda_id: 3, tentativa: 9, referencia: 'v3-nfe', acbr_id: 'a9',
      ambiente: 'homologacao', modelo: 55, serie: 1, numero: 77, chave: 'CH9',
      status: 'autorizado', motivo: null
    })
    expect(notaDaVenda(3)!.modelo).toBe(55)
    expect(notaDaVenda(1)!.modelo).toBe(65) // as da venda 1 são NFC-e
  })

  it('notasDasVendas devolve a nota corrente de cada venda de uma vez', () => {
    const mapa = notasDasVendas([1, 2])
    expect(mapa[1].referencia).toBe('v1-t2')
    expect(mapa[2]).toBeUndefined() // venda 2 nunca emitiu
  })

  it('lista vazia não quebra', () => {
    expect(notasDasVendas([])).toEqual({})
  })
})

describe.runIf(sqlite)('classificação fiscal dos produtos', () => {
  it('aplica em lote a uma lista de produtos', () => {
    const n = aplicarFiscalEmLote({ ids: [2], dados: { ncm: '65050090', cfop: '5102' } })
    expect(n).toBe(1)
    const p = obterFiscalProduto(2)!
    expect(p.ncm).toBe('65050090')
    expect(p.cfop).toBe('5102')
  })

  it('campo em branco NÃO apaga o que já existe', () => {
    // "Não alterar" e "apagar" são coisas diferentes — o formulário manda
    // vazio no que não quer mexer.
    aplicarFiscalEmLote({ ids: [2], dados: { unidade: 'PC' } })
    const p = obterFiscalProduto(2)!
    expect(p.unidade).toBe('PC')
    expect(p.ncm).toBe('65050090') // continua lá
  })

  it('aplicar por categoria não sobrescreve quem já foi classificado', () => {
    // O contador ajustou um produto à mão; aplicar em lote na categoria não
    // pode desfazer esse trabalho.
    salvarFiscalProduto(1, {
      ncm: '99999999', cfop: '5102', cst_csosn: '102', origem: '0', unidade: 'UN'
    })
    banco!.prepare("UPDATE produtos SET categoria = 'Roupas' WHERE id IN (1,2)").run()
    banco!.prepare("UPDATE produtos SET ncm = NULL WHERE id = 2").run()

    const n = aplicarFiscalEmLote({
      categoria: 'Roupas',
      dados: { ncm: '61091000' },
      somentePendentes: true
    })
    expect(n).toBe(1) // só o produto 2, que estava sem NCM
    expect(obterFiscalProduto(1)!.ncm).toBe('99999999') // preservado
    expect(obterFiscalProduto(2)!.ncm).toBe('61091000')
  })

  it('sem nenhum campo preenchido não altera nada', () => {
    expect(aplicarFiscalEmLote({ ids: [1], dados: {} })).toBe(0)
  })

  it('lista só os pendentes quando pedido', () => {
    banco!.prepare("UPDATE produtos SET ncm = NULL WHERE id = 2").run()
    const pendentes = listarParaClassificar({ apenasPendentes: true })
    expect(pendentes.every((p) => !p.ncm)).toBe(true)
    expect(pendentes.some((p) => p.id === 2)).toBe(true)
  })

  it('categorias pendentes agrupam o que falta', () => {
    const cats = categoriasPendentes()
    expect(cats.some((c) => c.categoria === 'Roupas' && c.total >= 1)).toBe(true)
  })
})

describe.runIf(sqlite)('XML e relatório mensal', () => {
  it('guarda o XML e devolve do cache', () => {
    registrarNotaLocal({
      venda_id: 3, tentativa: 1, referencia: 'v3-t1', acbr_id: 'a3',
      ambiente: 'homologacao', modelo: 65, serie: 1, numero: 10, chave: 'CH3',
      status: 'autorizado', motivo: null
    })
    guardarXmlNota('v3-t1', '<nfe>conteudo</nfe>')
    expect(obterXmlNota('v3-t1')).toBe('<nfe>conteudo</nfe>')
  })

  it('não sobrescreve XML já guardado', () => {
    // A ACBr cobra crédito no segundo download; guardar de novo seria sinal de
    // que buscamos à toa.
    guardarXmlNota('v3-t1', '<nfe>outro</nfe>')
    expect(obterXmlNota('v3-t1')).toBe('<nfe>conteudo</nfe>')
  })

  it('lista as notas do mês com o valor da venda', () => {
    const mes = new Date().toISOString().slice(0, 7)
    const lista = notasDoMes(mes)
    const nota = lista.find((n) => n.referencia === 'v3-t1')
    expect(nota).toBeDefined()
    expect(nota!.venda_total).toBe(250)
    expect(nota!.tem_xml).toBe(1)
  })

  it('meses com notas vem do mais recente pro mais antigo', () => {
    const meses = mesesComNotas()
    expect(meses.length).toBeGreaterThan(0)
    expect(meses).toEqual([...meses].sort().reverse())
  })
})

describe.runIf(sqlite)('forma de pagamento e diagnóstico', () => {
  it('grava a forma de pagamento na venda', () => {
    gravarFormaPagamento(2, 'pix')
    expect(vendaParaNota(2)!.forma_pagamento).toBe('pix')
  })

  it('diagnóstico conta os produtos sem NCM', () => {
    const d = diagnosticoFiscal()
    expect(d.total_produtos).toBe(2)
    expect(d.produtos_sem_ncm).toBe(1)
    expect(d.exemplos_sem_ncm[0].nome).toBe('Sem classificacao')
  })
})

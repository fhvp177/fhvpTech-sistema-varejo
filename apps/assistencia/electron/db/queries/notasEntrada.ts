import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { criarProduto, type DadosVariacao } from './produtos'

// Importação de NF-e: análise (reconhecer o que já existe) e gravação (tudo
// numa transação só). A leitura do XML acontece no renderer (src/utils/nfe.ts);
// aqui chega dado estruturado.

const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '')

const cnpjBonito = (cnpj: string | null): string | null => {
  const d = soDigitos(cnpj)
  if (d.length !== 14) return cnpj || null
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// ── Análise: o que desta nota o sistema já conhece? ──────────────────────────

export type ItemParaAnalise = {
  nItem: number
  cprod: string
  ean: string | null
}

// Reconhecimento em 2 camadas: código de barras (certeza) e vínculo aprendido
// em importação anterior (fornecedor + cProd — resolve os itens "SEM GTIN").
export type MatchReposicao = {
  nItem: number
  origem: 'ean' | 'vinculo'
  produto_id: number
  produto_nome: string
  preco: number
  custo: number
  tem_grade: boolean
  variacao_id: number | null
  variacao_tamanho: string | null
  estoque_atual: number // da variação, quando houver; senão do produto
}

export type AnaliseNota = {
  notaJaImportada: { numero: string | null; importada_em: string } | null
  fornecedorExistente: { id: number; nome: string } | null
  matches: MatchReposicao[]
  margemPadrao: { valor: number; tipo: 'pct' | 'reais' } | null
  lojaCnpj: string | null // só dígitos; '' nunca — null quando não configurado
}

type ProdutoAlvo = {
  id: number
  nome: string
  preco: number
  custo: number
  estoque: number
  tem_grade: number
}

export function analisarNota(
  chave: string,
  fornecedorCnpj: string | null,
  itens: ItemParaAnalise[]
): AnaliseNota {
  const db = obterBancoDeDados()

  const jaImportada = db
    .prepare('SELECT numero, importada_em FROM notas_entrada WHERE chave = ?')
    .get(chave) as { numero: string | null; importada_em: string } | undefined

  // Fornecedor casa por CNPJ normalizado (o cadastro pode ter máscara ou não).
  const cnpjLimpo = soDigitos(fornecedorCnpj)
  const fornecedor = cnpjLimpo
    ? (db
        .prepare(
          `SELECT id, nome FROM fornecedores
           WHERE replace(replace(replace(replace(COALESCE(cnpj,''),'.',''),'/',''),'-',''),' ','') = ?`
        )
        .get(cnpjLimpo) as { id: number; nome: string } | undefined)
    : undefined

  const buscarPorCodigoSimples = db.prepare(
    `SELECT p.id, p.nome, p.preco, p.custo, p.estoque,
            EXISTS(SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id) AS tem_grade
     FROM produtos p WHERE p.codigo_barras = ?`
  )
  const buscarPorCodigoVariacao = db.prepare(
    `SELECT p.id, p.nome, p.preco, p.custo, v.estoque AS estoque_variacao,
            v.id AS variacao_id, v.tamanho
     FROM produto_variacoes v JOIN produtos p ON p.id = v.produto_id
     WHERE v.codigo_barras = ?`
  )
  const buscarVinculo = fornecedor
    ? db.prepare(
        `SELECT fp.produto_id, fp.variacao_id,
                p.nome, p.preco, p.custo, p.estoque,
                EXISTS(SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id) AS tem_grade,
                vv.tamanho AS variacao_tamanho, vv.estoque AS estoque_variacao
         FROM fornecedor_produtos fp
         JOIN produtos p ON p.id = fp.produto_id
         LEFT JOIN produto_variacoes vv ON vv.id = fp.variacao_id
         WHERE fp.fornecedor_id = ? AND fp.cprod = ?`
      )
    : null

  const matches: MatchReposicao[] = []
  for (const item of itens) {
    // 1) Código de barras da nota bate com um produto simples…
    if (item.ean) {
      const p = buscarPorCodigoSimples.get(item.ean) as ProdutoAlvo | undefined
      if (p) {
        matches.push({
          nItem: item.nItem,
          origem: 'ean',
          produto_id: p.id,
          produto_nome: p.nome,
          preco: p.preco,
          custo: p.custo,
          tem_grade: !!p.tem_grade,
          variacao_id: null,
          variacao_tamanho: null,
          estoque_atual: p.estoque
        })
        continue
      }
      // …ou com um tamanho específico de um produto de grade.
      const v = buscarPorCodigoVariacao.get(item.ean) as
        | (Omit<ProdutoAlvo, 'estoque' | 'tem_grade'> & {
            estoque_variacao: number
            variacao_id: number
            tamanho: string
          })
        | undefined
      if (v) {
        matches.push({
          nItem: item.nItem,
          origem: 'ean',
          produto_id: v.id,
          produto_nome: v.nome,
          preco: v.preco,
          custo: v.custo,
          tem_grade: true,
          variacao_id: v.variacao_id,
          variacao_tamanho: v.tamanho,
          estoque_atual: v.estoque_variacao
        })
        continue
      }
    }

    // 2) Vínculo aprendido numa importação anterior deste fornecedor.
    if (buscarVinculo && item.cprod) {
      const m = buscarVinculo.get(fornecedor!.id, item.cprod) as
        | {
            produto_id: number
            variacao_id: number | null
            nome: string
            preco: number
            custo: number
            estoque: number
            tem_grade: number
            variacao_tamanho: string | null
            estoque_variacao: number | null
          }
        | undefined
      if (m) {
        // Vínculo antigo apontando pro produto inteiro, mas o produto ganhou
        // grade depois: sem saber o tamanho, não dá pra repor com segurança —
        // melhor devolver como "não reconhecido" e o lojista vincular na mão.
        if (m.tem_grade && m.variacao_id == null) continue
        matches.push({
          nItem: item.nItem,
          origem: 'vinculo',
          produto_id: m.produto_id,
          produto_nome: m.nome,
          preco: m.preco,
          custo: m.custo,
          tem_grade: !!m.tem_grade,
          variacao_id: m.variacao_id,
          variacao_tamanho: m.variacao_tamanho,
          estoque_atual: m.variacao_id != null ? (m.estoque_variacao ?? 0) : m.estoque
        })
      }
    }
  }

  const margemValor = parseFloat(lerConfig('nfe_margem_padrao'))
  const margemTipo = lerConfig('nfe_margem_tipo') === 'reais' ? 'reais' : 'pct'

  return {
    notaJaImportada: jaImportada ?? null,
    fornecedorExistente: fornecedor ?? null,
    matches,
    margemPadrao: Number.isFinite(margemValor) ? { valor: margemValor, tipo: margemTipo } : null,
    lojaCnpj: lerConfig('loja_configurada') === '1' ? soDigitos(lerConfig('loja_cnpj')) || null : null
  }
}

// ── Importação: grava tudo ou nada ───────────────────────────────────────────

export type ItemXmlNota = {
  cprod: string
  descricao: string
  ncm: string | null
  cfop: string | null
  unidade: string | null
  quantidade: number
  custoUnitario: number
}

export type LinhaNovoProduto = {
  tipo: 'novo'
  nome: string
  categoria: string | null
  preco: number
  custo: number
  codigo_barras: string | null // produto simples (null não acontece na prática — a tela gera)
  item?: ItemXmlNota // produto simples: o item da nota que o originou
  variacoes?: { tamanho: string; codigo_barras: string; item: ItemXmlNota }[] // produto de grade
}

export type LinhaReposicao = {
  tipo: 'reposicao'
  produto_id: number
  variacao_id: number | null
  novo_custo: number
  novo_preco: number | null // null = manter o preço de venda atual
  item: ItemXmlNota
}

export type LinhaImportacao = LinhaNovoProduto | LinhaReposicao

export type DadosImportacao = {
  nota: {
    chave: string
    numero: string | null
    serie: string | null
    modelo: string | null
    dataEmissao: string | null
    valorTotal: number
    xml: string
  }
  fornecedor: {
    id: number | null // preenchido quando a análise encontrou o fornecedor
    nome: string
    cnpj: string | null
    telefone: string | null
    endereco: string | null
  }
  linhas: LinhaImportacao[]
  // A margem usada vira a sugestão da próxima importação.
  margemUsada?: { valor: number; tipo: 'pct' | 'reais' }
}

export type ResumoImportacao = {
  notaId: number
  produtosNovos: number
  reposicoes: number
  fornecedorId: number
  fornecedorNome: string
  fornecedorNovo: boolean
}

export function importarNotaEntrada(dados: DadosImportacao): ResumoImportacao {
  const db = obterBancoDeDados()

  const executar = db.transaction((): ResumoImportacao => {
    const repetida = db
      .prepare('SELECT importada_em FROM notas_entrada WHERE chave = ?')
      .get(dados.nota.chave) as { importada_em: string } | undefined
    if (repetida) {
      throw new Error(
        'Esta nota já foi importada antes — importar de novo duplicaria o estoque.'
      )
    }

    // Código de barras repetido derrubaria a transação com um erro críptico de
    // UNIQUE; conferimos antes pra devolver uma mensagem que aponta o culpado.
    const codigoExiste = db.prepare(
      `SELECT 1 FROM produtos WHERE codigo_barras = ?
       UNION SELECT 1 FROM produto_variacoes WHERE codigo_barras = ?`
    )
    for (const linha of dados.linhas) {
      if (linha.tipo !== 'novo') continue
      const codigos = linha.variacoes?.length
        ? linha.variacoes.map((v) => v.codigo_barras)
        : linha.codigo_barras
          ? [linha.codigo_barras]
          : []
      for (const codigo of codigos) {
        if (codigoExiste.get(codigo, codigo)) {
          throw new Error(
            `O código de barras ${codigo} (produto "${linha.nome}") já existe no sistema. ` +
              'Se é o mesmo produto, use "vincular a um produto existente" na conferência.'
          )
        }
      }
    }

    // Fornecedor: usa o encontrado na análise ou cadastra direto do XML.
    let fornecedorId = dados.fornecedor.id
    const fornecedorNovo = fornecedorId == null
    if (fornecedorId == null) {
      fornecedorId = db
        .prepare(
          `INSERT INTO fornecedores (nome, cnpj, telefone, email, endereco)
           VALUES (?, ?, ?, NULL, ?)`
        )
        .run(
          dados.fornecedor.nome,
          cnpjBonito(dados.fornecedor.cnpj),
          dados.fornecedor.telefone,
          dados.fornecedor.endereco
        ).lastInsertRowid as number
    }

    const inserirNota = db.prepare(
      `INSERT INTO notas_entrada
         (chave, numero, serie, modelo, fornecedor_id, fornecedor_nome, fornecedor_cnpj,
          data_emissao, valor_total, xml)
       VALUES (@chave, @numero, @serie, @modelo, @fornecedor_id, @fornecedor_nome,
               @fornecedor_cnpj, @data_emissao, @valor_total, @xml)`
    )
    const notaId = inserirNota.run({
      chave: dados.nota.chave,
      numero: dados.nota.numero,
      serie: dados.nota.serie,
      modelo: dados.nota.modelo,
      fornecedor_id: fornecedorId,
      fornecedor_nome: dados.fornecedor.nome,
      fornecedor_cnpj: cnpjBonito(dados.fornecedor.cnpj),
      data_emissao: dados.nota.dataEmissao,
      valor_total: dados.nota.valorTotal,
      xml: dados.nota.xml
    }).lastInsertRowid as number

    const inserirItem = db.prepare(
      `INSERT INTO notas_entrada_itens
         (nota_id, produto_id, variacao_id, cprod, descricao, ncm, cfop, unidade,
          quantidade, custo_unitario, acao)
       VALUES (@nota_id, @produto_id, @variacao_id, @cprod, @descricao, @ncm, @cfop,
               @unidade, @quantidade, @custo_unitario, @acao)`
    )
    // A memória de vínculo: da próxima vez este cProd deste fornecedor já será
    // reconhecido sozinho. Reimportar atualiza o alvo (o lojista pode ter
    // revinculado manualmente na conferência).
    const gravarVinculo = db.prepare(
      `INSERT INTO fornecedor_produtos (fornecedor_id, cprod, produto_id, variacao_id)
       VALUES (@fornecedor_id, @cprod, @produto_id, @variacao_id)
       ON CONFLICT(fornecedor_id, cprod) DO UPDATE
         SET produto_id = excluded.produto_id, variacao_id = excluded.variacao_id`
    )

    const registrarItem = (
      item: ItemXmlNota,
      produtoId: number,
      variacaoId: number | null,
      acao: 'novo' | 'reposicao'
    ): void => {
      inserirItem.run({
        nota_id: notaId,
        produto_id: produtoId,
        variacao_id: variacaoId,
        cprod: item.cprod || null,
        descricao: item.descricao,
        ncm: item.ncm,
        cfop: item.cfop,
        unidade: item.unidade,
        quantidade: item.quantidade,
        custo_unitario: item.custoUnitario,
        acao
      })
      if (item.cprod) {
        gravarVinculo.run({
          fornecedor_id: fornecedorId,
          cprod: item.cprod,
          produto_id: produtoId,
          variacao_id: variacaoId
        })
      }
    }

    let produtosNovos = 0
    let reposicoes = 0

    for (const linha of dados.linhas) {
      if (linha.tipo === 'novo') {
        const temGrade = !!linha.variacoes && linha.variacoes.length > 0
        const variacoes: DadosVariacao[] | undefined = temGrade
          ? linha.variacoes!.map((v) => ({
              tamanho: v.tamanho,
              codigo_barras: v.codigo_barras,
              estoque: Math.round(v.item.quantidade)
            }))
          : undefined

        const produto = criarProduto({
          codigo_barras: linha.codigo_barras,
          nome: linha.nome,
          categoria: linha.categoria,
          preco: linha.preco,
          custo: linha.custo,
          estoque: linha.item ? Math.round(linha.item.quantidade) : 0,
          fornecedor_id: fornecedorId,
          variacoes
        })
        produtosNovos++

        if (temGrade) {
          for (const v of linha.variacoes!) {
            const criada = produto.variacoes.find((pv) => pv.tamanho === v.tamanho)
            registrarItem(v.item, produto.id, criada?.id ?? null, 'novo')
          }
        } else if (linha.item) {
          registrarItem(linha.item, produto.id, null, 'novo')
        }
      } else {
        // Reposição: soma estoque no alvo certo (tamanho ou produto simples),
        // atualiza o custo e — só se o lojista pediu — o preço de venda.
        if (linha.variacao_id != null) {
          const r = db
            .prepare(
              'UPDATE produto_variacoes SET estoque = estoque + ? WHERE id = ? AND produto_id = ?'
            )
            .run(Math.round(linha.item.quantidade), linha.variacao_id, linha.produto_id)
          if (r.changes === 0) throw new Error('Tamanho não encontrado pra reposição.')
        } else {
          // Guarda: em produto de grade o estoque vive nos tamanhos — somar no
          // produto-pai sumiria com a mercadoria em silêncio.
          const temGrade = db
            .prepare('SELECT 1 FROM produto_variacoes WHERE produto_id = ? LIMIT 1')
            .get(linha.produto_id)
          if (temGrade) {
            throw new Error(
              `"${linha.item.descricao}" repõe um produto com grade de tamanhos — escolha o tamanho na conferência.`
            )
          }
          const r = db
            .prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?')
            .run(Math.round(linha.item.quantidade), linha.produto_id)
          if (r.changes === 0) throw new Error('Produto não encontrado pra reposição.')
        }
        db.prepare(
          `UPDATE produtos SET custo = @custo, preco = COALESCE(@preco, preco) WHERE id = @id`
        ).run({ id: linha.produto_id, custo: linha.novo_custo, preco: linha.novo_preco })
        // Produto sem fornecedor ganha este; se já tem outro, respeitamos.
        db.prepare(
          'UPDATE produtos SET fornecedor_id = ? WHERE id = ? AND fornecedor_id IS NULL'
        ).run(fornecedorId, linha.produto_id)

        registrarItem(linha.item, linha.produto_id, linha.variacao_id, 'reposicao')
        reposicoes++
      }
    }

    if (dados.margemUsada) {
      gravarConfig('nfe_margem_padrao', String(dados.margemUsada.valor))
      gravarConfig('nfe_margem_tipo', dados.margemUsada.tipo)
    }

    return {
      notaId,
      produtosNovos,
      reposicoes,
      fornecedorId,
      fornecedorNome: dados.fornecedor.nome,
      fornecedorNovo
    }
  })

  return executar()
}

// ── Notas importadas (histórico + relatório do contador) ─────────────────────

export type NotaEntradaResumo = {
  id: number
  chave: string
  numero: string | null
  serie: string | null
  modelo: string | null
  fornecedor_nome: string
  fornecedor_cnpj: string | null
  data_emissao: string | null
  valor_total: number
  importada_em: string
  total_itens: number
  produtos_novos: number
  reposicoes: number
}

// O "mês" de uma nota é o da EMISSÃO (o que vale pro contador); nota sem data
// de emissão no XML cai no mês da importação pra não sumir do relatório.
const CAMPO_MES = "substr(COALESCE(NULLIF(n.data_emissao,''), n.importada_em), 1, 7)"

export function listarNotasEntrada(mes?: string): NotaEntradaResumo[] {
  const db = obterBancoDeDados()
  const filtro = mes ? `WHERE ${CAMPO_MES} = @mes` : ''
  return db
    .prepare(
      `SELECT n.id, n.chave, n.numero, n.serie, n.modelo, n.fornecedor_nome,
              n.fornecedor_cnpj, n.data_emissao, n.valor_total, n.importada_em,
              (SELECT COUNT(*) FROM notas_entrada_itens i WHERE i.nota_id = n.id) AS total_itens,
              (SELECT COUNT(*) FROM notas_entrada_itens i WHERE i.nota_id = n.id AND i.acao = 'novo') AS produtos_novos,
              (SELECT COUNT(*) FROM notas_entrada_itens i WHERE i.nota_id = n.id AND i.acao = 'reposicao') AS reposicoes
       FROM notas_entrada n
       ${filtro}
       ORDER BY COALESCE(NULLIF(n.data_emissao,''), n.importada_em) DESC, n.id DESC`
    )
    .all(mes ? { mes } : {}) as NotaEntradaResumo[]
}

// Meses (YYYY-MM) que têm nota, do mais recente pro mais antigo — alimenta o
// seletor do relatório do contador.
export function mesesComNotas(): string[] {
  const db = obterBancoDeDados()
  const rows = db
    .prepare(
      `SELECT DISTINCT ${CAMPO_MES} AS mes FROM notas_entrada n ORDER BY mes DESC`
    )
    .all() as Array<{ mes: string }>
  return rows.map((r) => r.mes)
}

export function xmlsDoMes(mes: string): Array<{ chave: string; numero: string | null; xml: string }> {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT n.chave, n.numero, n.xml FROM notas_entrada n WHERE ${CAMPO_MES} = @mes`
    )
    .all({ mes }) as Array<{ chave: string; numero: string | null; xml: string }>
}

// Montagem do payload de emissão da NFC-e (modelo 65) a partir de uma venda do
// varejo. É a parte fiscalmente delicada: a SEFAZ valida os totais centavo a
// centavo e rejeita a nota inteira se algo não fechar.
//
// Escopo desta versão: SIMPLES NACIONAL (CRT 1 e 2), que é o regime da imensa
// maioria das lojas de varejo. Nesse regime o ICMS vai como CSOSN (sem cálculo
// de alíquota na nota) e PIS/COFINS não são destacados (recolhidos no DAS).
// Regime Normal (CRT 3, com CST e alíquota de ICMS) é um caso à parte e fica
// para depois — a rota recusa com mensagem clara em vez de emitir errado.
//
// O que a ACBr preenche sozinha: os dados do EMITENTE (emit) vêm da empresa já
// cadastrada na conta, então não montamos esse bloco aqui.

// ── Arredondamento ────────────────────────────────────────────────────────────
// Dinheiro é sempre 2 casas. Fazer a conta em centavos (inteiros) evita o erro
// clássico de ponto flutuante (0.1 + 0.2 ≠ 0.3) que produziria centavos tortos
// e nota rejeitada.
function real2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
const centavos = (n: number): number => Math.round(n * 100)

export type ItemVendaNfce = {
  nome: string
  ncm: string
  cfop: string
  cst_csosn: string // CSOSN no Simples (ex.: "102")
  origem: string // 0-8
  unidade: string // UN, KG…
  quantidade: number
  valor_unitario: number
  codigo?: string // código interno do produto
  codigo_barras?: string // GTIN/EAN
}

export type PagamentoNfce = {
  tPag: string // código SEFAZ: 01 dinheiro, 03 crédito, 04 débito, 17 PIX…
  valor: number
}

export type VendaParaNfce = {
  itens: ItemVendaNfce[]
  desconto?: number // desconto total da venda, rateado entre os itens
  pagamentos: PagamentoNfce[]
  consumidor?: { cpf?: string; nome?: string } // NFC-e pode ser sem identificação
}

export type EmitenteNfce = {
  cnpj: string // só dígitos — identifica a empresa cadastrada na ACBr
  uf: string // sigla
  codigo_municipio: string // IBGE 7 dígitos
  crt: 1 | 2 | 3 // regime tributário
}

// Versão do "aplicativo emissor" que vai no campo verProc da nota. Identifica
// o sistema que gerou o documento (exigência da SEFAZ).
const VER_PROC = 'FHVP Tech Varejo'

// Código IBGE da UF (os 2 primeiros dígitos do código de município). Necessário
// no campo cUF do `ide`.
const UF_IBGE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53
}

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

export class ErroMontagem extends Error {}

// Rateia um desconto total entre os itens, proporcional ao valor de cada um,
// fechando a diferença de centavos no último item. Sem isso, a soma dos
// descontos por item não bate com o desconto total e a SEFAZ rejeita.
function ratearDesconto(valoresItem: number[], descontoTotal: number): number[] {
  const totalCent = valoresItem.reduce((s, v) => s + centavos(v), 0)
  const descCent = centavos(descontoTotal)
  if (descCent <= 0 || totalCent <= 0) return valoresItem.map(() => 0)

  const rateado: number[] = []
  let acumulado = 0
  for (let i = 0; i < valoresItem.length; i++) {
    if (i === valoresItem.length - 1) {
      // Último item absorve o resto — garante Σ = descontoTotal exato.
      rateado.push((descCent - acumulado) / 100)
    } else {
      const parte = Math.round((centavos(valoresItem[i]) / totalCent) * descCent)
      acumulado += parte
      rateado.push(parte / 100)
    }
  }
  return rateado
}

// Bloco de imposto do item para o Simples Nacional: ICMS via CSOSN + PIS/COFINS
// não tributados (recolhidos no DAS).
function impostoSimples(item: ItemVendaNfce) {
  const orig = Number(item.origem || '0')
  const csosn = soDigitos(item.cst_csosn) || '102'
  return {
    ICMS: { ICMSSN102: { orig, CSOSN: csosn } },
    PIS: { PISNT: { CST: '07' } }, // 07 = isenta
    COFINS: { COFINSNT: { CST: '07' } }
  }
}

export function montarPedidoNfce(args: {
  venda: VendaParaNfce
  emitente: EmitenteNfce
  serie: number
  numero: number
  ambiente: 'homologacao' | 'producao'
  referencia: string
}): Record<string, unknown> {
  const { venda, emitente, serie, numero, ambiente, referencia } = args

  if (emitente.crt === 3) {
    throw new ErroMontagem(
      'Emissão para Regime Normal ainda não é suportada — por ora, só Simples Nacional.'
    )
  }
  if (!venda.itens?.length) throw new ErroMontagem('A venda não tem itens.')

  const cUF = UF_IBGE[(emitente.uf ?? '').toUpperCase()]
  if (!cUF) throw new ErroMontagem(`UF do emitente inválida: "${emitente.uf}".`)

  // Item sem NCM não pode ser emitido — a nota inteira seria rejeitada, e o
  // erro genérico da SEFAZ não diria qual produto. Barra aqui, específico.
  for (const it of venda.itens) {
    if (!soDigitos(it.ncm)) {
      throw new ErroMontagem(`O produto "${it.nome}" está sem NCM e não pode sair em nota.`)
    }
    if (!soDigitos(it.cfop)) {
      throw new ErroMontagem(`O produto "${it.nome}" está sem CFOP.`)
    }
  }

  const valoresBrutos = venda.itens.map((it) => real2(it.quantidade * it.valor_unitario))
  const descontos = ratearDesconto(valoresBrutos, venda.desconto ?? 0)

  const det = venda.itens.map((it, i) => {
    const vProd = valoresBrutos[i]
    const vDesc = descontos[i]
    return {
      nItem: i + 1,
      prod: {
        cProd: it.codigo || String(i + 1),
        cEAN: it.codigo_barras || 'SEM GTIN',
        xProd: it.nome,
        NCM: soDigitos(it.ncm),
        CFOP: soDigitos(it.cfop),
        uCom: it.unidade || 'UN',
        qCom: it.quantidade,
        vUnCom: it.valor_unitario,
        vProd,
        cEANTrib: it.codigo_barras || 'SEM GTIN',
        uTrib: it.unidade || 'UN',
        qTrib: it.quantidade,
        vUnTrib: it.valor_unitario,
        ...(vDesc > 0 ? { vDesc } : {}),
        indTot: 1 // este item compõe o total da nota
      },
      imposto: impostoSimples(it)
    }
  })

  const vProdTotal = real2(valoresBrutos.reduce((s, v) => s + v, 0))
  const vDescTotal = real2(descontos.reduce((s, v) => s + v, 0))
  const vNF = real2(vProdTotal - vDescTotal)

  // Pagamentos: se o app não mandou, assume o total à vista em dinheiro. A soma
  // dos pagamentos deve fechar com vNF (a SEFAZ confere).
  const pagamentos =
    venda.pagamentos?.length > 0
      ? venda.pagamentos
      : [{ tPag: '01', valor: vNF }]

  const consumidorCpf = soDigitos(venda.consumidor?.cpf ?? '')

  return {
    ambiente,
    referencia,
    infNFe: {
      versao: '4.00',
      ide: {
        cUF,
        natOp: 'Venda',
        mod: 65,
        serie,
        nNF: numero,
        dhEmi: new Date().toISOString(),
        tpNF: 1, // saída
        idDest: 1, // operação interna
        cMunFG: soDigitos(emitente.codigo_municipio),
        tpImp: 4, // DANFE NFC-e
        tpEmis: 1, // normal
        tpAmb: ambiente === 'producao' ? 1 : 2,
        finNFe: 1, // normal
        indFinal: 1, // consumidor final
        indPres: 1, // presencial
        procEmi: 0,
        verProc: VER_PROC
      },
      // Só o essencial: a ACBr completa xNome, endereço e IE a partir da
      // empresa já cadastrada na conta.
      emit: {
        CNPJ: soDigitos(emitente.cnpj),
        CRT: emitente.crt
      },
      det,
      total: {
        ICMSTot: {
          vBC: 0,
          vICMS: 0,
          vICMSDeson: 0,
          vFCP: 0,
          vBCST: 0,
          vST: 0,
          vFCPST: 0,
          vFCPSTRet: 0,
          vProd: vProdTotal,
          vFrete: 0,
          vSeg: 0,
          vDesc: vDescTotal,
          vII: 0,
          vIPI: 0,
          vIPIDevol: 0,
          vPIS: 0,
          vCOFINS: 0,
          vOutro: 0,
          vNF
        }
      },
      transp: { modFrete: 9 }, // sem frete
      pag: {
        detPag: pagamentos.map((p) => ({ tPag: p.tPag, vPag: real2(p.valor) }))
      },
      ...(consumidorCpf
        ? {
            dest: {
              CPF: consumidorCpf,
              ...(venda.consumidor?.nome ? { xNome: venda.consumidor.nome } : {}),
              indIEDest: 9 // não contribuinte
            }
          }
        : {})
    }
  }
}

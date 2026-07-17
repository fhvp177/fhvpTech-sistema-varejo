import { XMLParser, XMLValidator } from 'fast-xml-parser'

// Leitura do XML de NF-e (modelo 55, layout 4.00) para a importação de produtos.
// Roda no renderer (o arquivo chega via drag & drop / seletor) e é código puro:
// recebe a string do XML e devolve dados estruturados — quem grava no banco é o
// main process, via IPC. Mantido puro de propósito pra ser testável no vitest.

export type FornecedorNota = {
  cnpj: string | null // só dígitos
  nome: string
  fantasia: string | null
  telefone: string | null
  endereco: string | null
}

export type ItemNota = {
  nItem: number
  cprod: string // código do produto NO fornecedor — base do vínculo de reposição
  ean: string | null // GTIN; null quando a nota traz "SEM GTIN"
  descricao: string
  ncm: string | null
  cfop: string | null
  unidade: string | null
  quantidade: number
  valorUnitario: number // vUnCom puro da nota
  custoUnitario: number // custo REAL: com desconto, frete, seguro, IPI e ICMS-ST rateados
  valorTotal: number // vProd
  vestuario: boolean // NCM capítulo 61/62 (roupas) ou 64 (calçados)
  tamanho: string | null // token de tamanho extraído da descrição (só vestuário)
  descricaoBase: string // descrição sem o token de tamanho (== descricao quando não há)
}

export type NotaEntradaLida = {
  chave: string // 44 dígitos — identidade única da nota no Brasil
  numero: string
  serie: string
  modelo: string // '55' = NF-e; '65' = NFC-e (cupom)
  dataEmissao: string | null // ISO como veio da nota (dhEmi)
  fornecedor: FornecedorNota
  destinatarioCnpj: string | null // só dígitos — pra conferir se a nota é da loja
  valorTotal: number
  itens: ItemNota[]
}

const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

const texto = (v: unknown): string => String(v ?? '').trim()

const textoOuNull = (v: unknown): string | null => {
  const t = texto(v)
  return t ? t : null
}

// ── Tamanho na descrição (vestuário) ─────────────────────────────────────────
// Fornecedor de confecção manda uma linha por tamanho ("VESTIDO LONGO AZUL M",
// "CALÇA JEANS 42"). Extraímos o token do FIM da descrição — só letras de grade
// conhecidas ou números na faixa de vestuário/calçado, sempre como palavra
// isolada. É heurística: o resultado vira SUGESTÃO de grade na conferência,
// nunca decisão automática.

const TAMANHOS_LETRA = new Set([
  'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'EG', 'EGG', 'G1', 'G2', 'G3', 'G4'
])

export function extrairTamanho(descricao: string): { base: string; tamanho: string } | null {
  const d = descricao.trim()

  // "… TAM M", "… TAM.: G", "… TAMANHO 42"
  let m = d.match(/^(.*?)[\s\-/,]*TAM(?:ANHO)?[\s.:]*([A-Za-z0-9]{1,3})$/i)
  if (m) {
    const t = m[2].toUpperCase()
    if (TAMANHOS_LETRA.has(t) || ehTamanhoNumerico(t)) return montar(m[1], t)
  }

  // "… M", "… - GG", "… (P)" — letra de grade isolada no fim
  m = d.match(/^(.*?)[\s\-/,]+\(?([A-Za-z]{1,3})\)?$/)
  if (m) {
    const t = m[2].toUpperCase()
    if (TAMANHOS_LETRA.has(t)) return montar(m[1], t)
  }

  // "… 42", "… - 38" — tamanho numérico (calça, calçado) isolado no fim
  m = d.match(/^(.*?)[\s\-/,]+\(?(\d{2})\)?$/)
  if (m && ehTamanhoNumerico(m[2])) return montar(m[1], m[2])

  return null
}

const ehTamanhoNumerico = (t: string): boolean => {
  const n = parseInt(t, 10)
  return Number.isInteger(n) && n >= 33 && n <= 56
}

const montar = (base: string, tamanho: string): { base: string; tamanho: string } | null => {
  const limpa = base.replace(/[\s\-/,.:]+$/, '').trim()
  // Se sobrou quase nada, o "tamanho" provavelmente era o nome inteiro ("P&D").
  if (limpa.length < 3) return null
  return { base: limpa, tamanho }
}

// ── Sugestão de grade ────────────────────────────────────────────────────────
// Agrupa itens de vestuário cuja descrição só difere no tamanho ("VESTIDO AZUL
// M" + "VESTIDO AZUL G" → 1 produto de grade com 2 tamanhos). Só agrupa com 2+
// itens e tamanhos todos distintos — 1 item com "tamanho" no nome pode ser só
// coincidência, e tamanhos repetidos indicam que a heurística leu errado.

export function sugerirGrades(itens: ItemNota[]): ItemNota[][] {
  const porBase = new Map<string, ItemNota[]>()
  for (const item of itens) {
    if (!item.vestuario || !item.tamanho) continue
    const chave = item.descricaoBase.toUpperCase()
    const grupo = porBase.get(chave) ?? []
    grupo.push(item)
    porBase.set(chave, grupo)
  }

  const grades: ItemNota[][] = []
  for (const grupo of porBase.values()) {
    if (grupo.length < 2) continue
    const tamanhos = new Set(grupo.map((i) => i.tamanho))
    if (tamanhos.size !== grupo.length) continue
    grades.push(grupo)
  }
  return grades
}

// ── Parse do XML ─────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>

const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})

// vICMSST mora dentro de ICMS10/ICMS30/ICMS70/… — pega o único filho que existir.
const icmsStDoItem = (imposto: Obj): number => {
  const icms = obj(imposto.ICMS)
  for (const chave of Object.keys(icms)) {
    const vst = obj(icms[chave]).vICMSST
    if (vst != null) return num(vst)
  }
  return 0
}

export function analisarXmlNfe(xml: string): NotaEntradaLida {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error('O arquivo não é um XML válido. Confira se ele não está corrompido.')
  }

  // parseTagValue: false preserva zeros à esquerda de cProd/cEAN (número "0123"
  // viraria 123); os campos numéricos são convertidos à mão onde importa.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    isArray: (nome) => nome === 'det'
  })
  const raiz = obj(parser.parse(xml))

  // XML baixado do portal/fornecedor normalmente vem como nfeProc (nota +
  // protocolo); direto do emissor pode vir só NFe.
  const nfe = obj(obj(raiz.nfeProc).NFe ?? raiz.NFe)
  const infNFe = obj(nfe.infNFe)
  if (Object.keys(infNFe).length === 0) {
    throw new Error(
      'Este XML não parece ser uma nota fiscal (NF-e). ' +
        'Confira se é o arquivo XML da nota, não o PDF (DANFE).'
    )
  }

  const chave = soDigitos(
    texto(infNFe['@_Id']).replace(/^NFe/i, '') ||
      texto(obj(obj(obj(raiz.nfeProc).protNFe).infProt).chNFe)
  )
  if (chave.length !== 44) {
    throw new Error('Não encontrei a chave de acesso da nota neste XML.')
  }

  const ide = obj(infNFe.ide)
  const emit = obj(infNFe.emit)
  const ender = obj(emit.enderEmit)
  const dest = obj(infNFe.dest)
  const total = obj(obj(infNFe.total).ICMSTot)

  const partesEndereco = [
    [texto(ender.xLgr), texto(ender.nro)].filter(Boolean).join(', '),
    texto(ender.xBairro),
    [texto(ender.xMun), texto(ender.UF)].filter(Boolean).join('/')
  ].filter(Boolean)

  const fornecedor: FornecedorNota = {
    cnpj: soDigitos(emit.CNPJ ?? emit.CPF) || null,
    nome: texto(emit.xNome),
    fantasia: textoOuNull(emit.xFant),
    telefone: soDigitos(ender.fone) || null,
    endereco: partesEndereco.length > 0 ? partesEndereco.join(' - ') : null
  }
  if (!fornecedor.nome) {
    throw new Error('O XML não traz o nome do emitente (fornecedor) — arquivo incompleto?')
  }

  const dets = (Array.isArray(infNFe.det) ? infNFe.det : []) as unknown[]
  if (dets.length === 0) {
    throw new Error('Esta nota não tem nenhum item de produto.')
  }

  const itens: ItemNota[] = dets.map((det, i) => {
    const d = obj(det)
    const prod = obj(d.prod)
    const imposto = obj(d.imposto)

    const descricao = texto(prod.xProd)
    const quantidade = num(prod.qCom)
    const vProd = num(prod.vProd)

    // Custo REAL do item: o que veio na nota além do preço do produto também é
    // custo (frete, seguro, outras despesas, IPI e ICMS-ST não recuperáveis pra
    // quem compra pra revenda no Simples) — e o desconto reduz. Tudo já vem
    // rateado por item no próprio XML.
    const vIPI = num(obj(obj(imposto.IPI).IPITrib).vIPI)
    const custoTotal =
      vProd -
      num(prod.vDesc) +
      num(prod.vFrete) +
      num(prod.vSeg) +
      num(prod.vOutro) +
      vIPI +
      icmsStDoItem(imposto)

    const ncm = textoOuNull(prod.NCM)
    const vestuario = ncm != null && /^(6[12]|64)/.test(ncm)
    const tamanho = vestuario ? extrairTamanho(descricao) : null

    const eanBruto = soDigitos(prod.cEAN)

    return {
      nItem: parseInt(texto(d['@_nItem']), 10) || i + 1,
      cprod: texto(prod.cProd),
      ean: eanBruto.length >= 8 ? eanBruto : null, // "SEM GTIN"/vazio → null
      descricao,
      ncm,
      cfop: textoOuNull(prod.CFOP),
      unidade: textoOuNull(prod.uCom),
      quantidade,
      valorUnitario: num(prod.vUnCom),
      custoUnitario: quantidade > 0 ? +(custoTotal / quantidade).toFixed(2) : 0,
      valorTotal: vProd,
      vestuario,
      tamanho: tamanho?.tamanho ?? null,
      descricaoBase: tamanho?.base ?? descricao
    }
  })

  return {
    chave,
    numero: texto(ide.nNF),
    serie: texto(ide.serie),
    modelo: texto(ide.mod),
    dataEmissao: textoOuNull(ide.dhEmi) ?? textoOuNull(ide.dEmi),
    fornecedor,
    destinatarioCnpj: soDigitos(dest.CNPJ ?? dest.CPF) || null,
    valorTotal: num(total.vNF),
    itens
  }
}

// ── Ajudantes de apresentação ────────────────────────────────────────────────

export const formatarCnpj = (cnpj: string | null): string => {
  const d = soDigitos(cnpj)
  if (d.length !== 14) return cnpj ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// Preço de venda a partir do custo + lucro desejado. Markup: "30%" em cima de
// R$ 100 de custo = R$ 130; em reais é soma direta.
export const calcularPrecoVenda = (
  custo: number,
  margem: number,
  tipo: 'pct' | 'reais'
): number => +(tipo === 'pct' ? custo * (1 + margem / 100) : custo + margem).toFixed(2)

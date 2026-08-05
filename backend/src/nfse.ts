// Montagem do pedido de emissão da NFS-e (nota fiscal de SERVIÇO) a partir de
// uma venda. É a irmã municipal da NFC-e/NF-e do nfce.ts, e as diferenças entre
// elas explicam por que este arquivo existe separado:
//
// 1. **Quem recebe é a PREFEITURA, não a SEFAZ.** Cada município tem o seu
//    provedor, com regras e campos próprios. A ACBr uniformiza a chamada, mas
//    não inventa cobertura: município sem provedor integrado simplesmente não
//    emite. Por isso existe a consulta de cobertura (`GET /nfse/cidades/{ibge}`)
//    e por isso ela é checada ANTES de prometer a funcionalidade ao lojista.
//
// 2. **A numeração é da ACBr, não nossa.** Na NFC-e nós reservamos o número e
//    devolvemos ao pool quando a transmissão falha. Aqui o número do RPS vive na
//    configuração da empresa (`PUT /empresas/{cnpj}/nfse`, bloco `rps`) e a ACBr
//    incrementa sozinha. Reservar número deste lado criaria duas autoridades
//    para a mesma sequência — o jeito mais garantido de furar a numeração.
//
// 3. **O imposto é o ISS, e ele é do município.** Não há NCM, CFOP nem CSOSN: o
//    que classifica um serviço é o item da lista da LC 116/2003 e a alíquota que
//    a prefeitura cobra dele. Esses dois números vêm do contador do cliente —
//    não existe padrão nacional para chutar.
//
// O que a ACBr preenche sozinha: os dados do PRESTADOR além do CNPJ (endereço,
// inscrição municipal, regime) vêm da empresa já cadastrada na conta.

import { ErroMontagem } from './nfce'

// Dinheiro sempre em 2 casas. Mesma razão do nfce.ts: fazer a conta em centavos
// inteiros evita o 0.1 + 0.2 ≠ 0.3 que produz centavo torto e nota recusada.
function real2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
const centavos = (n: number): number => Math.round(n * 100)

const soDigitos = (s: string): string => (s ?? '').replace(/\D/g, '')

/**
 * Um serviço prestado, como sai do cadastro de "Produtos e Serviços".
 *
 * `item_lista_servico` e `aliquota_iss` são os dois campos que o lojista NÃO
 * consegue adivinhar — vêm do contador. Sem eles a nota não sai, e é melhor
 * barrar aqui, nomeando o serviço, do que mandar pra prefeitura e receber uma
 * rejeição em código.
 */
export type ItemServicoNfse = {
  nome: string
  /** Item da lista da LC 116/2003 — ex.: "14.02" (conserto/manutenção). */
  item_lista_servico: string
  /** Alíquota do ISS em PERCENTUAL (5 = 5%), como a prefeitura publica. */
  aliquota_iss: number
  quantidade: number
  valor_unitario: number
  /** Código de tributação do município, quando a prefeitura exige o dela. */
  codigo_tributacao_municipio?: string
  codigo_cnae?: string
}

/** Quem contratou o serviço. Na NFS-e o tomador é sempre identificado. */
export type TomadorNfse = {
  nome: string
  cpf?: string
  cnpj?: string
  inscricao_municipal?: string
  email?: string
  telefone?: string
  endereco?: {
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
    codigo_municipio?: string
  }
}

export type VendaParaNfse = {
  servicos: ItemServicoNfse[]
  /** Desconto total da venda, rateado entre os serviços. */
  desconto?: number
  tomador: TomadorNfse
  /**
   * O que aparece na nota como descrição do serviço. Quando a nota nasce de uma
   * ordem de serviço, é aqui que entram o aparelho e o defeito — é o texto que
   * o cliente lê pra reconhecer o próprio conserto.
   */
  discriminacao?: string
}

export type PrestadorNfse = {
  /** Só dígitos — identifica a empresa cadastrada na ACBr. */
  cnpj: string
  /** IBGE 7 dígitos do município onde o serviço é prestado. */
  codigo_municipio: string
  /** ISS retido na fonte pelo tomador. Padrão: não. */
  iss_retido?: boolean
}

/** Limite da lista da LC 116: "NN.NN" ou "NNNN" conforme a prefeitura. */
const ITEM_LC116 = /^\d{2}\.?\d{2}$/

/**
 * Monta o corpo do `POST /nfse`.
 *
 * O rateio de desconto segue a mesma regra da NFC-e: proporcional ao valor de
 * cada linha, com a sobra de centavos jogada na última — se a soma das linhas
 * não bater com o total, a prefeitura recusa.
 */
export function montarPedidoNfse(args: {
  venda: VendaParaNfse
  prestador: PrestadorNfse
  ambiente: 'homologacao' | 'producao'
  referencia: string
  /** Competência (AAAA-MM-DD). Padrão: hoje. */
  competencia?: string
}): Record<string, unknown> {
  const { venda, prestador, ambiente, referencia } = args

  if (!venda.servicos?.length) throw new ErroMontagem('A venda não tem serviços.')
  if (!soDigitos(prestador.cnpj)) {
    throw new ErroMontagem('O CNPJ do prestador não foi informado.')
  }
  if (soDigitos(prestador.codigo_municipio).length !== 7) {
    throw new ErroMontagem(
      'O código IBGE do município da empresa está incompleto — ele tem 7 dígitos. ' +
        'Confira em Nota fiscal > dados da empresa.'
    )
  }
  if (!venda.tomador?.nome?.trim()) {
    throw new ErroMontagem(
      'A nota de serviço exige o nome do cliente. Vincule um cliente à venda antes de emitir.'
    )
  }

  // Validação item a item, nomeando o serviço — mensagem que diz o que fazer.
  for (const s of venda.servicos) {
    if (!s.item_lista_servico?.trim()) {
      throw new ErroMontagem(
        `O serviço "${s.nome}" está sem o item da lista de serviços (LC 116) e não pode sair em nota. ` +
          'Esse código vem do seu contador.'
      )
    }
    if (!ITEM_LC116.test(s.item_lista_servico.trim())) {
      throw new ErroMontagem(
        `O item da lista de serviços de "${s.nome}" está fora do formato esperado ` +
          `(ex.: "14.02"): "${s.item_lista_servico}".`
      )
    }
    if (!Number.isFinite(s.aliquota_iss) || s.aliquota_iss < 0 || s.aliquota_iss > 100) {
      throw new ErroMontagem(
        `A alíquota de ISS de "${s.nome}" é inválida: ${s.aliquota_iss}. ` +
          'Ela vai em percentual (ex.: 5 para 5%) e quem informa é o seu contador.'
      )
    }
    if (!Number.isFinite(s.quantidade) || s.quantidade <= 0) {
      throw new ErroMontagem(`A quantidade de "${s.nome}" precisa ser maior que zero.`)
    }
    if (!Number.isFinite(s.valor_unitario) || s.valor_unitario < 0) {
      throw new ErroMontagem(`O valor de "${s.nome}" é inválido.`)
    }
  }

  // ── Rateio do desconto, em centavos ────────────────────────────────────────
  const brutosCent = venda.servicos.map((s) => centavos(s.valor_unitario) * s.quantidade)
  const totalBrutoCent = brutosCent.reduce((a, b) => a + b, 0)
  const descontoCent = Math.min(centavos(venda.desconto ?? 0), totalBrutoCent)

  const descontosCent = brutosCent.map((b) =>
    totalBrutoCent === 0 ? 0 : Math.floor((descontoCent * b) / totalBrutoCent)
  )
  // A sobra do arredondamento vai na última linha, senão a soma não fecha.
  const sobra = descontoCent - descontosCent.reduce((a, b) => a + b, 0)
  if (descontosCent.length > 0) descontosCent[descontosCent.length - 1] += sobra

  const liquidosCent = brutosCent.map((b, i) => b - descontosCent[i])
  const totalLiquidoCent = liquidosCent.reduce((a, b) => a + b, 0)

  // ── ISS ────────────────────────────────────────────────────────────────────
  // Calculado por linha sobre o valor líquido dela e somado, em vez de aplicar
  // uma alíquota média sobre o total: serviços com alíquotas diferentes na mesma
  // nota são normais (conserto e assessoria não pagam o mesmo ISS).
  const issCentPorLinha = liquidosCent.map((liq, i) =>
    Math.round((liq * venda.servicos[i].aliquota_iss) / 100)
  )
  const issTotalCent = issCentPorLinha.reduce((a, b) => a + b, 0)

  const issRetido = prestador.iss_retido === true

  // A discriminação é o texto que o cliente lê. Sem um texto próprio, lista os
  // serviços — nunca vai vazia, que é o que várias prefeituras recusam.
  const discriminacao =
    venda.discriminacao?.trim() ||
    venda.servicos
      .map((s) => (s.quantidade > 1 ? `${s.quantidade}x ${s.nome}` : s.nome))
      .join(' | ')

  // A ACBr aceita UM bloco `servicos` por RPS. Com mais de um serviço, os
  // valores vão somados e a discriminação detalha a composição — que é como as
  // prefeituras esperam receber um RPS com vários itens.
  const primeiro = venda.servicos[0]

  const rps: Record<string, unknown> = {
    referencia,
    competencia: args.competencia ?? new Date().toISOString().slice(0, 10),
    prestador: { cpf_cnpj: soDigitos(prestador.cnpj) },
    tomador: montarTomador(venda.tomador),
    servicos: {
      item_lista_servico: primeiro.item_lista_servico.trim(),
      ...(primeiro.codigo_cnae ? { codigo_cnae: primeiro.codigo_cnae } : {}),
      ...(primeiro.codigo_tributacao_municipio
        ? { codigo_tributacao_municipio: primeiro.codigo_tributacao_municipio }
        : {}),
      discriminacao,
      codigo_municipio: soDigitos(prestador.codigo_municipio),
      iss_retido: issRetido,
      responsavel_retencao: issRetido ? 1 : 0,
      quantidade: 1,
      valores: {
        valor_unitario: real2(totalLiquidoCent / 100),
        valor_servicos: real2(totalBrutoCent / 100),
        desconto_incondicionado: real2(descontoCent / 100),
        valor_iss: real2(issTotalCent / 100),
        ...(issRetido ? { valor_iss_retido: real2(issTotalCent / 100) } : {}),
        aliquota_iss: primeiro.aliquota_iss,
        valor_liquido: real2((totalLiquidoCent - (issRetido ? issTotalCent : 0)) / 100)
      }
    }
  }

  return { ambiente, rps }
}

function montarTomador(t: TomadorNfse): Record<string, unknown> {
  const doc = soDigitos(t.cnpj ?? '') || soDigitos(t.cpf ?? '')
  const e = t.endereco
  const endereco =
    e && (e.logradouro || e.codigo_municipio)
      ? {
          ...(e.logradouro ? { logradouro: e.logradouro } : {}),
          ...(e.numero ? { numero: e.numero } : {}),
          ...(e.complemento ? { complemento: e.complemento } : {}),
          ...(e.bairro ? { bairro: e.bairro } : {}),
          ...(e.cidade ? { cidade: e.cidade } : {}),
          ...(e.uf ? { uf: e.uf } : {}),
          ...(e.cep ? { cep: soDigitos(e.cep) } : {}),
          ...(e.codigo_municipio ? { codigo_municipio: soDigitos(e.codigo_municipio) } : {})
        }
      : undefined

  return {
    nome_razao_social: t.nome.trim(),
    ...(doc ? { cpf_cnpj: doc } : {}),
    ...(t.inscricao_municipal ? { inscricao_municipal: t.inscricao_municipal } : {}),
    ...(t.email ? { email: t.email } : {}),
    ...(t.telefone ? { fone: soDigitos(t.telefone) } : {}),
    ...(endereco ? { endereco } : {})
  }
}

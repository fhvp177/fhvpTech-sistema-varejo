// Comprovantes térmicos (~76mm) da Ordem de Serviço, no mesmo estilo do cupom
// de venda e do comprovante de devolução (fonte única de dados da loja).
//
// - ENTRADA: impresso ao receber o aparelho na bancada — protege as duas
//   partes (o que ficou, em que estado, qual o defeito relatado).
// - ENTREGA: impresso no fechamento — serviços/peças, valores e a garantia
//   com data de validade.

import { logoHtml } from './cupomVenda'
import { nomeImpressao } from './nomeImpressao'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'
import { qrPixParaDocumento } from '@fhvptech/core/lib/qrCodePix'
import { blocoPixHtml, CSS_PIX } from './blocoPix'

export type DadosComprovanteOS = {
  id: number
  tipo_atendimento: 'bancada' | 'externo'
  natureza?: 'conserto' | 'instalacao'
  categoria?: 'equipamento' | 'cftv'
  cliente_nome?: string
  cliente_telefone?: string | null
  tecnico_nome?: string
  criada_em: string
  equipamento: string | null
  numero_serie: string | null
  acessorios: string | null
  estado_entrada: string | null
  endereco_atendimento: string | null
  defeito_relatado: string
  diagnostico: string | null
  garantia_dias: number
  entregue_em: string | null
  garantia_ate?: string | null
  venda_id: number | null
  /**
   * Quanto ainda falta receber pela OS. Vem da venda vinculada, consultada na
   * hora de imprimir — e não calculado a partir dos itens de propósito: só a
   * venda sabe o que foi pago depois da entrega.
   *
   * Nulo ou zero significa "nada a receber", e aí o QR passa a cobrar o total
   * dos itens (ver a decisão no ponto onde o QR é montado). O único comprovante
   * que sai sem QR é o de entrega sem cobrança, onde não há itens.
   */
  saldo_em_aberto?: number | null
  itens: Array<{
    produto_nome?: string
    tamanho?: string | null
    quantidade: number
    preco_unitario: number
  }>
}

const fmt = (valor: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 'YYYY-MM-DD[ HH:MM[:SS]]' → 'DD/MM/AAAA[ HH:MM]' sem passar pelo Date (o
// banco grava hora local; parsear como UTC deslocaria o horário).
const fmtData = (iso: string | null, comHora = false): string => {
  if (!iso) return '—'
  const d = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  const hora = iso.length >= 16 ? iso.slice(11, 16) : ''
  return comHora && hora ? `${d} ${hora}` : d
}

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const numeroOS = (id: number): string => String(id).padStart(3, '0')

// Casca comum dos dois comprovantes (CSS térmico + cabeçalho + rodapé legal).
function montarPagina(titulo: string, loja: DadosLoja, corpo: string, tituloDoc: string): string {
  const lojaLinhas: string[] = [`<div class="loja-nome">${escapar(loja.nome)}</div>`]
  if (loja.telefone) lojaLinhas.push(`<div>${escapar(loja.telefone)}</div>`)

  const rodapeLinhas: string[] = []
  if (loja.nome) rodapeLinhas.push(`<div class="nome-loja">${escapar(loja.nome)}</div>`)
  if (loja.razao_social) rodapeLinhas.push(`<div>${escapar(loja.razao_social)}</div>`)
  if (loja.cnpj) rodapeLinhas.push(`<div>CNPJ: ${escapar(loja.cnpj)}</div>`)
  if (loja.endereco) rodapeLinhas.push(`<div>${escapar(loja.endereco)}</div>`)
  const cidadeUfCep = linhaCidadeUf(loja)
  if (cidadeUfCep) rodapeLinhas.push(`<div>${escapar(cidadeUfCep)}</div>`)
  const rodapeHtml = rodapeLinhas.length
    ? `<div class="rodape-loja">\n    ${rodapeLinhas.join('\n    ')}\n  </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${tituloDoc}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* 2mm, não 4: a cabeça térmica alcança 72,07mm a partir da borda
       esquerda do papel, e o corpo do cupom tem 68mm. Com 4mm de cada lado
       o conteúdo terminaria em 72,00mm — 0,07mm de folga, ou seja, nenhuma. */
    @page { margin: 2mm; }
    /* Tudo em negrito, de propósito — ver o comentário em cupomVenda.ts:
       a 203dpi o traço fino do Courier vira ponto solto, e o negrito não. */
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px; font-weight: bold; color: #000; background: #fff;
    }
    /* 68mm = cabe nos 72,07mm que a térmica desenha (a conta está em cupomVenda.ts). */
    body { width: 68mm; max-width: 100%; margin: 0 auto; padding: 2mm 1mm; line-height: 1.35; overflow-wrap: anywhere; }
    .cabecalho { margin-bottom: 4px; }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .loja-nome { font-weight: bold; font-size: 13px; }
    /* Divisória única e tracejada, do jeito clássico de cupom. Antes havia
       duas: uma '2px double' pras seções e uma '1px dashed' pro resto. A dupla
       não sobrevive a 203dpi — o vão do meio some no arredondamento e ela sai
       como uma tarja preta grossa. A tracejada imprime como tracejado mesmo. */
    .divisoria { border-top: 1px dashed #000; margin: 4px 0; }
    .titulo-secao { text-align: center; font-weight: bold; font-size: 12px; margin: 2px 0; }
    .pedido-num { text-align: center; font-weight: bold; font-size: 13px; padding: 2px 0; }
    .bloco { font-size: 11px; }
    .bloco div { white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table th, table td { padding: 1px 2px; vertical-align: top; text-align: left; }
    table th { font-weight: bold; }
    /* padding-left = sarjeta entre os números (a conta está em cupomVenda.ts). */
    .col-num { text-align: right; white-space: nowrap; padding-left: 8px; }
    .col-nome { word-break: break-word; }
    .total-linha { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; padding: 2px 0; }
    .aviso { text-align: center; font-size: 10.5px; margin: 6px 0; font-weight: bold; }${CSS_PIX}
    .aviso-fraco { font-size: 10px; margin: 6px 0; text-align: justify; }
    .assinatura { margin-top: 44px; text-align: center; font-size: 10.5px; }
    .assinatura .linha { border-top: 1px solid #000; margin: 0 4mm 2px; }
    .rodape-loja { margin-top: 14px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; line-height: 1.4; }
    .rodape-loja .nome-loja { font-weight: bold; font-size: 11px; margin-bottom: 1px; }
    /* Sem soltar a largura aqui — era isso que picava o cupom na térmica.
       Explicação inteira em cupomVenda.ts. */
    @media print { body { margin: 0; padding: 0 0 4mm; } }
  </style>
</head>
<body>
  <div class="cabecalho">
    ${logoHtml(loja)}
    ${lojaLinhas.join('\n    ')}
  </div>

  <div class="divisoria"></div>
  <div class="pedido-num">${titulo}</div>
  <div class="divisoria"></div>

  ${corpo}

  ${rodapeHtml}
</body>
</html>`
}

export function gerarHtmlComprovanteEntradaOS(os: DadosComprovanteOS, loja: DadosLoja): string {
  const linhas: string[] = [
    `<div>Data....: ${fmtData(os.criada_em, true)}</div>`,
    `<div>Cliente.: ${escapar(os.cliente_nome ?? '—')}</div>`
  ]
  if (os.cliente_telefone) linhas.push(`<div>Telefone: ${escapar(os.cliente_telefone)}</div>`)
  if (os.tecnico_nome) linhas.push(`<div>Técnico.: ${escapar(os.tecnico_nome)}</div>`)

  const equipLinhas: string[] = []
  if (os.tipo_atendimento === 'bancada') {
    if (os.equipamento) equipLinhas.push(`<div>Aparelho: ${escapar(os.equipamento)}</div>`)
    if (os.numero_serie) equipLinhas.push(`<div>Série...: ${escapar(os.numero_serie)}</div>`)
    if (os.acessorios) equipLinhas.push(`<div>Ficou...: ${escapar(os.acessorios)}</div>`)
    if (os.estado_entrada) equipLinhas.push(`<div>Estado..: ${escapar(os.estado_entrada)}</div>`)
  } else {
    if (os.endereco_atendimento) equipLinhas.push(`<div>Endereço: ${escapar(os.endereco_atendimento)}</div>`)
    if (os.equipamento) equipLinhas.push(`<div>Sistema.: ${escapar(os.equipamento)}</div>`)
  }

  const corpo = `
  <div class="pedido-num" style="font-size:12px;">ORDEM DE SERVIÇO N° ${numeroOS(os.id)}</div>
  <div class="divisoria"></div>

  <div class="bloco">
    ${linhas.join('\n    ')}
  </div>

  <div class="divisoria"></div>
  <div class="titulo-secao">${os.tipo_atendimento === 'bancada' ? 'EQUIPAMENTO RECEBIDO' : os.categoria === 'cftv' ? 'SISTEMA CFTV — NO LOCAL' : 'ATENDIMENTO EXTERNO'}</div>
  <div class="bloco">
    ${equipLinhas.join('\n    ') || '<div>—</div>'}
  </div>

  <div class="divisoria"></div>
  <div class="titulo-secao">${os.natureza === 'instalacao' ? 'SERVIÇO SOLICITADO' : 'DEFEITO RELATADO'}</div>
  <div class="bloco"><div>${escapar(os.defeito_relatado)}</div></div>

  <div class="divisoria"></div>
  <div class="aviso-fraco">Nenhum serviço será executado antes da aprovação do orçamento pelo cliente. Guarde este comprovante: ele será solicitado na retirada do equipamento.</div>
  <div class="aviso">*** Este comprovante não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>`

  return montarPagina('COMPROVANTE DE ENTRADA', loja, corpo, nomeImpressao.osEntrada(os.id))
}

export function gerarHtmlComprovanteEntregaOS(os: DadosComprovanteOS, loja: DadosLoja): string {
  const linhas: string[] = [
    `<div>Entrega.: ${fmtData(os.entregue_em, true)}</div>`,
    `<div>Cliente.: ${escapar(os.cliente_nome ?? '—')}</div>`
  ]
  if (os.tipo_atendimento === 'bancada' && os.equipamento) {
    linhas.push(`<div>Aparelho: ${escapar(os.equipamento)}${os.numero_serie ? ` (série ${escapar(os.numero_serie)})` : ''}</div>`)
  }
  if (os.tipo_atendimento === 'externo' && os.endereco_atendimento) {
    linhas.push(`<div>Endereço: ${escapar(os.endereco_atendimento)}</div>`)
  }
  if (os.tipo_atendimento === 'externo' && os.equipamento) {
    linhas.push(`<div>Sistema.: ${escapar(os.equipamento)}</div>`)
  }
  if (os.venda_id != null) {
    linhas.push(`<div>Venda...: N° ${String(os.venda_id).padStart(3, '0')}</div>`)
  }

  const total = os.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const itensHtml = os.itens
    .map((item) => {
      const nome = escapar(`${item.produto_nome ?? '—'}${item.tamanho ? ` (${item.tamanho})` : ''}`)
      return `
        <tr>
          <td class="col-nome">${nome}</td>
          <td class="col-num">${item.quantidade.toLocaleString('pt-BR')}</td>
          <td class="col-num">${fmt(item.preco_unitario)}</td>
          <td class="col-num">${fmt(item.quantidade * item.preco_unitario)}</td>
        </tr>`
    })
    .join('')

  const secaoServicos = os.itens.length
    ? `
  <div class="divisoria"></div>
  <div class="titulo-secao">SERVIÇOS E PEÇAS</div>
  <table>
    <thead>
      <tr>
        <th class="col-nome">Descrição</th>
        <th class="col-num">Qtd.</th>
        <th class="col-num">Unit.</th>
        <th class="col-num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
    </tbody>
  </table>
  <div class="divisoria"></div>
  <div class="total-linha">
    <span>Total:</span>
    <span>${fmt(total)}</span>
  </div>`
    : `
  <div class="divisoria"></div>
  <div class="titulo-secao">ENTREGA SEM COBRANÇA</div>`

  const garantiaHtml =
    os.garantia_dias > 0
      ? `<div class="aviso">GARANTIA DE ${os.garantia_dias} DIAS<br>Válida até ${fmtData(os.garantia_ate ?? null)}</div>
  <div class="aviso-fraco">A garantia cobre o serviço executado e as peças aplicadas, descrito(s) acima. Não cobre novos defeitos, mau uso, quedas ou contato com líquidos.</div>`
      : `<div class="aviso-fraco">Serviço entregue sem garantia contratual.</div>`

  // Quanto este comprovante cobra. O saldo vem pronto de quem chamou, que
  // consultou a venda vinculada AGORA — só ela sabe o que aconteceu depois da
  // entrega. Sem saldo a receber, cobra o total dos serviços e peças: é a mesma
  // decisão tomada no cupom de venda (2026-08-06), todo comprovante impresso
  // sai com QR, porque na hora da entrega o cliente costuma pagar ali mesmo e
  // a OS já pode estar marcada como quitada.
  //
  // ⚠️ Inclui a 2ª via de uma OS que o cliente já pagou: ele pode pagar de novo
  // e o papel não avisa ninguém. Risco aceito pelo lojista — desfazer é voltar
  // a passar só `saldoEmAberto`.
  //
  // Entrega sem cobrança (cortesia, garantia) continua sem QR: sem itens o
  // total é zero e não há o que cobrar.
  const saldoEmAberto = os.saldo_em_aberto ?? 0
  const pix = qrPixParaDocumento({
    chave: loja.pix_chave,
    tipo: loja.pix_tipo || undefined,
    beneficiario: loja.nome || loja.razao_social,
    cidade: loja.cidade,
    valorACobrar: saldoEmAberto > 0 ? saldoEmAberto : total
  })

  // Mesma lógica do cupom: com dívida em aberto o imperativo é um convite
  // legítimo; sem dívida, vira etiqueta pra não cobrar quem já pagou.
  const tituloPix = saldoEmAberto > 0 ? 'PAGUE COM PIX' : 'PAGAMENTO POR PIX'

  const diagnosticoHtml = os.diagnostico
    ? `
  <div class="divisoria"></div>
  <div class="titulo-secao">SERVIÇO EXECUTADO</div>
  <div class="bloco"><div>${escapar(os.diagnostico)}</div></div>`
    : ''

  const corpo = `
  <div class="pedido-num" style="font-size:12px;">ORDEM DE SERVIÇO N° ${numeroOS(os.id)}</div>
  <div class="divisoria"></div>

  <div class="bloco">
    ${linhas.join('\n    ')}
  </div>
  ${diagnosticoHtml}
  ${secaoServicos}
${blocoPixHtml(pix, { titulo: tituloPix })}

  <div class="divisoria"></div>
  ${garantiaHtml}
  <div class="aviso">*** Este comprovante não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>`

  return montarPagina('COMPROVANTE DE ENTREGA', loja, corpo, nomeImpressao.osEntrega(os.id))
}

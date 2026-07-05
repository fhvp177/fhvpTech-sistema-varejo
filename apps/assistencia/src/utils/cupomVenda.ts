// Gera o HTML do cupom não fiscal de uma venda, no formato estilo térmico
// (largura ~76mm) mas compatível também com impressão em folha comum (A4),
// onde o conteúdo aparece centralizado.

import { nomeImpressao } from './nomeImpressao'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'

type ItemCupom = {
  produto_nome?: string
  codigo_barras?: string
  quantidade: number
  preco_unitario: number
}

type ParcelaCupom = {
  numero: number
  valor: number
  data_vencimento: string
  status: 'pendente' | 'pago' | 'inadimplente'
}

type StatusPagamentoCupom = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

export type DadosCupomVenda = {
  id: number
  data: string
  total: number
  desconto?: number
  entrada?: number
  valor_pago: number
  status_pagamento: StatusPagamentoCupom
  data_vencimento: string | null
  num_parcelas: number | null
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_endereco?: string | null
  cliente_cpf?: string | null
  cliente_tipo_pessoa?: 'fisica' | 'juridica' | null
  cliente_cnpj?: string | null
  cliente_razao_social?: string | null
  vendedor_nome?: string | null
  itens: ItemCupom[]
  parcelas: ParcelaCupom[]
}

// Monta o <img> da logo só quando há logo configurada e a exibição está ligada.
// Valida o prefixo data:image/ por segurança (o valor vem da config local).
// Exportado pra ser reusado pelo comprovante de devolução (mesma fonte).
export function logoHtml(loja: DadosLoja): string {
  if (!loja.exibir_logo || !loja.logo || !loja.logo.startsWith('data:image/')) return ''
  return `<div class="logo-wrap"><img class="logo" src="${loja.logo}" alt="" /></div>`
}

const fmt = (valor: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDataHora = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const fmtDataCurta = (iso: string): string => {
  // aceita YYYY-MM-DD ou ISO completo
  const base = iso.length === 10 ? iso + 'T00:00' : iso
  return new Date(base).toLocaleDateString('pt-BR')
}

const FORMA_PAGAMENTO: Record<StatusPagamentoCupom, string> = {
  pago: 'À vista',
  pendente: 'A prazo',
  parcelado: 'Parcelado',
  inadimplente: 'Em atraso'
}

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function gerarHtmlCupomVenda(venda: DadosCupomVenda, loja: DadosLoja): string {
  const dataPedido = fmtDataHora(venda.data)
  const numeroPedido = String(venda.id).padStart(3, '0')
  const entrada = venda.entrada ?? 0

  const lojaLinhas: string[] = [
    `<div class="loja-nome">${escapar(loja.nome)}</div>`
  ]
  if (loja.telefone) lojaLinhas.push(`<div>${escapar(loja.telefone)}</div>`)
  if (venda.vendedor_nome) lojaLinhas.push(`<div>Técnico: ${escapar(venda.vendedor_nome)}</div>`)

  // Rodapé legal — só inclui as linhas preenchidas. Some inteiro se a loja não
  // tiver nenhum dado de rodapé configurado.
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

  const ehPj = venda.cliente_tipo_pessoa === 'juridica'
  const clienteNome = venda.cliente_nome || 'Venda avulsa'
  const clienteTelefone = venda.cliente_telefone || '-'
  const clienteEndereco = venda.cliente_endereco || '-'
  const clienteDocLabel = ehPj ? 'CNPJ...' : 'CPF....'
  const clienteDocValor = ehPj ? (venda.cliente_cnpj || '-') : (venda.cliente_cpf || '-')
  const clienteRazaoSocial = ehPj ? venda.cliente_razao_social : null

  const itensHtml = venda.itens
    .map((item) => {
      const nome = escapar(item.produto_nome ?? '—')
      const qtd = item.quantidade.toLocaleString('pt-BR', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
      })
      const unit = fmt(item.preco_unitario)
      const subtotal = fmt(item.quantidade * item.preco_unitario)
      return `
        <tr>
          <td class="col-nome">${nome}</td>
          <td class="col-num">${qtd}</td>
          <td class="col-num">${unit}</td>
          <td class="col-num">-</td>
          <td class="col-num">${subtotal}</td>
        </tr>`
    })
    .join('')

  // Bloco de pagamento — usa parcelas se houver, senão usa uma linha única
  const formaPgto = FORMA_PAGAMENTO[venda.status_pagamento]
  const linhasPagamento: string[] = []

  if (venda.parcelas.length > 0) {
    for (const p of venda.parcelas) {
      linhasPagamento.push(`
        <tr>
          <td>${fmtDataCurta(p.data_vencimento)}</td>
          <td class="col-num">${fmt(p.valor)}</td>
          <td>${formaPgto} ${venda.num_parcelas ? `${p.numero}/${venda.num_parcelas}` : ''}</td>
          <td>${p.status === 'pago' ? 'Pago' : p.status === 'inadimplente' ? 'Atrasada' : '-'}</td>
        </tr>`)
    }
  } else {
    const venc = venda.data_vencimento ? fmtDataCurta(venda.data_vencimento) : fmtDataCurta(venda.data)
    const obs =
      venda.status_pagamento === 'pago'
        ? 'Pago'
        : venda.status_pagamento === 'inadimplente'
          ? 'Em atraso'
          : '-'
    // Com entrada, a linha mostra o saldo devido no vencimento (não o total cheio).
    linhasPagamento.push(`
      <tr>
        <td>${venc}</td>
        <td class="col-num">${fmt(venda.total - entrada)}</td>
        <td>${formaPgto}</td>
        <td>${obs}</td>
      </tr>`)
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.cupomVenda(venda.id)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 4mm; }
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #000;
      background: #fff;
    }
    body {
      width: 76mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm 1mm;
      line-height: 1.35;
    }
    .cabecalho { margin-bottom: 4px; }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .loja-nome { font-weight: bold; font-size: 13px; }
    .linha-dupla { border-top: 2px double #000; margin: 4px 0; }
    .linha-simples { border-top: 1px dashed #000; margin: 4px 0; }
    .titulo-secao {
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      margin: 2px 0;
    }
    .pedido-num {
      text-align: center;
      font-weight: bold;
      font-size: 13px;
      padding: 2px 0;
    }
    .linha-data {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .bloco-cliente { font-size: 11px; }
    .bloco-cliente div { white-space: pre-wrap; word-break: break-word; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    table th, table td {
      padding: 1px 2px;
      vertical-align: top;
      text-align: left;
    }
    table th { font-weight: bold; }
    .col-num { text-align: right; white-space: nowrap; }
    .col-nome { word-break: break-word; }
    .total-linha {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 12px;
      padding: 2px 0;
    }
    .aviso {
      text-align: center;
      font-size: 10.5px;
      margin: 6px 0;
      font-weight: bold;
    }
    .assinatura {
      margin-top: 60px;
      text-align: center;
      font-size: 10.5px;
    }
    .assinatura .linha {
      border-top: 1px solid #000;
      margin: 0 4mm 2px;
    }
    .rodape-loja {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px dashed #000;
      text-align: center;
      font-size: 10px;
      line-height: 1.4;
    }
    .rodape-loja .nome-loja {
      font-weight: bold;
      font-size: 11px;
      margin-bottom: 1px;
    }
    @media print {
      html, body { width: auto; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="cabecalho">
    ${logoHtml(loja)}
    ${lojaLinhas.join('\n    ')}
  </div>

  <div class="linha-dupla"></div>
  <div class="pedido-num">PEDIDO N° ${numeroPedido}</div>
  <div class="linha-dupla"></div>

  <div class="linha-data">
    <span>Data: ${dataPedido}</span>
  </div>

  <div class="bloco-cliente">
    <div>Cliente.: ${escapar(clienteNome)}</div>${clienteRazaoSocial ? `
    <div>Razão...: ${escapar(clienteRazaoSocial)}</div>` : ''}
    <div>Endereço: ${escapar(clienteEndereco)}</div>
    <div>${clienteDocLabel}: ${escapar(clienteDocValor)}</div>
    <div>Telefone: ${escapar(clienteTelefone)}</div>
  </div>

  <div class="linha-dupla"></div>
  <div class="titulo-secao">PRODUTOS</div>
  <div class="linha-dupla"></div>

  <table>
    <thead>
      <tr>
        <th class="col-nome">Nome</th>
        <th class="col-num">Qtd.</th>
        <th class="col-num">Vr. unt.</th>
        <th class="col-num">Desc.</th>
        <th class="col-num">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
    </tbody>
  </table>

  <div class="linha-dupla"></div>
  <div class="titulo-secao">PAGAMENTO</div>
  <div class="linha-dupla"></div>

  ${(venda.desconto ?? 0) > 0 ? `
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>Subtotal:</span>
    <span>${fmt(venda.total + (venda.desconto ?? 0))}</span>
  </div>
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>Desconto:</span>
    <span>- ${fmt(venda.desconto ?? 0)}</span>
  </div>` : ''}
  <div class="total-linha">
    <span>Total do pedido:</span>
    <span>${fmt(venda.total)}</span>
  </div>
  ${entrada > 0 ? `
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>Entrada (paga):</span>
    <span>- ${fmt(entrada)}</span>
  </div>
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>${venda.num_parcelas ? 'A parcelar:' : 'Saldo a prazo:'}</span>
    <span>${fmt(venda.total - entrada)}</span>
  </div>` : ''}

  <div class="linha-simples"></div>

  <table>
    <thead>
      <tr>
        <th>Vencimento</th>
        <th class="col-num">Valor</th>
        <th>Forma de pagamento</th>
        <th>Obs.</th>
      </tr>
    </thead>
    <tbody>
      ${linhasPagamento.join('\n      ')}
    </tbody>
  </table>

  <div class="linha-simples"></div>

  <div class="aviso">*** Este cupom não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>

  ${rodapeHtml}
</body>
</html>`
}

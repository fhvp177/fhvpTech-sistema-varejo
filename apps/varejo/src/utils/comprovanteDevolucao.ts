// Gera o HTML do comprovante de devolução, no mesmo estilo térmico (~76mm) do
// cupom de venda. Reusa os dados da loja de cupomVenda (fonte única).

import { logoHtml } from './cupomVenda'
import { nomeImpressao } from './nomeImpressao'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'

export type DadosComprovanteDevolucao = {
  id: number
  venda_id: number
  data: string
  tipo: 'credito' | 'dinheiro'
  valor_total: number
  cliente_nome?: string | null
  motivo?: string | null
  // Saldo de crédito do cliente APÓS esta devolução (só para tipo='credito').
  saldo_credito_novo?: number | null
  vendedor_nome?: string | null
  itens: Array<{ produto_nome: string; quantidade: number; valor_unitario: number }>
}

const fmt = (valor: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDataHora = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function gerarHtmlComprovanteDevolucao(dev: DadosComprovanteDevolucao, loja: DadosLoja): string {
  const numeroDev = String(dev.id).padStart(3, '0')
  const numeroPedido = String(dev.venda_id).padStart(3, '0')

  // Loja sem nome (identidade ainda não preenchida) não imprime linha vazia.
  const lojaLinhas: string[] = []
  if (loja.nome) lojaLinhas.push(`<div class="loja-nome">${escapar(loja.nome)}</div>`)
  if (loja.telefone) lojaLinhas.push(`<div>${escapar(loja.telefone)}</div>`)
  if (dev.vendedor_nome) lojaLinhas.push(`<div>Atendente: ${escapar(dev.vendedor_nome)}</div>`)

  // Rodapé legal — só as linhas preenchidas; some inteiro se não houver dados.
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

  const itensHtml = dev.itens
    .map((item) => {
      const nome = escapar(item.produto_nome ?? '—')
      const qtd = item.quantidade.toLocaleString('pt-BR')
      const unit = fmt(item.valor_unitario)
      const subtotal = fmt(item.quantidade * item.valor_unitario)
      return `
        <tr>
          <td class="col-nome">${nome}</td>
          <td class="col-num">${qtd}</td>
          <td class="col-num">${unit}</td>
          <td class="col-num">${subtotal}</td>
        </tr>`
    })
    .join('')

  const formaTexto = dev.tipo === 'credito' ? 'Crédito na loja' : 'Dinheiro de volta'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.devolucao(dev.id, dev.venda_id)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 4mm; }
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px; color: #000; background: #fff;
    }
    body { width: 76mm; max-width: 100%; margin: 0 auto; padding: 2mm 1mm; line-height: 1.35; }
    .cabecalho { margin-bottom: 4px; }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .loja-nome { font-weight: bold; font-size: 13px; }
    .linha-dupla { border-top: 2px double #000; margin: 4px 0; }
    .linha-simples { border-top: 1px dashed #000; margin: 4px 0; }
    .titulo-secao { text-align: center; font-weight: bold; font-size: 12px; margin: 2px 0; }
    .pedido-num { text-align: center; font-weight: bold; font-size: 13px; padding: 2px 0; }
    .bloco-cliente { font-size: 11px; }
    .bloco-cliente div { white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table th, table td { padding: 1px 2px; vertical-align: top; text-align: left; }
    table th { font-weight: bold; }
    .col-num { text-align: right; white-space: nowrap; }
    .col-nome { word-break: break-word; }
    .total-linha { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; padding: 2px 0; }
    .aviso { text-align: center; font-size: 10.5px; margin: 6px 0; font-weight: bold; }
    .assinatura { margin-top: 50px; text-align: center; font-size: 10.5px; }
    .assinatura .linha { border-top: 1px solid #000; margin: 0 4mm 2px; }
    .rodape-loja { margin-top: 14px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; line-height: 1.4; }
    .rodape-loja .nome-loja { font-weight: bold; font-size: 11px; margin-bottom: 1px; }
    @media print { html, body { width: auto; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="cabecalho">
    ${logoHtml(loja)}
    ${lojaLinhas.join('\n    ')}
  </div>

  <div class="linha-dupla"></div>
  <div class="pedido-num">COMPROVANTE DE DEVOLUÇÃO</div>
  <div class="pedido-num" style="font-size:12px;">N° ${numeroDev} — ref. pedido N° ${numeroPedido}</div>
  <div class="linha-dupla"></div>

  <div class="bloco-cliente">
    <div>Data....: ${fmtDataHora(dev.data)}</div>
    <div>Cliente.: ${escapar(dev.cliente_nome || 'Venda avulsa')}</div>${
      dev.motivo ? `
    <div>Motivo..: ${escapar(dev.motivo)}</div>` : ''
    }
  </div>

  <div class="linha-dupla"></div>
  <div class="titulo-secao">ITENS DEVOLVIDOS</div>
  <div class="linha-dupla"></div>

  <table>
    <thead>
      <tr>
        <th class="col-nome">Nome</th>
        <th class="col-num">Qtd.</th>
        <th class="col-num">Vr. unt.</th>
        <th class="col-num">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
    </tbody>
  </table>

  <div class="linha-simples"></div>

  <div class="total-linha">
    <span>Total devolvido:</span>
    <span>${fmt(dev.valor_total)}</span>
  </div>
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>Forma:</span>
    <span>${formaTexto}</span>
  </div>${
    dev.tipo === 'credito' && dev.saldo_credito_novo != null
      ? `
  <div class="total-linha" style="font-weight: normal; font-size: 11px;">
    <span>Saldo de crédito:</span>
    <span>${fmt(dev.saldo_credito_novo)}</span>
  </div>`
      : ''
  }

  <div class="linha-simples"></div>
  <div class="aviso">*** Este comprovante não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>

  ${rodapeHtml}
</body>
</html>`
}

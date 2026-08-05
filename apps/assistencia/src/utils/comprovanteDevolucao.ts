// Gera o HTML do comprovante de devolução, no mesmo estilo térmico (bobina de
// 80mm) do cupom de venda. Reusa os dados da loja de cupomVenda (fonte única).

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
    .bloco-cliente { font-size: 11px; }
    .bloco-cliente div { white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table th, table td { padding: 1px 2px; vertical-align: top; text-align: left; }
    table th { font-weight: bold; }
    /* padding-left = sarjeta entre os números (a conta está em cupomVenda.ts). */
    .col-num { text-align: right; white-space: nowrap; padding-left: 8px; }
    .col-nome { word-break: break-word; }
    .total-linha { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; padding: 2px 0; }
    .aviso { text-align: center; font-size: 10.5px; margin: 6px 0; font-weight: bold; }
    .assinatura { margin-top: 50px; text-align: center; font-size: 10.5px; }
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
  <div class="pedido-num">COMPROVANTE DE DEVOLUÇÃO</div>
  <div class="pedido-num" style="font-size:12px;">N° ${numeroDev} — ref. pedido N° ${numeroPedido}</div>
  <div class="divisoria"></div>

  <div class="bloco-cliente">
    <div>Data....: ${fmtDataHora(dev.data)}</div>
    <div>Cliente.: ${escapar(dev.cliente_nome || 'Venda avulsa')}</div>${
      dev.motivo ? `
    <div>Motivo..: ${escapar(dev.motivo)}</div>` : ''
    }
  </div>

  <div class="divisoria"></div>
  <div class="titulo-secao">ITENS DEVOLVIDOS</div>
  <div class="divisoria"></div>

  <table>
    <thead>
      <tr>
        <th class="col-nome">Item</th>
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
    <span>Total devolvido:</span>
    <span>${fmt(dev.valor_total)}</span>
  </div>
  <div class="total-linha" style="font-size: 11px;">
    <span>Forma:</span>
    <span>${formaTexto}</span>
  </div>${
    dev.tipo === 'credito' && dev.saldo_credito_novo != null
      ? `
  <div class="total-linha" style="font-size: 11px;">
    <span>Saldo de crédito:</span>
    <span>${fmt(dev.saldo_credito_novo)}</span>
  </div>`
      : ''
  }

  <div class="divisoria"></div>
  <div class="aviso">*** Este comprovante não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>

  ${rodapeHtml}
</body>
</html>`
}

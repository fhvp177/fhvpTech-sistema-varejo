// Comprovantes de empréstimo, no formato térmico de 80mm — o mesmo do cupom de
// venda e do comprovante de devolução (as medidas e o porquê do negrito estão
// em cupomVenda.ts; aqui só se reusa).
//
// São dois papéis, com propósitos diferentes:
//   • ENTREGA: sai quando o dinheiro sai da mão. Declara quanto foi emprestado,
//     quanto será devolvido e até quando. Tem linha de assinatura do devedor,
//     porque é ele quem está assumindo a dívida.
//   • PAGAMENTO: sai quando o devedor paga (inteiro ou em parte). Declara o que
//     foi recebido e quanto ainda falta. Quem assina aqui é a loja, que é quem
//     está dando quitação.
//
// ⚠️ NENHUM dos dois leva QR de PIX, ao contrário do cupom de venda. Nos dois
// momentos o pagamento JÁ ACONTECEU (no primeiro o dinheiro saiu; no segundo,
// entrou). Um QR de recebimento aqui só teria como efeito alguém pagar de novo.
// O lugar certo do QR é o carnê — papel que o cliente leva pra casa com parcela
// em aberto — e ele chega junto com o carnê.

import { logoHtml } from './cupomVenda'
import { valorPorExtenso } from './valorPorExtenso'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'

export type EmprestimoImpresso = {
  id: number
  devedor_nome: string
  devedor_documento: string | null
  valor_principal: number
  valor_acordado: number
  data_emprestimo: string
  vencimento: string | null
  observacao: string | null
}

export type PagamentoImpresso = {
  devedor: string
  valor: number
  data: string
  restante: number
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtData = (iso: string): string => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

const agora = (): string =>
  new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Cabeçalho e rodapé são idênticos aos dos outros cupons — linha vazia não é
// impressa quando a loja ainda não preencheu a identidade.
function cabecalho(loja: DadosLoja): string {
  const linhas: string[] = []
  if (loja.nome) linhas.push(`<div class="loja-nome">${escapar(loja.nome)}</div>`)
  if (loja.telefone) linhas.push(`<div>${escapar(loja.telefone)}</div>`)
  return `<div class="cabecalho">\n    ${logoHtml(loja)}\n    ${linhas.join('\n    ')}\n  </div>`
}

function rodape(loja: DadosLoja): string {
  const linhas: string[] = []
  if (loja.nome) linhas.push(`<div class="nome-loja">${escapar(loja.nome)}</div>`)
  if (loja.razao_social) linhas.push(`<div>${escapar(loja.razao_social)}</div>`)
  if (loja.cnpj) linhas.push(`<div>CNPJ: ${escapar(loja.cnpj)}</div>`)
  if (loja.endereco) linhas.push(`<div>${escapar(loja.endereco)}</div>`)
  const cidadeUfCep = linhaCidadeUf(loja)
  if (cidadeUfCep) linhas.push(`<div>${escapar(cidadeUfCep)}</div>`)
  return linhas.length
    ? `<div class="rodape-loja">\n    ${linhas.join('\n    ')}\n  </div>`
    : ''
}

const ESTILO = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* 2mm: a cabeça térmica alcança 72,07mm e o corpo tem 68mm — a conta
       inteira está em cupomVenda.ts. */
    @page { margin: 2mm; }
    /* Tudo negrito de propósito: a 203dpi o traço fino do Courier vira ponto
       solto. Ver cupomVenda.ts. */
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px; font-weight: bold; color: #000; background: #fff;
    }
    body { width: 68mm; max-width: 100%; margin: 0 auto; padding: 2mm 1mm; line-height: 1.35; overflow-wrap: anywhere; }
    .cabecalho { margin-bottom: 4px; }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .loja-nome { font-weight: bold; font-size: 13px; }
    /* Tracejada simples: a '2px double' não sobrevive a 203dpi (vira tarja). */
    .divisoria { border-top: 1px dashed #000; margin: 4px 0; }
    .titulo { text-align: center; font-weight: bold; font-size: 13px; padding: 2px 0; }
    .bloco div { white-space: pre-wrap; word-break: break-word; }
    .total-linha { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; padding: 2px 0; }
    .extenso { font-size: 10.5px; text-align: center; margin: 4px 0; }
    .declaracao { font-size: 10.5px; margin: 6px 0; text-align: justify; }
    .aviso { text-align: center; font-size: 10.5px; margin: 6px 0; font-weight: bold; }
    .assinatura { margin-top: 50px; text-align: center; font-size: 10.5px; }
    .assinatura .linha { border-top: 1px solid #000; margin: 0 4mm 2px; }
    .rodape-loja { margin-top: 14px; padding-top: 6px; border-top: 1px dashed #000; text-align: center; font-size: 10px; line-height: 1.4; }
    .rodape-loja .nome-loja { font-weight: bold; font-size: 11px; margin-bottom: 1px; }
    /* Sem soltar a largura aqui — era isso que picava o cupom na térmica. */
    @media print { body { margin: 0; padding: 0 0 4mm; } }
`

/** Papel da ENTREGA do dinheiro — uma via para cada parte. */
export function comprovanteEmprestimoHtml(emp: EmprestimoImpresso, loja: DadosLoja): string {
  const numero = String(emp.id).padStart(3, '0')
  const doc = emp.devedor_documento ? `\n    <div>CPF/CNPJ: ${escapar(emp.devedor_documento)}</div>` : ''
  const venc = emp.vencimento
    ? `\n  <div class="total-linha" style="font-size:11px;"><span>Devolver até:</span><span>${fmtData(
        emp.vencimento
      )}</span></div>`
    : ''
  const obs = emp.observacao
    ? `\n  <div class="divisoria"></div>\n  <div class="bloco"><div>Obs.: ${escapar(
        emp.observacao
      )}</div></div>`
    : ''

  // O juros não é guardado como taxa: ele é a diferença entre o total combinado
  // e o capital. Sai no papel porque é o que as duas partes acertaram — um
  // comprovante que esconde o juros é pior que um que não tem juros nenhum.
  const jurosReais = +(emp.valor_acordado - emp.valor_principal).toFixed(2)
  const jurosLinha =
    jurosReais > 0
      ? `
  <div class="total-linha" style="font-size:11px;"><span>Juros combinado:</span><span>${fmt(
          jurosReais
        )} (${((jurosReais / emp.valor_principal) * 100).toLocaleString('pt-BR', {
          maximumFractionDigits: 2
        })}%)</span></div>`
      : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Emprestimo-${numero}-Comprovante</title>
  <style>${ESTILO}</style>
</head>
<body>
  ${cabecalho(loja)}

  <div class="divisoria"></div>
  <div class="titulo">COMPROVANTE DE EMPRÉSTIMO</div>
  <div class="titulo" style="font-size:12px;">N° ${numero}</div>
  <div class="divisoria"></div>

  <div class="bloco">
    <div>Data....: ${fmtData(emp.data_emprestimo)}</div>
    <div>Devedor.: ${escapar(emp.devedor_nome)}</div>${doc}
  </div>

  <div class="divisoria"></div>

  <div class="total-linha">
    <span>Valor emprestado:</span>
    <span>${fmt(emp.valor_principal)}</span>
  </div>${jurosLinha}
  <div class="total-linha">
    <span>Total a devolver:</span>
    <span>${fmt(emp.valor_acordado)}</span>
  </div>${venc}

  <div class="extenso">(${escapar(valorPorExtenso(emp.valor_acordado))})</div>

  <div class="divisoria"></div>

  <div class="declaracao">
    Declaro ter recebido a quantia de R$ ${fmt(
      emp.valor_principal
    )} e me comprometo a devolver o total de R$ ${fmt(emp.valor_acordado)}${
      emp.vencimento ? ` até ${fmtData(emp.vencimento)}` : ''
    }.
  </div>${obs}

  <div class="divisoria"></div>
  <div class="aviso">*** Este comprovante não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    ${escapar(emp.devedor_nome)}
  </div>

  ${rodape(loja)}
</body>
</html>`
}

/** Recibo de um PAGAMENTO recebido — quitação parcial ou total. */
export function reciboPagamentoEmprestimoHtml(pag: PagamentoImpresso, loja: DadosLoja): string {
  const quitado = pag.restante <= 0
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Emprestimo-Recibo-Pagamento</title>
  <style>${ESTILO}</style>
</head>
<body>
  ${cabecalho(loja)}

  <div class="divisoria"></div>
  <div class="titulo">RECIBO DE PAGAMENTO</div>
  <div class="divisoria"></div>

  <div class="bloco">
    <div>Data....: ${fmtData(pag.data)}</div>
    <div>Recebido de: ${escapar(pag.devedor)}</div>
    <div>Emitido em: ${agora()}</div>
  </div>

  <div class="divisoria"></div>

  <div class="total-linha">
    <span>Valor recebido:</span>
    <span>${fmt(pag.valor)}</span>
  </div>
  <div class="total-linha" style="font-size:11px;">
    <span>${quitado ? 'Situação:' : 'Ainda falta:'}</span>
    <span>${quitado ? 'QUITADO' : fmt(pag.restante)}</span>
  </div>

  <div class="extenso">(${escapar(valorPorExtenso(pag.valor))})</div>

  <div class="divisoria"></div>

  <div class="declaracao">
    ${
      quitado
        ? `Dou plena quitação do empréstimo, nada mais havendo a receber.`
        : `Recebi a importância acima como pagamento parcial do empréstimo, restando R$ ${fmt(
            pag.restante
          )} a receber.`
    }
  </div>

  <div class="divisoria"></div>
  <div class="aviso">*** Este recibo não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    ${escapar(loja.nome || 'Assinatura')}
  </div>

  ${rodape(loja)}
</body>
</html>`
}

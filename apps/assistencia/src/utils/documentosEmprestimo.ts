// Os dois papéis A4 do empréstimo: o CARNÊ e a PROMISSÓRIA.
//
// ── Por que A4, e não bobina como os outros dois ────────────────────────────
// O comprovante de entrega e o recibo de pagamento saem na térmica porque são
// dados na hora, no balcão, e vão pro bolso. Estes dois não: o carnê fica meses
// na casa do devedor sendo consultado, e a promissória é título de crédito — se
// um dia for cobrada, ela precisa ter cara de documento, não de cupom de
// mercado. Papel comum, tinta comum, arquivo fácil.
//
// ── O QR do PIX mora AQUI, e em nenhum outro papel do módulo ────────────────
// No comprovante de entrega e no recibo de pagamento o dinheiro já mudou de
// mãos — QR ali só faz alguém pagar duas vezes. No carnê é o contrário: ele é
// exatamente o papel que a pessoa leva pra casa com parcela EM ABERTO, e olha
// pra ele no dia do vencimento. Um QR por parcela, com o valor daquela parcela,
// tira a viagem até a loja.

import { qrPixParaDocumento } from '@fhvptech/core/lib/qrCodePix'
import { blocoPixHtml, CSS_PIX } from './blocoPix'
import { cabecalhoLoja, CSS_PAPEL_TIMBRADO, escaparHtml } from './papelTimbrado'
import { dataPorExtenso, localDoRecibo } from './documentoRecibo'
import { valorPorExtenso } from './valorPorExtenso'
import type { DadosLoja } from './dadosLoja'

export type ParcelaImpressa = {
  numero: number
  valor: number
  vencimento: string
  paga: number
}

export type EmprestimoImpressoA4 = {
  id: number
  devedor_nome: string
  devedor_documento: string | null
  valor_principal: number
  valor_acordado: number
  data_emprestimo: string
  vencimento: string | null
  observacao: string | null
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string | null): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

const CSS_BASE = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 12mm 14mm; }
    html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
    body { width: 100%; }
${CSS_PAPEL_TIMBRADO}
${CSS_PIX}
`

/* ══════════════════════════════════════════════════════════════════════════
 * CARNÊ
 * ══════════════════════════════════════════════════════════════════════════ */

const CSS_CARNE = `
    .canhotos { margin-top: 14px; }
    /* Cada parcela é um retângulo com tesoura no meio: a esquerda fica com a
       loja quando ela recebe, a direita fica com o devedor como comprovante.
       É o formato do carnê de loja que todo mundo já sabe usar. */
    .canhoto {
      display: flex; border: 1px solid #1a1a1a; border-radius: 4px;
      margin-bottom: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid;
    }
    .canhoto-loja {
      width: 34%; padding: 8px 10px; border-right: 1px dashed #1a1a1a; background: #fafafa;
    }
    .canhoto-cliente { flex: 1; padding: 8px 10px; display: flex; gap: 10px; align-items: center; }
    .canhoto-dados { flex: 1; }
    .canhoto-qr { width: 30mm; text-align: center; }
    .canhoto-qr svg { width: 26mm; height: 26mm; }
    .parcela-num { font-size: 15px; font-weight: 700; }
    .parcela-venc { font-size: 11px; color: #444; margin-top: 1px; }
    .parcela-valor { font-size: 17px; font-weight: 700; margin-top: 3px; }
    .rotulo { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #666; }
    .linha-assina { border-top: 1px solid #999; margin-top: 14px; padding-top: 2px; font-size: 9.5px; color: #666; }
    .paga { position: relative; opacity: 0.55; }
    .selo-paga {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%) rotate(-8deg);
      border: 2px solid #15803d; color: #15803d; font-weight: 700; font-size: 15px;
      padding: 2px 10px; border-radius: 4px; letter-spacing: 1px;
    }
    .resumo-carne { display: flex; gap: 18px; margin-top: 10px; font-size: 11.5px; }
    .resumo-carne b { font-size: 13px; }
    .aviso-rodape { margin-top: 12px; font-size: 10px; color: #555; text-align: center; }
`

/**
 * O carnê: um canhoto por parcela, com o QR do PIX daquela parcela.
 *
 * Parcela já paga sai com o selo PAGA e SEM QR — reimprimir um carnê meio pago
 * não pode virar convite pra pagar de novo o que já foi pago.
 */
export function carneEmprestimoHtml(
  emp: EmprestimoImpressoA4,
  parcelas: ParcelaImpressa[],
  loja: DadosLoja
): string {
  const numero = String(emp.id).padStart(3, '0')
  const emAberto = parcelas.filter((p) => p.paga === 0)
  const totalAberto = emAberto.reduce((s, p) => s + p.valor, 0)

  const canhotos = parcelas
    .map((p) => {
      const pix = p.paga
        ? null
        : qrPixParaDocumento({
            chave: loja.pix_chave,
            tipo: loja.pix_tipo || undefined,
            beneficiario: loja.nome || loja.razao_social,
            cidade: loja.cidade,
            valorACobrar: p.valor,
            larguraMmFixa: 26
          })

      return `
    <div class="canhoto${p.paga ? ' paga' : ''}">
      <div class="canhoto-loja">
        <div class="rotulo">Via da loja</div>
        <div class="parcela-num">Parcela ${p.numero}/${parcelas.length}</div>
        <div class="parcela-venc">Vence em ${fmtData(p.vencimento)}</div>
        <div class="parcela-valor">${fmt(p.valor)}</div>
        <div class="linha-assina">Recebido por</div>
      </div>
      <div class="canhoto-cliente">
        <div class="canhoto-dados">
          <div class="rotulo">Via do cliente &nbsp;·&nbsp; Empréstimo nº ${numero}</div>
          <div class="parcela-num">Parcela ${p.numero}/${parcelas.length}</div>
          <div class="parcela-venc">${escaparHtml(emp.devedor_nome)}</div>
          <div class="parcela-venc">Vence em ${fmtData(p.vencimento)}</div>
          <div class="parcela-valor">${fmt(p.valor)}</div>
        </div>
        ${
          pix
            ? `<div class="canhoto-qr">${pix.svg}<div class="rotulo" style="margin-top:2px">Pague com PIX</div></div>`
            : ''
        }
      </div>
      ${p.paga ? '<div class="selo-paga">PAGA</div>' : ''}
    </div>`
    })
    .join('')

  const meta = `
      <div class="doc-titulo">CARNÊ DE PAGAMENTO</div>
      <div>Nº ${numero}</div>
      <div>Emitido em ${fmtData(emp.data_emprestimo)}</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Emprestimo-${numero}-Carne</title>
  <style>${CSS_BASE}${CSS_CARNE}</style>
</head>
<body>
  ${cabecalhoLoja(loja, meta)}

  <div class="resumo-carne">
    <div>Devedor<br><b>${escaparHtml(emp.devedor_nome)}</b></div>
    ${emp.devedor_documento ? `<div>CPF/CNPJ<br><b>${escaparHtml(emp.devedor_documento)}</b></div>` : ''}
    <div>Total do carnê<br><b>${fmt(emp.valor_acordado)}</b></div>
    <div>Em aberto<br><b>${fmt(totalAberto)}</b> em ${emAberto.length} parcela(s)</div>
  </div>

  <div class="canhotos">${canhotos}</div>

  <div class="aviso-rodape">
    Guarde este carnê até a quitação. Confira o nome do recebedor no aplicativo do banco
    antes de confirmar qualquer pagamento por PIX.
  </div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════════════
 * PROMISSÓRIA
 * ══════════════════════════════════════════════════════════════════════════ */

const CSS_PROMISSORIA = `
    .nota {
      border: 2px solid #1a1a1a; border-radius: 4px; padding: 16px 18px; margin-top: 16px;
    }
    .nota-topo { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #1a1a1a; padding-bottom: 8px; }
    .nota-titulo { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
    .nota-valor { font-size: 20px; font-weight: 700; }
    .nota-corpo { margin-top: 14px; font-size: 13px; line-height: 1.85; text-align: justify; }
    .preenchido { font-weight: 700; border-bottom: 1px solid #1a1a1a; padding: 0 3px; }
    .nota-extenso { margin-top: 10px; font-size: 12px; font-style: italic; }
    .emitente { margin-top: 18px; font-size: 11.5px; line-height: 1.7; border-top: 1px dashed #999; padding-top: 10px; }
    .local-data { margin-top: 18px; text-align: right; font-size: 12px; }
    .assinatura { margin-top: 46px; text-align: center; }
    .assinatura .linha { border-top: 1px solid #1a1a1a; width: 62%; margin: 0 auto 3px; }
    .assinatura .nome { font-size: 12px; font-weight: 600; }
    .assinatura .sub { font-size: 10px; color: #555; }
    .nota-obs { margin-top: 12px; font-size: 10.5px; color: #555; }
`

/**
 * Nota promissória.
 *
 * ── Por que o texto é esse, e não outro ─────────────────────────────────────
 * A promissória é título de crédito, e a fórmula tradicional ("pagarei por esta
 * única via...") não é enfeite jurídico: é o que a torna reconhecível como
 * promessa de pagamento por quem for lê-la depois. O valor aparece DUAS vezes,
 * em número e por extenso — se os dois divergirem, prevalece o extenso, e é
 * justamente por isso que ele é gerado da mesma fonte e não digitado à mão.
 *
 * ⚠️ Este documento NÃO leva QR de PIX. Promissória é título, não boleto: o
 * pagamento dela é combinado entre as partes, e um QR com valor fixo no rosto
 * de um título de crédito confunde as duas coisas.
 */
export function promissoriaEmprestimoHtml(
  emp: EmprestimoImpressoA4,
  loja: DadosLoja
): string {
  const numero = String(emp.id).padStart(3, '0')
  const credor = loja.razao_social || loja.nome || ''
  const local = localDoRecibo(loja.cidade, loja.uf)
  const vencimento = emp.vencimento ?? emp.data_emprestimo

  const meta = `
      <div class="doc-titulo">NOTA PROMISSÓRIA</div>
      <div>Nº ${numero}</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Emprestimo-${numero}-Promissoria</title>
  <style>${CSS_BASE}${CSS_PROMISSORIA}</style>
</head>
<body>
  ${cabecalhoLoja(loja, meta)}

  <div class="nota">
    <div class="nota-topo">
      <div>
        <div class="nota-titulo">NOTA PROMISSÓRIA Nº ${numero}</div>
        <div style="font-size:11px;color:#444;margin-top:2px">
          Vencimento: ${fmtData(vencimento)}
        </div>
      </div>
      <div class="nota-valor">${fmt(emp.valor_acordado)}</div>
    </div>

    <div class="nota-corpo">
      Ao dia <span class="preenchido">${dataPorExtenso(vencimento)}</span> pagarei por esta
      única via de NOTA PROMISSÓRIA a
      <span class="preenchido">${escaparHtml(credor)}</span>${
        loja.cnpj ? `, inscrito(a) no CNPJ sob o nº <span class="preenchido">${escaparHtml(loja.cnpj)}</span>,` : ','
      }
      ou à sua ordem, a quantia de <span class="preenchido">${fmt(emp.valor_acordado)}</span>
      em moeda corrente deste país.
    </div>

    <div class="nota-extenso">(${escaparHtml(valorPorExtenso(emp.valor_acordado))})</div>

    <div class="emitente">
      <div><strong>EMITENTE</strong></div>
      <div>Nome: ${escaparHtml(emp.devedor_nome)}</div>
      ${emp.devedor_documento ? `<div>CPF/CNPJ: ${escaparHtml(emp.devedor_documento)}</div>` : ''}
      <div>Referente ao empréstimo nº ${numero}, concedido em ${fmtData(emp.data_emprestimo)}
      no valor de ${fmt(emp.valor_principal)}.</div>
      ${emp.observacao ? `<div class="nota-obs">Obs.: ${escaparHtml(emp.observacao)}</div>` : ''}
    </div>

    ${local ? `<div class="local-data">${escaparHtml(local)}, ${dataPorExtenso(emp.data_emprestimo)}.</div>` : `<div class="local-data">${dataPorExtenso(emp.data_emprestimo)}.</div>`}

    <div class="assinatura">
      <div class="linha"></div>
      <div class="nome">${escaparHtml(emp.devedor_nome)}</div>
      <div class="sub">Assinatura do emitente</div>
    </div>
  </div>
</body>
</html>`
}

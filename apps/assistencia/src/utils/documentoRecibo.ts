/**
 * O recibo em A4.
 *
 * Segue o formato que todo mundo reconhece — o mesmo do talão de papelaria:
 * uma tarja com RECIBO, o número e o valor em algarismos; o corpo em primeira
 * pessoa dizendo quem recebeu de quem, quanto e por quê; e a assinatura de
 * quem recebeu. Nada aqui é invenção nossa, e é essa a intenção: recibo que
 * parece diferente do esperado gera desconfiança na hora de assinar.
 *
 * O valor aparece DUAS vezes de propósito — em algarismos e por extenso. Não é
 * redundância: num documento de quitação, quando os dois discordam, vale o
 * extenso. Ver utils/valorPorExtenso.ts.
 */

import { cabecalhoLoja, CSS_PAPEL_TIMBRADO, escaparHtml } from './papelTimbrado'
import { valorPorExtenso } from './valorPorExtenso'
import type { DadosLoja } from './dadosLoja'
import { UFS } from '../data/ufs'

export type DadosDocumentoRecibo = {
  numero: number
  valor: number
  recebedor_nome: string
  recebedor_documento: string | null
  recebedor_rg: string | null
  pagador_nome: string
  pagador_documento: string | null
  pagador_rg: string | null
  referente: string
  cidade: string | null
  uf: string | null
  data_recibo: string // YYYY-MM-DD
  observacao: string | null
  cancelado?: number
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

/**
 * "04 de maio de 2018" a partir de "2018-05-04".
 *
 * Montada na mão a partir dos pedaços da string. Passar por `new Date()` faria
 * a data pular um dia em qualquer fuso a oeste de Greenwich — o Brasil inteiro
 * —, porque "2018-05-04" é lido como meia-noite UTC. É o bug clássico de data
 * no Brasil, e num recibo ele muda o dia declarado do pagamento.
 */
export function dataPorExtenso(iso: string): string {
  const [ano, mes, dia] = (iso || '').split('-')
  const m = Number(mes)
  if (!ano || !m || !dia || m < 1 || m > 12) return iso || ''
  return `${dia} de ${MESES[m - 1]} de ${ano}`
}

/**
 * "PACOTI - CEARÁ" a partir da cidade e da sigla do estado.
 *
 * O estado vai POR EXTENSO porque é assim que documento formal identifica o
 * lugar: "Pacoti" sozinho não diz nada a quem lê o recibo em outro estado, e a
 * sigla "CE" resolve pouco melhor. Cidade grande dispensa, cidade pequena não —
 * e é justamente a pequena que precisa.
 *
 * A grafia acompanha a da cidade: se ela está toda em maiúsculas (como o
 * cadastro fiscal costuma guardar), o estado sai igual; se está com acentuação
 * normal, sai "Ceará". Misturar "PACOTI - Ceará" na mesma linha ficaria
 * desleixado, e qual das duas o cliente usa não é decisão nossa.
 */
export function localDoRecibo(cidade: string | null, uf: string | null): string {
  const nomeCidade = (cidade ?? '').trim()
  const sigla = (uf ?? '').trim().toUpperCase()
  if (!nomeCidade) return ''

  const estado = UFS.find((u) => u.sigla === sigla)?.nome
  if (!estado) return nomeCidade

  // "Toda em maiúscula" só vale se houver letra: "123" não decide nada.
  const temLetra = /[a-zA-ZÀ-ÿ]/.test(nomeCidade)
  const gritando = temLetra && nomeCidade === nomeCidade.toUpperCase()
  return `${nomeCidade} - ${gritando ? estado.toUpperCase() : estado}`
}

/** "Portador(a) do RG nº X, CPF nº Y" — só com o que foi preenchido. */
function documentosDaParte(rg: string | null, documento: string | null): string {
  const partes: string[] = []
  if (rg?.trim()) partes.push(`Portador(a) do RG nº ${escaparHtml(rg.trim())}`)
  if (documento?.trim()) partes.push(`CPF/CNPJ nº ${escaparHtml(documento.trim())}`)
  return partes.length ? `, ${partes.join(', ')}` : ''
}

export function montarRecibo(loja: DadosLoja, recibo: DadosDocumentoRecibo): string {
  const extenso = valorPorExtenso(recibo.valor)
  // Recibo emitido antes de o estado existir no cadastro cai no da loja — e se
  // nem isso houver, imprime só a cidade, como saía antes.
  const local = localDoRecibo(
    recibo.cidade?.trim() || loja.cidade,
    recibo.uf?.trim() || loja.uf
  )
  const localData = [local, dataPorExtenso(recibo.data_recibo)].filter(Boolean).join(', ')

  const corpo =
    `Eu, <strong>${escaparHtml(recibo.recebedor_nome)}</strong>` +
    `${documentosDaParte(recibo.recebedor_rg, recibo.recebedor_documento)}, ` +
    `declaro ter recebido nesta data a quantia de <strong>${fmt(recibo.valor)}</strong> ` +
    `<strong>(${escaparHtml(extenso.toUpperCase())})</strong> de ` +
    `<strong>${escaparHtml(recibo.pagador_nome)}</strong>` +
    `${documentosDaParte(recibo.pagador_rg, recibo.pagador_documento)}, ` +
    `<strong>referente a ${escaparHtml(recibo.referente)}</strong>.`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo nº ${recibo.numero}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 16mm 15mm; }
    html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
    body { line-height: 1.6; }
    ${CSS_PAPEL_TIMBRADO}

    .tarja { display: flex; align-items: center; justify-content: space-between;
             border: 1.5px solid #1a1a1a; background: #f2f2f2;
             padding: 14px 18px; margin-top: 22px; }
    .tarja .titulo { font-size: 34px; font-weight: 800; letter-spacing: 1px; }
    .tarja .numeros { text-align: right; font-size: 14px; line-height: 1.5; }
    .tarja .numeros strong { font-size: 16px; }

    .quadro { border: 1.5px solid #1a1a1a; border-top: none; padding: 26px 22px 30px; }
    .declaracao { text-align: justify; text-indent: 38px; font-size: 13px; }
    .fecho { margin-top: 20px; font-size: 13px; }
    .observacao { margin-top: 18px; font-size: 11px; color: #444;
                  border-left: 3px solid #ccc; padding-left: 10px; }
    .local-data { margin-top: 40px; text-align: center; font-size: 13px; }

    .assinatura { margin: 52px auto 0; width: 62%; text-align: center; }
    .assinatura .linha { border-top: 1px solid #1a1a1a; margin-bottom: 5px; }
    .assinatura .nome { font-weight: 700; font-size: 12.5px; }
    .assinatura .doc { font-size: 10.5px; color: #444; }

    /* Recibo cancelado ainda pode ser reimpresso — para arquivo, para mostrar
       ao contador. Mas nunca pode ser confundido com um válido, então a marca
       atravessa a folha e vai junto no PDF. */
    .cancelado { position: fixed; top: 44%; left: 0; right: 0; text-align: center;
                 font-size: 76px; font-weight: 800; color: rgba(200, 0, 0, 0.18);
                 letter-spacing: 10px; transform: rotate(-16deg); }

    .rodape { margin-top: 26px; padding-top: 8px; border-top: 1px solid #ccc;
              font-size: 9.5px; color: #777; text-align: center; }
  </style>
</head>
<body>
  ${recibo.cancelado ? '<div class="cancelado">CANCELADO</div>' : ''}

  ${cabecalhoLoja(
    loja,
    `<div class="doc-meta">
      <div class="doc-titulo">RECIBO</div>
      <div>Emitido em ${dataPorExtenso(recibo.data_recibo)}</div>
    </div>`
  )}

  <div class="tarja">
    <div class="titulo">RECIBO</div>
    <div class="numeros">
      <div>Nº: <strong>${recibo.numero}</strong></div>
      <div>VALOR: <strong>${fmt(recibo.valor)}</strong></div>
    </div>
  </div>

  <div class="quadro">
    <p class="declaracao">${corpo}</p>
    <p class="fecho">E para maior clareza, firmo o presente.</p>
    ${
      recibo.observacao?.trim()
        ? `<p class="observacao">${escaparHtml(recibo.observacao.trim())}</p>`
        : ''
    }

    <p class="local-data">${escaparHtml(localData)}.</p>

    <div class="assinatura">
      <div class="linha"></div>
      <div class="nome">${escaparHtml(recibo.recebedor_nome)}</div>
      ${
        recibo.recebedor_documento?.trim()
          ? `<div class="doc">CPF/CNPJ nº ${escaparHtml(recibo.recebedor_documento.trim())}</div>`
          : ''
      }
    </div>
  </div>

  <div class="rodape">
    Recibo nº ${recibo.numero} gerado por ${escaparHtml(loja.nome)}.
  </div>
</body>
</html>`
}

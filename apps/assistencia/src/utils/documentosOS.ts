// Documentos FORMAIS da OS em A4 (gerados como PDF via impressao.salvarPdf):
// - ORÇAMENTO/PROPOSTA: pra aprovar por escrito e pra propostas de CFTV a
//   empresas — tom sóbrio, papel timbrado com os dados da loja.
// - LAUDO TÉCNICO: parecer do técnico sobre o equipamento (seguradoras,
//   empresas, "sem conserto"), assinado pelo responsável.
// O tom aqui é o oposto do cupom térmico: A4, tipografia sóbria, seções.

import { linhaCidadeUf, type DadosLoja } from './dadosLoja'
import { nomeImpressao } from './nomeImpressao'
import { qrPixParaDocumento } from '@fhvptech/core/lib/qrCodePix'
import { blocoPixHtml, CSS_PIX } from './blocoPix'
import type { DadosComprovanteOS } from './comprovantesOS'

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string | null): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

const hojeExtenso = (): string =>
  new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

const hojeCurto = (): string => new Date().toLocaleDateString('pt-BR')

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const numeroOS = (id: number): string => String(id).padStart(3, '0')

// Papel timbrado + moldura comum dos dois documentos.
function montarDocumento(loja: DadosLoja, tituloDoc: string, tituloJanela: string, corpo: string): string {
  const logo =
    loja.exibir_logo && loja.logo
      ? `<img class="logo" src="${loja.logo}" alt="">`
      : ''
  const lojaLinhas: string[] = []
  if (loja.razao_social) lojaLinhas.push(escapar(loja.razao_social))
  if (loja.cnpj) lojaLinhas.push(`CNPJ: ${escapar(loja.cnpj)}`)
  if (loja.endereco) lojaLinhas.push(escapar(loja.endereco))
  const cidadeUf = linhaCidadeUf(loja)
  if (cidadeUf) lojaLinhas.push(escapar(cidadeUf))
  if (loja.telefone) lojaLinhas.push(`Telefone: ${escapar(loja.telefone)}`)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${tituloJanela}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 16mm 15mm; }
    html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
    body { line-height: 1.5; }
    .cabecalho { display: flex; align-items: flex-start; gap: 14px; padding-bottom: 12px; border-bottom: 2.5px solid #1a1a1a; }
    .logo { max-height: 64px; max-width: 150px; object-fit: contain; }
    .loja-bloco { flex: 1; }
    .loja-nome { font-size: 17px; font-weight: 700; letter-spacing: 0.2px; }
    .loja-info { font-size: 10.5px; color: #444; margin-top: 2px; }
    .doc-meta { text-align: right; font-size: 11px; color: #444; white-space: nowrap; }
    .doc-meta .doc-titulo { font-size: 15px; font-weight: 700; color: #1a1a1a; letter-spacing: 0.5px; }
    h2.secao { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555;
               border-bottom: 1px solid #ccc; padding-bottom: 3px; margin: 18px 0 8px; }
    .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 24px; font-size: 12px; }
    .grade .campo b { color: #333; }
    .paragrafo { text-align: justify; white-space: pre-wrap; }
    table.itens { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
    table.itens th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px;
                     color: #555; border-bottom: 1.5px solid #999; padding: 5px 6px; }
    table.itens td { padding: 6px; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
    table.itens .num { text-align: right; white-space: nowrap; }
    .total-box { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total-box .caixa { border: 1.5px solid #1a1a1a; padding: 6px 16px; font-size: 14px; font-weight: 700; }
${CSS_PIX}
    .condicoes { font-size: 11px; color: #444; margin-top: 14px; }
    .condicoes li { margin-left: 16px; margin-bottom: 2px; }
    .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 6px; }
    .fotos figure { page-break-inside: avoid; margin: 0; }
    .fotos img { width: 100%; border: 1px solid #ccc; border-radius: 2px; display: block; }
    .fotos figcaption { font-size: 9.5px; color: #666; margin-top: 2px; text-align: center; }
    .assinaturas { display: flex; gap: 40px; margin-top: 64px; }
    .assinaturas .ass { flex: 1; text-align: center; font-size: 11px; color: #333; }
    .assinaturas .linha { border-top: 1px solid #333; margin-bottom: 4px; }
    .local-data { margin-top: 28px; font-size: 12px; }
    .rodape { margin-top: 26px; padding-top: 8px; border-top: 1px solid #ccc;
              font-size: 9.5px; color: #777; text-align: center; }
  </style>
</head>
<body>
  <div class="cabecalho">
    ${logo}
    <div class="loja-bloco">
      <div class="loja-nome">${escapar(loja.nome)}</div>
      <div class="loja-info">${lojaLinhas.join(' · ')}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-titulo">${tituloDoc}</div>
      <div>Emitido em ${hojeCurto()}</div>
    </div>
  </div>

  ${corpo}

  <div class="rodape">
    Documento gerado por ${escapar(loja.nome)} — este documento não possui valor fiscal.
  </div>
</body>
</html>`
}

function blocoCliente(os: DadosComprovanteOS): string {
  const campos: string[] = [
    `<div class="campo"><b>Cliente:</b> ${escapar(os.cliente_nome ?? '—')}</div>`
  ]
  if (os.cliente_telefone) campos.push(`<div class="campo"><b>Telefone:</b> ${escapar(os.cliente_telefone)}</div>`)
  campos.push(`<div class="campo"><b>Ordem de Serviço:</b> Nº ${numeroOS(os.id)}</div>`)
  campos.push(`<div class="campo"><b>Abertura:</b> ${fmtData(os.criada_em)}</div>`)
  return `<div class="grade">${campos.join('')}</div>`
}

function blocoObjeto(os: DadosComprovanteOS): string {
  const campos: string[] = []
  if (os.tipo_atendimento === 'bancada') {
    if (os.equipamento) campos.push(`<div class="campo"><b>Equipamento:</b> ${escapar(os.equipamento)}</div>`)
    if (os.numero_serie) campos.push(`<div class="campo"><b>Nº de série:</b> ${escapar(os.numero_serie)}</div>`)
    if (os.acessorios) campos.push(`<div class="campo"><b>Acessórios recebidos:</b> ${escapar(os.acessorios)}</div>`)
    if (os.estado_entrada) campos.push(`<div class="campo"><b>Estado na entrada:</b> ${escapar(os.estado_entrada)}</div>`)
  } else {
    if (os.endereco_atendimento) campos.push(`<div class="campo"><b>Local do serviço:</b> ${escapar(os.endereco_atendimento)}</div>`)
    if (os.equipamento) campos.push(`<div class="campo"><b>Sistema/equipamentos:</b> ${escapar(os.equipamento)}</div>`)
  }
  return campos.length ? `<div class="grade">${campos.join('')}</div>` : ''
}

// Título da seção do objeto: bancada fala de aparelho; externo fala do local
// (e o CFTV assume o nome próprio dele).
const tituloObjeto = (os: DadosComprovanteOS, bancada: string): string =>
  os.tipo_atendimento === 'bancada' ? bancada : os.categoria === 'cftv' ? 'Sistema CFTV' : 'Local do atendimento'

function tabelaItens(os: DadosComprovanteOS): { html: string; total: number } {
  const total = os.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const linhas = os.itens
    .map(
      (i) => `
      <tr>
        <td>${escapar(`${i.produto_nome ?? '—'}${i.tamanho ? ` (${i.tamanho})` : ''}`)}</td>
        <td class="num">${i.quantidade.toLocaleString('pt-BR')}</td>
        <td class="num">${fmt(i.preco_unitario)}</td>
        <td class="num">${fmt(i.quantidade * i.preco_unitario)}</td>
      </tr>`
    )
    .join('')
  const html = `
  <table class="itens">
    <thead>
      <tr>
        <th style="width:55%">Descrição</th>
        <th class="num">Qtd.</th>
        <th class="num">Valor unitário</th>
        <th class="num">Subtotal</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="total-box"><div class="caixa">Total: ${fmt(total)}</div></div>`
  return { html, total }
}

function localData(loja: DadosLoja): string {
  const cidade = loja.cidade ? `${loja.cidade}${loja.uf ? ` – ${loja.uf}` : ''}, ` : ''
  return `<div class="local-data">${escapar(cidade)}${hojeExtenso()}.</div>`
}

export function gerarHtmlOrcamentoOS(os: DadosComprovanteOS, loja: DadosLoja): string {
  const { html: itensHtml, total } = tabelaItens(os)

  // No orcamento nada foi pago ainda, entao o valor em aberto e o total orcado.
  // Largura fixa porque esta folha e A4 numa impressora comum (300dpi ou mais):
  // o alinhamento com o ponto da bobina termica nao quer dizer nada aqui.
  const pix = qrPixParaDocumento({
    chave: loja.pix_chave,
    tipo: loja.pix_tipo || undefined,
    beneficiario: loja.nome || loja.razao_social,
    cidade: loja.cidade,
    valorEmAberto: total,
    larguraMmFixa: 32
  })

  const escopo = os.diagnostico
    ? `
  <h2 class="secao">Descrição técnica do serviço</h2>
  <p class="paragrafo">${escapar(os.diagnostico)}</p>`
    : ''

  const corpo = `
  <h2 class="secao">Identificação</h2>
  ${blocoCliente(os)}
  ${blocoObjeto(os) ? `<h2 class="secao">${tituloObjeto(os, 'Equipamento')}</h2>${blocoObjeto(os)}` : ''}

  <h2 class="secao">${os.natureza === 'instalacao' ? 'Serviço solicitado' : 'Problema relatado'}</h2>
  <p class="paragrafo">${escapar(os.defeito_relatado)}</p>
  ${escopo}

  <h2 class="secao">Serviços e materiais orçados</h2>
  ${itensHtml}
  ${blocoPixHtml(pix, { titulo: 'PAGAR ESTE ORÇAMENTO', divisoria: false })}

  <div class="condicoes">
    <b>Condições:</b>
    <ul>
      <li>Nenhum serviço será executado antes da aprovação deste orçamento pelo cliente.</li>
      <li>Garantia de ${os.garantia_dias} dia${os.garantia_dias !== 1 ? 's' : ''} sobre os serviços executados e peças aplicadas, contra o mesmo defeito. Não cobre mau uso, quedas ou contato com líquidos.</li>
      <li>Valores sujeitos a revisão caso sejam constatados problemas adicionais durante a execução, sempre com nova aprovação prévia.</li>
    </ul>
  </div>

  ${localData(loja)}

  <div class="assinaturas">
    <div class="ass">
      <div class="linha"></div>
      ${escapar(os.tecnico_nome ?? loja.nome)}<br>Responsável técnico
    </div>
    <div class="ass">
      <div class="linha"></div>
      ${escapar(os.cliente_nome ?? '')}<br>De acordo — autorizo a execução
    </div>
  </div>`

  return montarDocumento(loja, `ORÇAMENTO Nº ${numeroOS(os.id)}`, nomeImpressao.osOrcamento(os.id), corpo)
}

export type FotoLaudo = { nome?: string | null; dados: string }

export function gerarHtmlLaudoOS(os: DadosComprovanteOS, loja: DadosLoja, fotos: FotoLaudo[] = []): string {
  const servicosHtml =
    os.itens.length > 0
      ? `
  <h2 class="secao">Serviços e peças relacionados</h2>
  ${tabelaItens(os).html}`
      : ''

  // Registro fotográfico: as fotos anexadas na OS entram no laudo em grade de
  // duas colunas (dados = data URL, viaja embutido no próprio HTML do PDF).
  const fotosHtml =
    fotos.length > 0
      ? `
  <h2 class="secao">Registro fotográfico</h2>
  <div class="fotos">
    ${fotos
      .map(
        (f, i) => `<figure>
      <img src="${f.dados}" alt="">
      <figcaption>Foto ${i + 1}${f.nome ? ` — ${escapar(f.nome)}` : ''}</figcaption>
    </figure>`
      )
      .join('\n    ')}
  </div>`
      : ''

  const corpo = `
  <h2 class="secao">Identificação</h2>
  ${blocoCliente(os)}
  ${blocoObjeto(os) ? `<h2 class="secao">${tituloObjeto(os, 'Equipamento analisado')}</h2>${blocoObjeto(os)}` : ''}

  <h2 class="secao">${os.natureza === 'instalacao' ? 'Serviço solicitado pelo cliente' : 'Problema relatado pelo cliente'}</h2>
  <p class="paragrafo">${escapar(os.defeito_relatado)}</p>

  <h2 class="secao">Análise e parecer técnico</h2>
  <p class="paragrafo">${escapar(os.diagnostico ?? '')}</p>
  ${fotosHtml}
  ${servicosHtml}

  ${localData(loja)}

  <div class="assinaturas">
    <div class="ass">
      <div class="linha"></div>
      ${escapar(os.tecnico_nome ?? loja.nome)}<br>Responsável técnico
    </div>
  </div>`

  return montarDocumento(loja, `LAUDO TÉCNICO — OS Nº ${numeroOS(os.id)}`, nomeImpressao.osLaudo(os.id), corpo)
}

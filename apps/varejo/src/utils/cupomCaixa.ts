/**
 * Abertura e fechamento de caixa na BOBINA TÉRMICA de 80mm.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Consegue dar a opção ao usuário de escolher se os cupons de abertura e
 * fechamento serão em A4 ou na impressora térmica (padrão, pois é a impressora
 * mais acessível em um caixa)?" (11/09/2026)
 *
 * Os dois papéis existiam só em A4, e A4 é justamente a impressora que um caixa
 * costuma NÃO ter ao lado. A versão A4 continua inteira em
 * `relatorioFinanceiro.ts`: quem escolhe é o lojista, em Configurações.
 *
 * ── ⚠️ A casca nasce do cupom de venda, e não de zero ───────────────────────
 * Toda a medida térmica desta casa já foi aprendida uma vez, no `cupomVenda.ts`,
 * e está comentada lá com o porquê de cada número. O que vale repetir aqui,
 * porque é o que quebra:
 *
 *   - **68mm de corpo, `@page` de 2mm.** A cabeça térmica alcança 72,07mm a
 *     partir da borda esquerda. O que passa disso não sai cortado: some.
 *   - **Tudo em negrito.** A 203dpi a cabeça só sabe queimar ou não queimar. O
 *     traço fino do Courier cai no meio do caminho e vira letra falhada. Como a
 *     fonte é monoespaçada, o negrito não muda largura nenhuma.
 *   - **Divisória tracejada, nunca dupla.** O vão do meio de uma `double` some
 *     no arredondamento de 203dpi e ela imprime como uma tarja preta.
 *
 * ── ⚠️ O que este papel NÃO pode trazer ─────────────────────────────────────
 * Na ABERTURA, nenhum valor esperado e nenhuma contagem. O fechamento desta
 * loja é às cegas de propósito: o operador conta a gaveta sem saber quanto
 * deveria ter. Um número comparável impresso na manhã desmonta a conferência da
 * noite, e ninguém ligaria uma coisa à outra meses depois.
 */

import { logoHtml } from './cupomVenda'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'

export type TurnoCupom = {
  id: number
  conta_nome: string
  aberto_por_nome: string | null
  aberto_em: string
  fundo_troco: number
  fechado_por_nome?: string | null
  fechado_em?: string | null
  confirmado_por_nome?: string | null
  confirmado_em?: string | null
  justificativa?: string | null
  fora_de_hora?: number
}

export type ContagemCupom = {
  forma: string
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartao debito',
  credito: 'Cartao credito'
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataHora = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * A casca de 72mm, igual à do cupom de venda.
 *
 * Fica numa função porque a abertura e o fechamento são o mesmo papel com
 * miolos diferentes — e porque uma segunda cópia das medidas térmicas é a forma
 * mais barata de um dos dois sair fora da bobina sem ninguém notar.
 */
function bobina(titulo: string, loja: DadosLoja, corpo: string): string {
  const cabecalho: string[] = []
  if (loja.nome) cabecalho.push(`<div class="loja-nome">${escapar(loja.nome)}</div>`)
  if (loja.telefone) cabecalho.push(`<div>${escapar(loja.telefone)}</div>`)

  const rodape: string[] = []
  if (loja.razao_social) rodape.push(`<div>${escapar(loja.razao_social)}</div>`)
  if (loja.cnpj) rodape.push(`<div>CNPJ: ${escapar(loja.cnpj)}</div>`)
  const cidade = linhaCidadeUf(loja)
  if (cidade) rodape.push(`<div>${escapar(cidade)}</div>`)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${escapar(titulo)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* 2mm, não 4: ver o cabeçalho deste arquivo e o do cupomVenda.ts. */
    @page { margin: 2mm; }
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: bold;
      color: #000;
      background: #fff;
    }
    body {
      width: 68mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm 1mm;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .cabecalho { text-align: center; margin-bottom: 4px; }
    .loja-nome { font-size: 13px; }
    .divisoria { border-top: 1px dashed #000; margin: 4px 0; }
    .titulo { text-align: center; font-size: 12px; letter-spacing: .05em; }
    .linha { display: flex; justify-content: space-between; gap: 6px; }
    /* Valor nunca quebra linha (nowrap): número partido no meio é pior que
       número apertado. Sem crase neste comentário — ele mora dentro de um
       template literal, e a crase fecharia a string. */
    .linha .valor { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .destaque { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1px 0; text-align: left; }
    th { font-size: 10px; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .aviso { text-align: center; margin-top: 6px; font-size: 10px; }
    .assinatura { margin-top: 44px; text-align: center; font-size: 10px; }
    .assinatura .fio { border-top: 1px solid #000; margin: 0 4mm 2px; }
    .rodape { text-align: center; margin-top: 6px; font-size: 10px; }
    @media print {
      html, body { width: auto; }
      body { margin: 0; padding: 0 0 4mm; }
    }
  </style>
</head>
<body>
  ${logoHtml(loja)}
  <div class="cabecalho">
    ${cabecalho.join('\n    ')}
  </div>
  <div class="divisoria"></div>
  <div class="titulo">${escapar(titulo)}</div>
  <div class="divisoria"></div>
  ${corpo}
  ${rodape.length ? `<div class="rodape">${rodape.join('')}</div>` : ''}
</body>
</html>`
}

/** Abertura de caixa na bobina. Sem valor esperado, sem contagem. */
export function gerarHtmlCupomAberturaCaixa(turno: TurnoCupom, loja: DadosLoja): string {
  return bobina(`ABERTURA DE CAIXA No ${turno.id}`, loja, `
  <div class="linha"><span>Caixa</span><span class="valor">${escapar(turno.conta_nome)}</span></div>
  <div class="linha"><span>Aberto por</span><span class="valor">${escapar(turno.aberto_por_nome ?? '—')}</span></div>
  <div class="linha"><span>Data/hora</span><span class="valor">${dataHora(turno.aberto_em)}</span></div>

  <div class="divisoria"></div>
  <div class="linha destaque">
    <span>FUNDO DE TROCO</span><span class="valor">${fmt(turno.fundo_troco)}</span>
  </div>
  <div class="divisoria"></div>

  <div class="aviso">
    Confira o dinheiro na gaveta antes de assinar.<br>
    A partir daqui, tudo o que entrar e sair deste<br>
    caixa entra na conferencia do fechamento.
  </div>

  <div class="assinatura">
    <div class="fio"></div>
    Responsavel pela abertura
  </div>`)
}

/** Fechamento de caixa na bobina, com a contagem e a diferença apurada. */
export function gerarHtmlCupomFechamentoCaixa(
  turno: TurnoCupom,
  contagens: ContagemCupom[],
  loja: DadosLoja
): string {
  const linhas = contagens
    .map(
      (c) => `<tr>
        <td>${ROTULO_FORMA[c.forma] ?? escapar(c.forma)}</td>
        <td class="num">${fmt(c.valor_esperado)}</td>
        <td class="num">${fmt(c.valor_contado)}</td>
        <td class="num">${c.diferenca === 0 ? '-' : `${c.diferenca > 0 ? '+' : '-'}${fmt(Math.abs(c.diferenca))}`}</td>
      </tr>`
    )
    .join('')

  const emDinheiro = contagens.find((c) => c.forma === 'dinheiro')
  const dif = emDinheiro?.diferenca ?? 0

  /*
   * ⚠️ "Esperado" e "Contado" aparecem AQUI, e só aqui. No fechamento o
   * operador já entregou a contagem dele: o número deixou de ser segredo e
   * passou a ser a prestação de contas. É o contrário da abertura.
   */
  return bobina(`FECHAMENTO DE CAIXA No ${turno.id}`, loja, `
  <div class="linha"><span>Caixa</span><span class="valor">${escapar(turno.conta_nome)}</span></div>
  <div class="linha"><span>Aberto por</span><span class="valor">${escapar(turno.aberto_por_nome ?? '—')}</span></div>
  <div class="linha"><span>Abertura</span><span class="valor">${dataHora(turno.aberto_em)}</span></div>
  <div class="linha"><span>Fechado por</span><span class="valor">${escapar(turno.fechado_por_nome ?? '—')}</span></div>
  <div class="linha"><span>Fechamento</span><span class="valor">${dataHora(turno.fechado_em)}</span></div>
  <div class="linha"><span>Fundo de troco</span><span class="valor">${fmt(turno.fundo_troco)}</span></div>
  ${turno.fora_de_hora ? '<div class="aviso">** Fechado fora do horario **</div>' : ''}

  <div class="divisoria"></div>
  <table>
    <thead>
      <tr><th>Forma</th><th class="num">Esper.</th><th class="num">Cont.</th><th class="num">Dif.</th></tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="divisoria"></div>

  <div class="linha destaque">
    <span>DINHEIRO NA GAVETA</span>
    <span class="valor">${
      dif === 0 ? 'CONFERE' : `${dif < 0 ? 'FALTA' : 'SOBRA'} ${fmt(Math.abs(dif))}`
    }</span>
  </div>
  ${turno.justificativa ? `<div class="divisoria"></div><div>Obs.: ${escapar(turno.justificativa)}</div>` : ''}

  <div class="divisoria"></div>
  <div class="linha">
    <span>Conferido por</span>
    <span class="valor">${escapar(turno.confirmado_por_nome ?? 'ainda nao')}</span>
  </div>
  ${turno.confirmado_em ? `<div class="linha"><span>Em</span><span class="valor">${dataHora(turno.confirmado_em)}</span></div>` : ''}

  <div class="assinatura">
    <div class="fio"></div>
    Responsavel pela conferencia
  </div>`)
}

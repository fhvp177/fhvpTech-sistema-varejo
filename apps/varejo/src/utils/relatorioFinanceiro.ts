/**
 * Os relatórios que nascem do livro-caixa e dos pedidos separados.
 *
 * São quatro, e cada um responde uma pergunta que hoje não tem resposta em
 * lugar nenhum do sistema:
 *
 *  1. Fechamento de caixa — o comprovante do turno, para guardar ou assinar
 *  2. ★ Quebra por operador — o padrão que uma diferença isolada esconde
 *  3. Extrato da conta — "quanto entrou no Banco X neste mês"
 *  4. Pedidos separados — o que está fora da loja e ainda não virou dinheiro
 */

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataHora = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const dataCurta = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito'
}

/*
 * A casca compartilhada. Sai por impressora e por PDF, então é A4 com margem de
 * 15mm e tipo pequeno — o mesmo desenho dos relatórios que já existem, para o
 * lojista não receber dois padrões de papel da mesma loja.
 */
function pagina(titulo: string, subtitulo: string, corpo: string): string {
  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
    @page { margin: 15mm; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    .sub { font-size: 11px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; }
    th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .num, .valor { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .falta { color: #b00; font-weight: bold; }
    .sobra { color: #060; font-weight: bold; }
    .caixa { border: 1px solid #ccc; padding: 8px 10px; margin-top: 10px; }
    .rodape { margin-top: 18px; font-size: 10px; color: #666; }
    .assinatura { margin-top: 34px; border-top: 1px solid #000; width: 60%; padding-top: 3px; font-size: 10px; }
    .vazio { padding: 14px; text-align: center; color: #777; }
  </style>
</head>
<body>
  <h1>${titulo}</h1>
  <div class="sub">${subtitulo} · gerado em ${geradoEm}</div>
  ${corpo}
  <div class="rodape">FHVP Tech — Sistema de Gestão</div>
</body>
</html>`
}

const cell = (d: number): string =>
  d === 0
    ? '<td class="valor">—</td>'
    : `<td class="valor ${d < 0 ? 'falta' : 'sobra'}">${d > 0 ? '+' : '−'}${dinheiro(Math.abs(d))}</td>`

// ─── 1. Fechamento de caixa ──────────────────────────────────────────────────

export type TurnoRelatorio = {
  id: number
  conta_nome: string
  aberto_por_nome: string | null
  aberto_em: string
  fechado_por_nome: string | null
  fechado_em: string | null
  confirmado_por_nome: string | null
  confirmado_em: string | null
  fundo_troco: number
  justificativa: string | null
  fora_de_hora: number
}

export type ContagemRelatorio = {
  forma: string
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

export function gerarHtmlFechamentoCaixa(
  turno: TurnoRelatorio,
  contagens: ContagemRelatorio[]
): string {
  const linhas = contagens
    .map(
      (c) => `<tr>
        <td>${ROTULO_FORMA[c.forma] ?? c.forma}</td>
        <td class="valor">${dinheiro(c.valor_esperado)}</td>
        <td class="valor">${dinheiro(c.valor_contado)}</td>
        ${cell(c.diferenca)}
      </tr>`
    )
    .join('')

  const dinheiroLinha = contagens.find((c) => c.forma === 'dinheiro')
  const dif = dinheiroLinha?.diferenca ?? 0

  return pagina(
    `Fechamento de caixa #${turno.id}`,
    `${turno.conta_nome} · ${dataHora(turno.aberto_em)} a ${dataHora(turno.fechado_em)}`,
    `
    <div class="caixa">
      <div>Aberto por: <strong>${turno.aberto_por_nome ?? '—'}</strong> · Fundo de troco: <strong>${dinheiro(turno.fundo_troco)}</strong></div>
      <div>Fechado por: <strong>${turno.fechado_por_nome ?? '—'}</strong>${turno.fora_de_hora ? ' (fora de hora)' : ''}</div>
      <div>Conferido por: <strong>${turno.confirmado_por_nome ?? 'ainda não conferido'}</strong>${
        turno.confirmado_em ? ` em ${dataHora(turno.confirmado_em)}` : ''
      }</div>
    </div>

    <table>
      <thead><tr><th>Forma</th><th class="valor">Esperado</th><th class="valor">Contado</th><th class="valor">Diferença</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>

    <div class="caixa">
      <strong>Dinheiro na gaveta:</strong>
      ${
        dif === 0
          ? 'conferiu certinho.'
          : `<span class="${dif < 0 ? 'falta' : 'sobra'}">${dif < 0 ? 'faltaram' : 'sobraram'} ${dinheiro(Math.abs(dif))}</span>.`
      }
      ${turno.justificativa ? `<br>Observação: ${turno.justificativa}` : ''}
    </div>

    <div class="assinatura">Responsável pela conferência</div>`
  )
}

// ─── 2. ★ Quebra por operador ────────────────────────────────────────────────

export type DiferencaOperadorRelatorio = {
  vendedor_nome: string | null
  turnos: number
  quebras: number
  sobras: number
  total_diferenca: number
  pior: number
}

/**
 * ★ O relatório que faz o fechamento às cegas valer a pena.
 *
 * Uma diferença isolada é erro humano e não prova nada. O que prova é o padrão:
 * a mesma pessoa fechando com falta mês após mês enquanto as outras fecham
 * certo. Olhado um a um, cada fechamento parece só um dia ruim.
 */
export function gerarHtmlDiferencasCaixa(
  de: string,
  ate: string,
  linhas: DiferencaOperadorRelatorio[]
): string {
  const corpo =
    linhas.length === 0
      ? '<div class="vazio">Nenhum turno conferido neste período.</div>'
      : `<table>
      <thead><tr>
        <th>Operador</th>
        <th class="num">Turnos</th>
        <th class="num">Fechou faltando</th>
        <th class="num">Fechou sobrando</th>
        <th class="valor">Pior dia</th>
        <th class="valor">Acumulado</th>
      </tr></thead>
      <tbody>${linhas
        .map(
          (l) => `<tr>
          <td>${l.vendedor_nome ?? '—'}</td>
          <td class="num">${l.turnos}</td>
          <td class="num">${l.quebras}</td>
          <td class="num">${l.sobras}</td>
          ${cell(l.pior)}
          ${cell(l.total_diferenca)}
        </tr>`
        )
        .join('')}</tbody>
    </table>
    <div class="rodape">
      Só entram turnos já conferidos por um gerente, e só a diferença em
      DINHEIRO. Divergência em cartão ou PIX não é quebra de gaveta: resolve-se
      com a adquirente, não com o operador.
    </div>`

  return pagina(
    'Diferenças de caixa por operador',
    `${dataCurta(de)} a ${dataCurta(ate)}`,
    corpo
  )
}

// ─── 3. Extrato da conta ─────────────────────────────────────────────────────

export type MovimentoRelatorio = {
  data: string
  descricao: string | null
  tipo: string
  forma_pagamento: string | null
  valor: number
  saldo_corrente: number
}

export function gerarHtmlExtratoConta(
  conta: string,
  de: string,
  ate: string,
  movimentos: MovimentoRelatorio[]
): string {
  const entradas = movimentos.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0)
  const saidas = movimentos.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0)

  const corpo =
    movimentos.length === 0
      ? '<div class="vazio">Nenhum movimento nesta conta no período.</div>'
      : `<table>
      <thead><tr>
        <th>Data</th><th>Lançamento</th><th>Forma</th>
        <th class="valor">Valor</th><th class="valor">Saldo</th>
      </tr></thead>
      <tbody>${movimentos
        .map(
          (m) => `<tr>
          <td class="num">${dataHora(m.data)}</td>
          <td>${m.descricao ?? m.tipo}</td>
          <td>${m.forma_pagamento ? (ROTULO_FORMA[m.forma_pagamento] ?? m.forma_pagamento) : '—'}</td>
          <td class="valor ${m.valor < 0 ? 'falta' : 'sobra'}">${m.valor < 0 ? '−' : '+'}${dinheiro(Math.abs(m.valor))}</td>
          <td class="valor">${dinheiro(m.saldo_corrente)}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table>
    <div class="caixa">
      Entrou <strong class="sobra">${dinheiro(entradas)}</strong> ·
      Saiu <strong class="falta">${dinheiro(Math.abs(saidas))}</strong> ·
      Saldo ao fim do período <strong>${dinheiro(movimentos[movimentos.length - 1].saldo_corrente)}</strong>
    </div>`

  return pagina(`Extrato — ${conta}`, `${dataCurta(de)} a ${dataCurta(ate)}`, corpo)
}

// ─── 4. Pedidos separados ────────────────────────────────────────────────────

export type PedidoRelatorio = {
  id: number
  cliente_nome: string | null
  cliente_telefone: string | null
  vendedor_nome: string | null
  para_entrega: number
  endereco_entrega: string | null
  total: number
  criado_em: string
  dias_parado: number
}

export function gerarHtmlPedidosSeparados(pedidos: PedidoRelatorio[]): string {
  const total = pedidos.reduce((s, p) => s + p.total, 0)
  const corpo =
    pedidos.length === 0
      ? '<div class="vazio">Nenhum pedido separado no momento.</div>'
      : `<table>
      <thead><tr>
        <th class="num">#</th><th>Cliente</th><th>Contato</th>
        <th>Destino</th><th>Vendedor</th>
        <th class="num">Parado há</th><th class="valor">Valor</th>
      </tr></thead>
      <tbody>${pedidos
        .map(
          (p) => `<tr>
          <td class="num">${p.id}</td>
          <td>${p.cliente_nome ?? '—'}</td>
          <td class="num">${p.cliente_telefone ?? '—'}</td>
          <td>${p.para_entrega ? `entrega: ${p.endereco_entrega ?? '—'}` : 'retirada na loja'}</td>
          <td>${p.vendedor_nome ?? '—'}</td>
          <td class="num${p.dias_parado >= 3 ? ' falta' : ''}">${p.dias_parado} dia(s)</td>
          <td class="valor">${dinheiro(p.total)}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table>
    <div class="caixa">
      <strong>${pedidos.length} pedido(s)</strong> fora da loja, somando
      <strong>${dinheiro(total)}</strong> que ainda não viraram venda.
    </div>`

  return pagina(
    'Pedidos separados',
    'Mercadoria apartada, aguardando pagamento',
    corpo
  )
}

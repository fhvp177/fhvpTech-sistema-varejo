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

// ─── 5. Comprovante do entregador ────────────────────────────────────────────

export type ItemPedidoRelatorio = {
  nome: string
  tamanho: string | null
  quantidade: number
  preco_unitario: number
}

/**
 * O papel que vai com o entregador.
 *
 * Ideia dele, e é boa: quem sai com a joia precisa de algo na mão. Sem papel, o
 * entregador depende da memória para saber quanto cobrar — e o cliente não tem
 * como conferir se o que chegou é o que ele pediu.
 *
 * ── ⚠️ O que este papel NÃO é ───────────────────────────────────────────────
 * Não é cupom fiscal e não é comprovante de pagamento: no momento em que ele é
 * impresso, ninguém pagou nada. Por isso ele diz "A RECEBER" em vez de "total",
 * e traz o campo de assinatura de quem RECEBEU A MERCADORIA — que é o único
 * fato que ele pode registrar.
 *
 * A nota fiscal, quando houver, sai depois, na conclusão, quando a forma de
 * pagamento finalmente se sabe.
 *
 * ── Formato ─────────────────────────────────────────────────────────────────
 * 80mm, como o cupom de venda: sai na mesma impressora do balcão, sem trocar
 * papel. Ver o cabeçalho de cupomVenda.ts para a largura real de impressão.
 */
export function gerarHtmlComprovanteEntrega(
  pedido: PedidoRelatorio & { observacao?: string | null },
  itens: ItemPedidoRelatorio[],
  loja: string
): string {
  const linhas = itens
    .map(
      (i) => `<tr>
        <td class="q">${i.quantidade}x</td>
        <td>${i.nome}${i.tamanho ? ` (${i.tamanho})` : ''}</td>
        <td class="v">${dinheiro(i.quantidade * i.preco_unitario)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pedido ${pedido.id} — entrega</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /*
      ⚠️ As regras desta folha são as MESMAS do cupom de venda, e não por
      preguiça: a primeira versão deste papel foi escrita do zero, com Arial e
      80mm, e saiu praticamente em branco e deslocada para a direita, com meio
      centímetro aparecendo. As duas causas estão explicadas em cupomVenda.ts, e
      valem para qualquer papel que saia nesta impressora.

      2mm, não 4: a cabeça térmica alcança 72,07mm a partir da borda esquerda do
      papel, e o corpo tem 68mm. Com 4mm de cada lado terminaria em 72,00 — sem
      folga nenhuma.

      ⚠️ E NADA de declarar o tamanho da página (a propriedade size do @page).
      O Chromium ignora o papel do driver de qualquer jeito, e declarar o
      tamanho aqui só faz a página ser diagramada num formato que a impressora
      depois desloca por conta própria.
      (sem crase neste comentário: ele mora dentro de um template literal)
    */
    @page { margin: 2mm; }

    /*
      ⚠️ Courier em NEGRITO, sempre. A 203dpi a cabeça térmica só sabe "queima
      ou não queima" — não existe cinza. O traço fino do Arial cai no meio do
      caminho e vira ponto solto: é a folha em branco que apareceu no teste. O
      traço do negrito é grosso o bastante para queimar inteiro, e como a fonte
      é monoespaçada ele tem exatamente a mesma largura.
    */
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: bold;
      color: #000;
      background: #fff;
    }

    /* 68mm, e não os 80mm da bobina: é até onde a cabeça alcança. Passar disso
       não dá erro — o texto simplesmente não sai no papel. */
    body {
      width: 68mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm 1mm;
      line-height: 1.35;
      /* Endereço comprido e nome de cliente emendado não podem empurrar o papel
         para fora da bobina. */
      overflow-wrap: anywhere;
    }

    .c { text-align: center; }
    .loja { font-size: 13px; }
    /* Tracejada, nunca dupla: a dupla não sobrevive a 203dpi — o vão do meio
       some no arredondamento e ela sai como tarja preta. */
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    td { padding: 1px 2px; vertical-align: top; }
    .q { width: 8mm; }
    .v { text-align: right; white-space: nowrap; padding-left: 8px; }
    .cobrar { border: 1px solid #000; padding: 4px; text-align: center; margin: 5px 0; }
    .cobrar .rot { font-size: 10px; }
    .cobrar .val { font-size: 15px; }
    .bloco { margin-top: 5px; }
    .rot { font-size: 10px; }
    .assin { margin-top: 18px; border-top: 1px dashed #000; padding-top: 3px; font-size: 10px; text-align: center; }
    .aviso { font-size: 9.5px; text-align: center; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="c loja">${loja}</div>
  <div class="c">COMPROVANTE DE ENTREGA</div>
  <div class="c">Pedido #${pedido.id} · ${dataHora(pedido.criado_em)}</div>
  <hr>

  <div class="bloco">
    <div class="rot">CLIENTE</div>
    <div><strong>${pedido.cliente_nome ?? '—'}</strong></div>
    ${pedido.cliente_telefone ? `<div>${pedido.cliente_telefone}</div>` : ''}
    ${pedido.endereco_entrega ? `<div>${pedido.endereco_entrega}</div>` : ''}
  </div>

  ${pedido.observacao ? `<div class="bloco"><div class="rot">OBSERVAÇÃO</div><div>${pedido.observacao}</div></div>` : ''}

  <hr>
  <table>${linhas}</table>
  <hr>

  <!--
    ⚠️ "A RECEBER", e não "total": no momento em que este papel é impresso
    ninguém pagou nada. Escrever "total" faria o cliente achar que já está pago,
    e o entregador voltaria sem o dinheiro.
  -->
  <div class="cobrar">
    <div class="rot">A RECEBER NA ENTREGA</div>
    <div class="val">${dinheiro(pedido.total)}</div>
  </div>

  <div class="rot">FORMA DE PAGAMENTO (marque)</div>
  <div>( ) Dinheiro &nbsp; ( ) PIX &nbsp; ( ) Débito &nbsp; ( ) Crédito</div>

  <div class="assin">Assinatura de quem recebeu a mercadoria</div>
  <div class="aviso">
    Este papel não é documento fiscal. A nota, quando houver, é emitida na loja
    após o pagamento.
  </div>
</body>
</html>`
}

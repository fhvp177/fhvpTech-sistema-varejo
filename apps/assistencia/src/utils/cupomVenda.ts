// Gera o HTML do cupom não fiscal de uma venda, no formato da bobina térmica de
// 80mm. O layout é fixo em 68mm (ver o comentário da largura, lá embaixo) e o
// mesmo HTML serve pro PDF, que é gerado numa página do tamanho da bobina.

import { nomeImpressao } from './nomeImpressao'
import { linhaCidadeUf, type DadosLoja } from './dadosLoja'
import { qrPixParaDocumento } from '@fhvptech/core/lib/qrCodePix'
import { blocoPixHtml, CSS_PIX } from './blocoPix'

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

// Quantidade sem zeros à toa: "2" em vez de "2,000". Quem vende fracionado
// continua vendo as casas ("0,750"); quem vende por unidade — a maioria —
// ganha 4 caracteres de largura, que em 80mm de papel sobram pro nome do item.
const fmtQtd = (quantidade: number): string =>
  Number.isInteger(quantidade)
    ? String(quantidade)
    : quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

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

  // Loja sem nome (identidade ainda não preenchida) não imprime linha vazia.
  const lojaLinhas: string[] = []
  if (loja.nome) lojaLinhas.push(`<div class="loja-nome">${escapar(loja.nome)}</div>`)
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
      const qtd = fmtQtd(item.quantidade)
      const unit = fmt(item.preco_unitario)
      const subtotal = fmt(item.quantidade * item.preco_unitario)
      return `
        <tr>
          <td class="col-nome">${nome}</td>
          <td class="col-num">${qtd}</td>
          <td class="col-num">${unit}</td>
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

  // Quanto o cliente ainda deve. `valor_pago` e a fonte da verdade do total
  // recebido em qualquer forma de pagamento (a vista, entrada, parcela quitada),
  // entao esta subtracao serve pros quatro status sem caso especial: venda paga
  // da zero, e o QR nem chega a ser desenhado.
  const saldoEmAberto = venda.total - venda.valor_pago
  const pix = qrPixParaDocumento({
    chave: loja.pix_chave,
    tipo: loja.pix_tipo || undefined,
    beneficiario: loja.nome || loja.razao_social,
    cidade: loja.cidade,
    valorEmAberto: saldoEmAberto
  })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.cupomVenda(venda.id)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* 2mm, não 4: a cabeça térmica alcança 72,07mm a partir da borda
       esquerda do papel, e o corpo do cupom tem 68mm. Com 4mm de cada lado
       o conteúdo terminaria em 72,00mm — 0,07mm de folga, ou seja, nenhuma. */
    @page { margin: 2mm; }
    /* Tudo em negrito, de propósito. A 203dpi a cabeça térmica só sabe
       "queima ou não queima": não existe cinza. O traço fino do Courier cai
       justo no meio do caminho e vira ponto solto — é a letra falhada. O traço
       do negrito é grosso o bastante pra queimar inteiro. Como a fonte é
       monoespaçada, o negrito tem exatamente a mesma largura: nada de layout
       muda por causa disto. */
    html, body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: bold;
      color: #000;
      background: #fff;
    }
    /* 68mm, e não os 80mm da bobina. O driver da térmica declara 72,07mm de
       área impressa a partir da borda esquerda: é só até ali que a cabeça
       alcança. Com os 2mm do @page, o cupom vai de 2mm a 70mm e ainda sobram
       2mm de folga. Passar disso não dá erro nenhum — o texto simplesmente
       não aparece no papel. */
    body {
      width: 68mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm 1mm;
      line-height: 1.35;
      /* Nenhum texto pode empurrar o cupom pra fora da bobina. Antes só o nome
         do produto e o bloco do cliente sabiam quebrar; nome de loja, razão
         social, endereço e as linhas de total não sabiam, e uma palavra longa
         sem espaço (um e-mail, uma razão social emendada) escapava do papel.
         Herdado por todo mundo, inclusive pelos itens flex do total, onde
         também impede que o span se recuse a encolher. As colunas de número
         ficam de fora porque têm 'white-space: nowrap': valor quebrado no meio
         é pior que valor apertado. */
      overflow-wrap: anywhere;
    }
    .cabecalho { margin-bottom: 4px; }
    .logo-wrap { text-align: center; margin-bottom: 4px; }
    .logo { max-width: 60mm; max-height: 22mm; object-fit: contain; }
    .loja-nome { font-weight: bold; font-size: 13px; }
    /* Divisória única e tracejada, do jeito clássico de cupom. Antes havia
       duas: uma '2px double' pras seções e uma '1px dashed' pro resto. A dupla
       não sobrevive a 203dpi — o vão do meio some no arredondamento e ela sai
       como uma tarja preta grossa. A tracejada imprime como tracejado mesmo. */
    .divisoria { border-top: 1px dashed #000; margin: 4px 0; }
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
    /* A sarjeta entre as colunas de número. Elas são alinhadas à direita e não
       quebram, então sem isto o "2" da quantidade encosta no "189,90" do preço
       e o olho lê um número só. O respiro tem que vir pela ESQUERDA de cada
       coluna: é de lá que vem o número vizinho.
       8px ≈ 1,5 caractere de sarjeta e custa 18px da coluna do nome, que ainda
       fica com ~14 caracteres no pior caso (valores na casa dos 99 mil). Subir
       mais que isto começa a picotar o nome do produto — o teste de largura em
       __tests__/cupomVenda.test.ts segura essa fronteira. */
    .col-num { text-align: right; white-space: nowrap; padding-left: 8px; }
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
${CSS_PIX}
    .rodape-loja .nome-loja {
      font-weight: bold;
      font-size: 11px;
      margin-bottom: 1px;
    }
    /* Na impressão a largura NÃO pode ser solta aqui. Antes existia um
       'html, body { width: auto }' neste bloco, e ele era a causa do cupom sair
       picado na térmica.

       O driver da bobina informa direitinho o papel que tem (72,00 x 3276,00mm,
       origem 0, escala 100%). Quem ignora isso é o Chromium: na impressão
       silenciosa ele monta a página no tamanho padrão dele em vez de perguntar
       ao driver. Com a largura solta, o layout se espalhava por essa página
       larga e a cabeça térmica desenhava só os 72mm iniciais — tudo do meio pra
       direita (número do pedido, títulos, quantidades, preços, total, rodapé)
       era impresso no vazio, e nome longo saía cortado no meio em vez de
       quebrar linha, porque sobrava largura de sobra pra ele não quebrar.

       Fixando a largura, o cupom cabe nos 72mm impressos independente do
       tamanho de página que o Chromium resolva usar. Encostado à esquerda
       (margin: 0) porque em bobina não existe "centro da folha" pra
       centralizar — centralizar jogaria o cupom todo pra fora do papel. */
    @media print {
      body { margin: 0; padding: 0 0 4mm; }
    }
  </style>
</head>
<body>
  <div class="cabecalho">
    ${logoHtml(loja)}
    ${lojaLinhas.join('\n    ')}
  </div>

  <div class="divisoria"></div>
  <div class="pedido-num">PEDIDO N° ${numeroPedido}</div>
  <div class="divisoria"></div>

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

  <div class="divisoria"></div>
  <div class="titulo-secao">PRODUTOS</div>
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
  <div class="titulo-secao">PAGAMENTO</div>
  <div class="divisoria"></div>

  ${(venda.desconto ?? 0) > 0 ? `
  <div class="total-linha" style="font-size: 11px;">
    <span>Subtotal:</span>
    <span>${fmt(venda.total + (venda.desconto ?? 0))}</span>
  </div>
  <div class="total-linha" style="font-size: 11px;">
    <span>Desconto:</span>
    <span>- ${fmt(venda.desconto ?? 0)}</span>
  </div>` : ''}
  <div class="total-linha">
    <span>Total do pedido:</span>
    <span>${fmt(venda.total)}</span>
  </div>
  ${entrada > 0 ? `
  <div class="total-linha" style="font-size: 11px;">
    <span>Entrada (paga):</span>
    <span>- ${fmt(entrada)}</span>
  </div>
  <div class="total-linha" style="font-size: 11px;">
    <span>${venda.num_parcelas ? 'A parcelar:' : 'Saldo a prazo:'}</span>
    <span>${fmt(venda.total - entrada)}</span>
  </div>` : ''}

  <div class="divisoria"></div>

  <table>
    <thead>
      <tr>
        <th>Vencim.</th>
        <th class="col-num">Valor</th>
        <th>Forma</th>
        <th>Obs.</th>
      </tr>
    </thead>
    <tbody>
      ${linhasPagamento.join('\n      ')}
    </tbody>
  </table>
${blocoPixHtml(pix)}
  <div class="divisoria"></div>

  <div class="aviso">*** Este cupom não é documento fiscal ***</div>

  <div class="assinatura">
    <div class="linha"></div>
    Assinatura do cliente
  </div>

  ${rodapeHtml}
</body>
</html>`
}

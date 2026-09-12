import { FC, ReactNode, Suspense, lazy, useEffect, useState } from 'react'
import { BarChart3, FileDown, Printer, FolderDown, ShoppingCart, Package, BookOpen, FileText, Receipt, Landmark, Scale, PackageCheck, Users } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Select } from '@fhvptech/core/ui/select'
import { Label } from '@fhvptech/core/ui/label'
import { useImprimir } from '@/components/ImpressaoProvider'
import PainelFinanceiroMes from '@/components/PainelFinanceiroMes'
import DataPicker from '@/components/DataPicker'
import MesPicker from '@/components/MesPicker'
import { nomeImpressao } from '@/utils/nomeImpressao'
import {
  gerarHtmlRelatorioVendas,
  rotuloMes,
  type VendaRelatorio,
  type ProdutoMaisVendido,
  type VencimentosMes
} from '@/utils/relatorioVendas'
import {
  gerarHtmlRelatorioEstoque,
  gerarHtmlTabelaReferencias,
  type ProdutoRelatorio
} from '@/utils/relatoriosProdutos'
import {
  gerarHtmlRelatorioEntradas,
  rotuloMesEntradas,
  type NotaEntradaRelatorio
} from '@/utils/relatorioEntradas'
import {
  gerarHtmlCaptacaoClientes,
  gerarHtmlDiferencasCaixa,
  gerarHtmlExtratoConta,
  gerarHtmlPedidosSeparados,
  type LinhaCaptacaoRelatorio
} from '@/utils/relatorioFinanceiro'

// Central de relatórios: reúne num lugar só tudo o que o sistema imprime/salva
// em PDF. Cada card também continua acessível na tela de origem (Vendas,
// Produtos) — aqui é o atalho de quem pensa "quero um relatório" antes de
// pensar em qual tela ele mora.

// Relatório de notas fiscais — só no plano Pro; a flag tira o chunk do Básico.
const RelatorioNotasFiscais = __FEAT_NFE__
  ? lazy(() => import('@/components/RelatorioNotasFiscais'))
  : null

type Acao = 'pdf' | 'imprimir'

const mesAtualLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Card padrão da página: ícone, título, descrição e a área de controles.
const CardRelatorio: FC<{
  icone: ReactNode
  titulo: string
  descricao: string
  children: ReactNode
}> = ({ icone, titulo, descricao, children }) => (
  <div className="group border rounded-lg p-5 bg-background flex flex-col gap-3 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 motion-reduce:transform-none">
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 text-muted-foreground shrink-0 transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
        {icone}
      </div>
      <div>
        <h3 className="font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{descricao}</p>
      </div>
    </div>
    <div className="mt-auto flex flex-col gap-2">{children}</div>
  </div>
)

const BotoesGerar: FC<{
  onGerar: (acao: Acao) => void
  desabilitado: boolean
  gerando: boolean
}> = ({ onGerar, desabilitado, gerando }) => (
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      onClick={() => onGerar('pdf')}
      disabled={desabilitado || gerando}
    >
      <FileDown className="w-3.5 h-3.5 mr-1.5" /> Salvar PDF
    </Button>
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      onClick={() => onGerar('imprimir')}
      disabled={desabilitado || gerando}
    >
      <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
    </Button>
  </div>
)

const Relatorios: FC = () => {
  const imprimirDoc = useImprimir()
  const [gerando, setGerando] = useState(false)

  // Os relatorios financeiros trabalham com INTERVALO, nao com mes: uma quebra
  // de caixa que atravessa a virada do mes nao pode sumir do relatorio so por
  // causa do calendario.
  const primeiroDoMes = new Date()
  primeiroDoMes.setDate(1)
  const iso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const [caixaDe, setCaixaDe] = useState(iso(primeiroDoMes))
  const [caixaAte, setCaixaAte] = useState(iso(new Date()))
  const [erroCaixa, setErroCaixa] = useState('')

  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [contaExtrato, setContaExtrato] = useState('')
  const [extratoDe, setExtratoDe] = useState(iso(primeiroDoMes))
  const [extratoAte, setExtratoAte] = useState(iso(new Date()))
  const [erroExtrato, setErroExtrato] = useState('')

  const [erroPedidos, setErroPedidos] = useState('')
  const [erroCaptacao, setErroCaptacao] = useState('')

  useEffect(() => {
    void window.api.financeiro.listarContas().then((r) => {
      if (r.success) {
        const lista = r.data as ContaFinanceira[]
        setContas(lista)
        setContaExtrato((a) => a || String(lista[0]?.id ?? ''))
      }
    })
  }, [])
  const [notasFiscaisAberto, setNotasFiscaisAberto] = useState(false)

  // ── Vendas do mês ──
  const [mesVendas, setMesVendas] = useState(mesAtualLocal())
  const [vendasDoMes, setVendasDoMes] = useState<VendaRelatorio[]>([])
  const [incluirMaisVendidos, setIncluirMaisVendidos] = useState(true)
  const [erroVendas, setErroVendas] = useState('')

  // ── Produtos (estoque + referências) ──
  const [produtos, setProdutos] = useState<ProdutoRelatorio[]>([])
  const [erroProdutos, setErroProdutos] = useState('')

  // ── Entradas (NF-e) ──
  const [mesesEntradas, setMesesEntradas] = useState<string[]>([])
  const [mesEntradas, setMesEntradas] = useState('')
  const [notasDoMes, setNotasDoMes] = useState<NotaEntradaRelatorio[]>([])
  const [msgEntradas, setMsgEntradas] = useState('')
  const [erroEntradas, setErroEntradas] = useState('')

  useEffect(() => {
    ;(async () => {
      const [rProdutos, rMeses] = await Promise.all([
        window.api.produtos.listar(),
        window.api.notasEntrada.meses()
      ])
      if (rProdutos.success) setProdutos(rProdutos.data as ProdutoRelatorio[])
      if (rMeses.success) {
        const lista = rMeses.data as string[]
        setMesesEntradas(lista)
        setMesEntradas(lista[0] ?? '')
      }
    })()
  }, [])

  useEffect(() => {
    if (!mesVendas) {
      setVendasDoMes([])
      return
    }
    let ativo = true
    window.api.vendas.listar(mesVendas).then((r) => {
      if (ativo && r.success) setVendasDoMes(r.data as VendaRelatorio[])
    })
    return () => {
      ativo = false
    }
  }, [mesVendas])

  useEffect(() => {
    if (!mesEntradas) {
      setNotasDoMes([])
      return
    }
    let ativo = true
    window.api.notasEntrada.listar(mesEntradas).then((r) => {
      if (ativo && r.success) setNotasDoMes(r.data as NotaEntradaRelatorio[])
    })
    return () => {
      ativo = false
    }
  }, [mesEntradas])

  // Gera + entrega (PDF ou impressora) com trava de reentrada compartilhada.
  const entregar = async (html: string, nome: string, acao: Acao): Promise<string> => {
    if (acao === 'imprimir') {
      await imprimirDoc(html, nome, 'documento')
      return ''
    }
    const r = await window.api.impressao.salvarPdf(html, nome)
    return r.success ? '' : r.error
  }

  /*
   * ★ Quebra de caixa por operador.
   *
   * É o relatório que faz o fechamento às cegas valer a pena: uma diferença
   * isolada é erro humano, mas a mesma pessoa fechando com falta mês após mês
   * é outra coisa — e isso não aparece em nenhum outro lugar do sistema.
   */
  const gerarDiferencas = async (acao: Acao) => {
    setGerando(true)
    setErroCaixa('')
    try {
      const r = await window.api.caixa.diferencasPorOperador(caixaDe, caixaAte)
      if (!r.success) {
        setErroCaixa(r.error)
        return
      }
      const erro = await entregar(
        gerarHtmlDiferencasCaixa(caixaDe, caixaAte, r.data as DiferencaOperador[]),
        `Diferencas de caixa ${caixaDe} a ${caixaAte}`,
        acao
      )
      if (erro) setErroCaixa(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarExtrato = async (acao: Acao) => {
    setGerando(true)
    setErroExtrato('')
    try {
      const conta = contas.find((c) => String(c.id) === contaExtrato)
      if (!conta) {
        setErroExtrato('Escolha uma conta.')
        return
      }
      const r = await window.api.financeiro.extrato({
        conta_id: conta.id,
        de: extratoDe,
        ate: extratoAte,
        limite: 1000
      })
      if (!r.success) {
        setErroExtrato(r.error)
        return
      }
      const erro = await entregar(
        gerarHtmlExtratoConta(conta.nome, extratoDe, extratoAte, r.data as MovimentoFinanceiro[]),
        `Extrato ${conta.nome} ${extratoDe} a ${extratoAte}`,
        acao
      )
      if (erro) setErroExtrato(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarPedidos = async (acao: Acao) => {
    setGerando(true)
    setErroPedidos('')
    try {
      const r = await window.api.pedidos.listar('separado')
      if (!r.success) {
        setErroPedidos(r.error)
        return
      }
      const erro = await entregar(
        gerarHtmlPedidosSeparados(r.data as PedidoSeparado[]),
        'Pedidos separados',
        acao
      )
      if (erro) setErroPedidos(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarCaptacao = async (acao: Acao) => {
    setGerando(true)
    setErroCaptacao('')
    try {
      const r = await window.api.clientes.resumoCaptacao()
      if (!r.success) {
        setErroCaptacao(r.error)
        return
      }
      const erro = await entregar(
        gerarHtmlCaptacaoClientes(r.data as LinhaCaptacaoRelatorio[]),
        'Captacao de clientes',
        acao
      )
      if (erro) setErroCaptacao(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarVendas = async (acao: Acao) => {
    setGerando(true)
    setErroVendas('')
    try {
      let maisVendidos: ProdutoMaisVendido[] | undefined
      if (incluirMaisVendidos) {
        const r = await window.api.vendas.produtosMaisVendidos(mesVendas)
        maisVendidos = r.success ? (r.data as ProdutoMaisVendido[]) : []
      }
      const rVenc = await window.api.vendas.aReceberDoMes(mesVendas)
      const vencimentos = rVenc.success ? (rVenc.data as VencimentosMes) : undefined
      const html = gerarHtmlRelatorioVendas(vendasDoMes, mesVendas, maisVendidos, vencimentos)
      const erro = await entregar(html, nomeImpressao.relatorioVendas(mesVendas), acao)
      if (erro) setErroVendas(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarEstoque = async (acao: Acao) => {
    setGerando(true)
    setErroProdutos('')
    try {
      const erro = await entregar(
        gerarHtmlRelatorioEstoque(produtos),
        nomeImpressao.relatorioEstoque(),
        acao
      )
      if (erro) setErroProdutos(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarReferencias = async (acao: Acao) => {
    setGerando(true)
    setErroProdutos('')
    try {
      const erro = await entregar(
        gerarHtmlTabelaReferencias(produtos),
        nomeImpressao.tabelaReferencias(),
        acao
      )
      if (erro) setErroProdutos(erro)
    } finally {
      setGerando(false)
    }
  }

  const gerarEntradas = async (acao: Acao) => {
    setGerando(true)
    setErroEntradas('')
    try {
      const erro = await entregar(
        gerarHtmlRelatorioEntradas(mesEntradas, notasDoMes),
        nomeImpressao.relatorioEntradas(mesEntradas),
        acao
      )
      if (erro) setErroEntradas(erro)
    } finally {
      setGerando(false)
    }
  }

  const exportarXmls = async () => {
    setErroEntradas('')
    setMsgEntradas('')
    const resp = await window.api.notasEntrada.exportarXmls(mesEntradas)
    if (!resp.success) {
      setErroEntradas(resp.error)
      return
    }
    if (resp.data) {
      setMsgEntradas(`${resp.data.quantidade} XML(s) salvos em ${resp.data.pasta}.`)
    }
  }

  const totalEntradas = notasDoMes.reduce((s, n) => s + n.valor_total, 0)

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <BarChart3 className="w-6 h-6 text-primary" />
        Relatórios
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        O mês do dinheiro na tela, e embaixo todos os relatórios do sistema num lugar só, pra
        imprimir ou salvar em PDF.
      </p>

      {/*
        O resumo do mês vem ANTES dos cards, e isso é o pedido: até aqui, para
        ver qualquer número financeiro era preciso gerar um arquivo. Os cards
        continuam embaixo, porque contador pede papel.
      */}
      <PainelFinanceiroMes />

      <div className="grid gap-4 md:grid-cols-2">
        <CardRelatorio
          icone={<ShoppingCart className="w-5 h-5" />}
          titulo="Vendas do mês"
          descricao="Resumo gerencial: totais, formas de pagamento, a receber por vencimento e produtos mais vendidos."
        >
          <div className="flex items-center gap-2">
            <Label htmlFor="mes-vendas" className="text-xs shrink-0">
              Mês
            </Label>
            <MesPicker value={mesVendas} onChange={setMesVendas} maxMes={mesAtualLocal()} />
            <span className="text-xs text-muted-foreground ml-auto">
              {vendasDoMes.length === 0 ? 'sem vendas no mês' : `${vendasDoMes.length} venda(s)`}
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground">
            <input
              type="checkbox"
              checked={incluirMaisVendidos}
              onChange={(e) => setIncluirMaisVendidos(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Incluir ranking de produtos mais vendidos
          </label>
          <BotoesGerar
            onGerar={gerarVendas}
            desabilitado={!mesVendas || vendasDoMes.length === 0}
            gerando={gerando}
          />
          {erroVendas && <p className="text-destructive text-xs">{erroVendas}</p>}
        </CardRelatorio>

        <CardRelatorio
          icone={<FileText className="w-5 h-5" />}
          titulo="Entradas (compras por XML)"
          descricao="Notas fiscais de compra importadas no mês — o resumo e os XMLs que o contador pede."
        >
          {mesesEntradas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma nota importada ainda. Importe o XML de uma nota de compra na tela de{' '}
              <strong>Produtos</strong> e o relatório nasce aqui.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="mes-entradas" className="text-xs shrink-0">
                  Mês
                </Label>
                <Select
                  id="mes-entradas"
                  value={mesEntradas}
                  onChange={setMesEntradas}
                  className="h-9 text-sm"
                  classNameContainer="w-44"
                  opcoes={mesesEntradas.map((m) => ({ valor: m, rotulo: rotuloMesEntradas(m) }))}
                />
                <span className="text-xs text-muted-foreground ml-auto">
                  {notasDoMes.length} nota(s) · {dinheiro(totalEntradas)}
                </span>
              </div>
              <BotoesGerar
                onGerar={gerarEntradas}
                desabilitado={notasDoMes.length === 0}
                gerando={gerando}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={exportarXmls}
                disabled={notasDoMes.length === 0}
                title="Salva os arquivos XML originais do mês numa pasta — é o que o contador pede"
              >
                <FolderDown className="w-3.5 h-3.5 mr-1.5" /> Exportar XMLs do mês
              </Button>
              {msgEntradas && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{msgEntradas}</p>
              )}
              {erroEntradas && <p className="text-destructive text-xs">{erroEntradas}</p>}
            </>
          )}
        </CardRelatorio>

        <CardRelatorio
          icone={<Package className="w-5 h-5" />}
          titulo="Estoque (balanço)"
          descricao="Produtos por categoria com estoque do sistema e coluna em branco pra contagem física."
        >
          <span className="text-xs text-muted-foreground">{produtos.length} produto(s)</span>
          <BotoesGerar
            onGerar={gerarEstoque}
            desabilitado={produtos.length === 0}
            gerando={gerando}
          />
        </CardRelatorio>

        <CardRelatorio
          icone={<BookOpen className="w-5 h-5" />}
          titulo="Tabela de referências"
          descricao="Só referência + nome, em colunas compactas — a cola pro vendedor deixar no balcão."
        >
          <span className="text-xs text-muted-foreground">{produtos.length} produto(s)</span>
          <BotoesGerar
            onGerar={gerarReferencias}
            desabilitado={produtos.length === 0}
            gerando={gerando}
          />
          {erroProdutos && <p className="text-destructive text-xs">{erroProdutos}</p>}
        </CardRelatorio>

        {/*
          ★ O relatório que faz o fechamento às cegas valer a pena.

          Uma diferença isolada é erro humano e não prova nada. O que prova é o
          padrão: a mesma pessoa fechando com falta mês após mês enquanto as
          outras fecham certo. Olhado um a um, cada fechamento parece só um dia
          ruim — e é por isso que este relatório existe.
        */}
        <CardRelatorio
          icone={<Scale className="w-5 h-5" />}
          titulo="Diferenças de caixa por operador"
          descricao="Quem fecha o caixa faltando, e quanto, ao longo do tempo. Só turnos já conferidos, e só dinheiro."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="caixa-de" className="text-xs shrink-0">
              De
            </Label>
            <DataPicker
              id="caixa-de"
              value={caixaDe}
              onChange={setCaixaDe}
              max={caixaAte || undefined}
              className="min-w-0 flex-1"
            />
            <Label htmlFor="caixa-ate" className="text-xs shrink-0">
              até
            </Label>
            <DataPicker
              id="caixa-ate"
              value={caixaAte}
              onChange={setCaixaAte}
              min={caixaDe || undefined}
              className="min-w-0 flex-1"
            />
          </div>
          <BotoesGerar onGerar={gerarDiferencas} desabilitado={!caixaDe || !caixaAte} gerando={gerando} />
          {erroCaixa && <p className="text-destructive text-xs">{erroCaixa}</p>}
        </CardRelatorio>

        <CardRelatorio
          icone={<Landmark className="w-5 h-5" />}
          titulo="Extrato de uma conta"
          descricao="Tudo o que entrou e saiu de um banco ou do caixa, com saldo corrente. Responde “quanto entrou no Banco X”."
        >
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Conta</Label>
            <Select
              value={contaExtrato}
              onChange={setContaExtrato}
              classNameContainer="flex-1"
              opcoes={contas.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="ext-de" className="text-xs shrink-0">
              De
            </Label>
            <DataPicker
              id="ext-de"
              value={extratoDe}
              onChange={setExtratoDe}
              max={extratoAte || undefined}
              className="min-w-0 flex-1"
            />
            <Label htmlFor="ext-ate" className="text-xs shrink-0">
              até
            </Label>
            <DataPicker
              id="ext-ate"
              value={extratoAte}
              onChange={setExtratoAte}
              min={extratoDe || undefined}
              className="min-w-0 flex-1"
            />
          </div>
          <BotoesGerar
            onGerar={gerarExtrato}
            desabilitado={!contaExtrato || !extratoDe || !extratoAte}
            gerando={gerando}
          />
          {erroExtrato && <p className="text-destructive text-xs">{erroExtrato}</p>}
        </CardRelatorio>

        <CardRelatorio
          icone={<PackageCheck className="w-5 h-5" />}
          titulo="Pedidos separados"
          descricao="O que está fora da loja agora, com quem, e há quantos dias. Dinheiro parado que ainda não virou venda."
        >
          <span className="text-xs text-muted-foreground">
            Sempre a situação de agora — não tem período a escolher.
          </span>
          <BotoesGerar onGerar={gerarPedidos} desabilitado={false} gerando={gerando} />
          {erroPedidos && <p className="text-destructive text-xs">{erroPedidos}</p>}
        </CardRelatorio>

        <CardRelatorio
          icone={<Users className="w-5 h-5" />}
          titulo="Captação de clientes"
          descricao="De onde vieram os clientes e o que cada canal rendeu — cadastros, quantos compraram e quanto faturaram."
        >
          <span className="text-xs text-muted-foreground">
            Sempre a situação de agora — não tem período a escolher.
          </span>
          <BotoesGerar onGerar={gerarCaptacao} desabilitado={false} gerando={gerando} />
          {erroCaptacao && <p className="text-destructive text-xs">{erroCaptacao}</p>}
        </CardRelatorio>

        {/* Notas fiscais emitidas — e os XMLs que o contador pede todo mês. */}
        {RelatorioNotasFiscais && (
          <CardRelatorio
            icone={<Receipt className="w-5 h-5" />}
            titulo="Notas fiscais emitidas"
            descricao="O que foi emitido no mês e os XMLs pro seu contador. Guarde-os por 5 anos."
          >
            <Button variant="outline" size="sm" onClick={() => setNotasFiscaisAberto(true)}>
              <FolderDown className="w-3.5 h-3.5 mr-1.5" /> Ver notas e XMLs
            </Button>
          </CardRelatorio>
        )}
      </div>

      {RelatorioNotasFiscais && (
        <Suspense fallback={null}>
          <RelatorioNotasFiscais
            aberta={notasFiscaisAberto}
            onFechar={() => setNotasFiscaisAberto(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default Relatorios

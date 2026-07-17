import { FC, ReactNode, useEffect, useState } from 'react'
import { FileDown, Printer, FolderDown, ShoppingCart, Package, BookOpen, FileText } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import { useImprimir } from '@/components/ImpressaoProvider'
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

// Central de relatórios: reúne num lugar só tudo o que o sistema imprime/salva
// em PDF. Cada card também continua acessível na tela de origem (Vendas,
// Produtos) — aqui é o atalho de quem pensa "quero um relatório" antes de
// pensar em qual tela ele mora.

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
  <div className="border rounded-lg p-5 bg-background flex flex-col gap-3">
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 text-muted-foreground shrink-0">{icone}</div>
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
      <h2 className="text-2xl font-bold mb-1">Relatórios</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Todos os relatórios do sistema num lugar só — pra imprimir ou salvar em PDF.
      </p>

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
            <input
              id="mes-vendas"
              type="month"
              value={mesVendas}
              max={mesAtualLocal()}
              onChange={(e) => setMesVendas(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
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
                <select
                  id="mes-entradas"
                  value={mesEntradas}
                  onChange={(e) => setMesEntradas(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {mesesEntradas.map((m) => (
                    <option key={m} value={m}>
                      {rotuloMesEntradas(m)}
                    </option>
                  ))}
                </select>
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
      </div>
    </div>
  )
}

export default Relatorios

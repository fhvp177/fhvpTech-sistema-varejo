import { FC, useEffect, useState } from 'react'
import { FileDown, Printer, FolderDown, FileText } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@fhvptech/core/ui/dialog'
import { useImprimir } from '@/components/ImpressaoProvider'
import { nomeImpressao } from '@/utils/nomeImpressao'
import {
  gerarHtmlRelatorioEntradas,
  rotuloMesEntradas as rotuloMes,
  dataCurtaEntrada as dataCurta,
  type NotaEntradaRelatorio as NotaResumo
} from '@/utils/relatorioEntradas'

// Histórico das notas fiscais importadas + o pacote mensal do contador:
// relatório de entradas (PDF/impresso) e os próprios XMLs exportados pra uma
// pasta — o XML é o documento fiscal oficial, é ele que o contador escritura.
// O HTML do relatório vive em utils/relatorioEntradas (compartilhado com a
// página Relatórios).

type Props = { aberto: boolean; onFechar: () => void }

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ModalNotasEntrada: FC<Props> = ({ aberto, onFechar }) => {
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState('')
  const [notas, setNotas] = useState<NotaResumo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const imprimirDoc = useImprimir()

  useEffect(() => {
    if (!aberto) return
    setMensagem('')
    setErro('')
    ;(async () => {
      const resp = await window.api.notasEntrada.meses()
      if (resp.success) {
        const lista = resp.data as string[]
        setMeses(lista)
        setMes((atual) => (atual && lista.includes(atual) ? atual : (lista[0] ?? '')))
      }
    })()
  }, [aberto])

  useEffect(() => {
    if (!aberto || !mes) {
      setNotas([])
      return
    }
    setCarregando(true)
    ;(async () => {
      const resp = await window.api.notasEntrada.listar(mes)
      if (resp.success) setNotas(resp.data as NotaResumo[])
      setCarregando(false)
    })()
  }, [aberto, mes])

  const gerarRelatorio = async (acao: 'pdf' | 'imprimir') => {
    if (notas.length === 0) return
    setGerando(true)
    setErro('')
    try {
      const html = gerarHtmlRelatorioEntradas(mes, notas)
      const nome = nomeImpressao.relatorioEntradas(mes)
      if (acao === 'imprimir') {
        await imprimirDoc(html, nome, 'documento')
        return
      }
      const resp = await window.api.impressao.salvarPdf(html, nome)
      if (!resp.success) setErro(`Erro ao gerar o relatório: ${resp.error}`)
    } finally {
      setGerando(false)
    }
  }

  const exportarXmls = async () => {
    setErro('')
    setMensagem('')
    const resp = await window.api.notasEntrada.exportarXmls(mes)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    if (resp.data) {
      setMensagem(
        `${resp.data.quantidade} XML(s) salvos em ${resp.data.pasta} — é só mandar essa pasta pro contador.`
      )
    }
  }

  const total = notas.reduce((s, n) => s + n.valor_total, 0)

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Notas de entrada (compras importadas)</DialogTitle>
        </DialogHeader>

        {meses.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Nenhuma nota importada ainda. Use <strong>Importar XML</strong> na tela de produtos —
            cada nota importada aparece aqui, pronta pro relatório do contador.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
              <span className="text-sm text-muted-foreground">
                {notas.length} nota(s) · {dinheiro(total)}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gerarRelatorio('pdf')}
                  disabled={gerando || notas.length === 0}
                >
                  <FileDown className="w-3.5 h-3.5 mr-1.5" /> Relatório PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gerarRelatorio('imprimir')}
                  disabled={gerando || notas.length === 0}
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportarXmls}
                  disabled={notas.length === 0}
                  title="Salva os arquivos XML originais do mês numa pasta — é o que o contador pede"
                >
                  <FolderDown className="w-3.5 h-3.5 mr-1.5" /> Exportar XMLs
                </Button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Emissão</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nº</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fornecedor</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Itens</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {carregando && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-muted-foreground">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!carregando &&
                    notas.map((n) => (
                      <tr key={n.id} className="border-t border-border">
                        <td className="px-3 py-2 whitespace-nowrap">{dataCurta(n.data_emissao)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{n.numero ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="truncate max-w-[260px]" title={n.fornecedor_nome}>
                            {n.fornecedor_nome}
                          </div>
                          {n.fornecedor_cnpj && (
                            <div className="text-xs text-muted-foreground">{n.fornecedor_cnpj}</div>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-right text-muted-foreground"
                          title={`${n.produtos_novos} novo(s) · ${n.reposicoes} reposição(ões)`}
                        >
                          {n.total_itens}
                        </td>
                        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                          {dinheiro(n.valor_total)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {mensagem && (
              <p className="text-sm bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded px-3 py-2">
                {mensagem}
              </p>
            )}
            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ModalNotasEntrada

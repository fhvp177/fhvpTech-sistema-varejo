import { FC, useCallback, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import { Check, Clock, Download, FileText, Ban, AlertTriangle } from 'lucide-react'

// Relatório das notas fiscais do mês e exportação dos XMLs.
//
// Por que isto é obrigatório e não enfeite: o lojista é obrigado por lei a
// GUARDAR os XMLs por 5 anos, e todo mês o contador pede os do período. Sem
// esta tela, o documento fiscal ficava preso no banco sem forma de sair.
//
// O XML é buscado uma vez e guardado: a ACBr dá o primeiro download de graça e
// cobra crédito nos seguintes, então baixar de novo o mesmo arquivo sairia do
// bolso do lojista sem motivo.

const dinheiro = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const rotuloMes = (mes: string) => {
  const [a, m] = (mes ?? '').split('-')
  if (!a || !m) return mes
  const nomes = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ]
  return `${nomes[Number(m) - 1] ?? m} de ${a}`
}

const ESTADO: Record<string, { rotulo: string; cor: string; Icone: FC<{ className?: string }> }> = {
  autorizado: { rotulo: 'Autorizada', cor: 'text-emerald-700', Icone: Check },
  pendente: { rotulo: 'Aguardando', cor: 'text-amber-700', Icone: Clock },
  cancelado: { rotulo: 'Cancelada', cor: 'text-muted-foreground', Icone: Ban },
  rejeitado: { rotulo: 'Rejeitada', cor: 'text-red-700', Icone: AlertTriangle },
  denegado: { rotulo: 'Denegada', cor: 'text-red-700', Icone: AlertTriangle },
  erro: { rotulo: 'Com erro', cor: 'text-red-700', Icone: AlertTriangle }
}

type Props = { aberta: boolean; onFechar: () => void }

const RelatorioNotasFiscais: FC<Props> = ({ aberta, onFechar }) => {
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState('')
  const [notas, setNotas] = useState<NotaDoMes[]>([])
  const [baixando, setBaixando] = useState(false)
  const [progresso, setProgresso] = useState('')

  useEffect(() => {
    if (!aberta) return
    window.api.fiscal.mesesComNotas().then((r) => {
      if (!r.success) return
      setMeses(r.data)
      setMes((m) => m || r.data[0] || '')
    })
  }, [aberta])

  const carregar = useCallback(async () => {
    if (!mes) return setNotas([])
    const r = await window.api.fiscal.notasDoMes(mes)
    if (r.success) setNotas(r.data)
  }, [mes])

  useEffect(() => {
    if (aberta) carregar()
  }, [aberta, carregar])

  const autorizadas = notas.filter((n) => n.status === 'autorizado')
  const totalAutorizado = autorizadas.reduce((s, n) => s + (n.venda_total ?? 0), 0)

  // Baixa os XMLs que faltam e salva todos numa pasta escolhida pelo lojista —
  // é o pacote que ele manda pro contador.
  const exportarXmls = async () => {
    if (!autorizadas.length) return
    setBaixando(true)
    const arquivos: Array<{ nome: string; conteudo: string }> = []
    for (let i = 0; i < autorizadas.length; i++) {
      const n = autorizadas[i]
      setProgresso(`Preparando ${i + 1} de ${autorizadas.length}…`)
      const r = await window.api.fiscal.xmlNota({ vendaId: n.venda_id })
      if (r.success && r.data.xml) {
        // Nome do arquivo pela chave de acesso — é como o contador espera.
        arquivos.push({ nome: `${n.chave || `nota-${n.numero}`}.xml`, conteudo: r.data.xml })
      }
    }
    setProgresso('')
    setBaixando(false)
    if (!arquivos.length) return

    const r = await window.api.fiscal.salvarXmls(mes, arquivos)
    if (r.success) {
      setProgresso(`${arquivos.length} arquivos salvos.`)
      setTimeout(() => setProgresso(''), 4000)
    }
    await carregar()
  }

  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Notas fiscais emitidas</DialogTitle>
        </DialogHeader>

        {meses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma nota fiscal emitida ainda.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="mesNf">
                  Mês
                </label>
                <select
                  id="mesNf"
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                >
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {rotuloMes(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{autorizadas.length}</strong>{' '}
                  {autorizadas.length === 1 ? 'nota autorizada' : 'notas autorizadas'} ·{' '}
                  {dinheiro(totalAutorizado)}
                </p>
              </div>
              <Button onClick={exportarXmls} disabled={baixando || autorizadas.length === 0}>
                <Download className="w-4 h-4 mr-1.5" />
                {baixando ? 'Preparando…' : 'Salvar XMLs'}
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              <FileText className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                O XML é o documento que vale legalmente — você precisa{' '}
                <strong>guardá-lo por 5 anos</strong>. Use "Salvar XMLs" para gerar a pasta que o
                seu contador pede todo mês.
              </p>
            </div>

            {progresso && <p className="text-sm text-center">{progresso}</p>}

            <div className="border rounded-md max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium w-20">Número</th>
                    <th className="p-2 text-left font-medium w-28">Situação</th>
                    <th className="p-2 text-left font-medium">Chave de acesso</th>
                    <th className="p-2 text-right font-medium w-24">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {notas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        Nenhuma nota neste mês.
                      </td>
                    </tr>
                  ) : (
                    notas.map((n) => {
                      const e = ESTADO[n.status] ?? ESTADO.erro
                      return (
                        <tr key={n.id} className="border-t">
                          <td className="p-2 tabular-nums">{n.numero || '—'}</td>
                          <td className={`p-2 ${e.cor}`}>
                            <span className="flex items-center gap-1.5">
                              <e.Icone className="w-3.5 h-3.5 shrink-0" />
                              {e.rotulo}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[280px]">
                            {n.chave ?? '—'}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {dinheiro(n.venda_total)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default RelatorioNotasFiscais

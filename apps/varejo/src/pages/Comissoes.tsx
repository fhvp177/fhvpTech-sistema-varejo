import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CheckCircle,
  FileDown,
  Info,
  Printer,
  RotateCcw,
  Users
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@fhvptech/core/ui/dialog'
import MesPicker from '@/components/MesPicker'
import { useImprimir } from '@/components/ImpressaoProvider'
import { nomeImpressao } from '@/utils/nomeImpressao'
import {
  gerarHtmlRelatorioComissoes,
  rotuloMesComissao,
  type DetalheRelatorioComissao
} from '@/utils/relatorioComissoes'

// Comissões — a tela do gerente.
//
// Ela responde três perguntas, nesta ordem de importância: quanto tenho a pagar
// este mês, para quem, e por quê. A terceira é a que sustenta as outras duas:
// número que não se explica vira discussão no balcão, então o detalhamento
// venda a venda está a um clique do nome de cada pessoa.

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const percentual = (v: number): string =>
  `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

const dataBr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/')

const mesAtualLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const Card: FC<{ rotulo: string; valor: string; destaque?: boolean }> = ({
  rotulo,
  valor,
  destaque
}) => (
  <div
    className={
      'border rounded-lg p-4 ' + (destaque ? 'bg-primary/5 border-primary/30' : 'bg-background')
    }
  >
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    <p className={'mt-1 font-semibold ' + (destaque ? 'text-xl text-primary' : 'text-xl')}>
      {valor}
    </p>
  </div>
)

const Comissoes: FC = () => {
  const { showToast } = useToast()
  const confirmar = useConfirm()
  const imprimirDoc = useImprimir()

  const [mes, setMes] = useState(mesAtualLocal)
  const [resumo, setResumo] = useState<ResumoComissoes | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)

  const [detalhe, setDetalhe] = useState<{
    linha: LinhaComissao
    vendas: VendaComissao[]
  } | null>(null)

  const [pagamento, setPagamento] = useState<{ linha: LinhaComissao; observacao: string } | null>(
    null
  )

  const carregar = useCallback(async () => {
    setCarregando(true)
    const resp = await window.api.comissoes.resumo(mes)
    setCarregando(false)
    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      setResumo(null)
      return
    }
    setResumo(resp.data)
  }, [mes, showToast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const linhas = resumo?.linhas ?? []
  const comissionaveis = useMemo(() => linhas.filter((l) => l.comissionavel === 1), [linhas])

  const totais = useMemo(() => {
    const apurado = comissionaveis.reduce((s, l) => s + l.valor_comissao, 0)
    const emAberto = comissionaveis
      .filter((l) => l.pago_em === null)
      .reduce((s, l) => s + l.valor_comissao, 0)
    const base = comissionaveis.reduce((s, l) => s + l.base, 0)
    return { apurado, emAberto, base, pago: apurado - emAberto }
  }, [comissionaveis])

  const abrirDetalhe = async (linha: LinhaComissao): Promise<void> => {
    const resp = await window.api.comissoes.detalhe(linha.vendedor_id, mes)
    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      return
    }
    setDetalhe({ linha, vendas: resp.data })
  }

  const confirmarPagamento = async (): Promise<void> => {
    if (!pagamento) return
    setSalvando(true)
    const resp = await window.api.comissoes.registrarPagamento({
      vendedor_id: pagamento.linha.vendedor_id as number,
      mes,
      observacao: pagamento.observacao || null
    })
    setSalvando(false)
    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      return
    }
    setPagamento(null)
    showToast({
      message: `Comissão de ${pagamento.linha.vendedor_nome} registrada como paga: ${dinheiro(
        resp.data.valor_comissao
      )}.`,
      variant: 'success'
    })
    await carregar()
  }

  const estornar = async (linha: LinhaComissao): Promise<void> => {
    const ok = await confirmar({
      titulo: 'Estornar o pagamento?',
      mensagem:
        `O registro de pagamento da comissão de ${linha.vendedor_nome} em ` +
        `${rotuloMesComissao(mes)} será apagado, e o período volta a ficar em aberto. ` +
        'O dinheiro que já saiu do caixa não é desfeito por aqui.',
      rotuloConfirmar: 'Estornar',
      rotuloCancelar: 'Manter'
    })
    if (!ok) return
    const resp = await window.api.comissoes.estornarPagamento(linha.pagamento_id as number)
    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      return
    }
    showToast({ message: 'Pagamento estornado.', variant: 'success' })
    await carregar()
  }

  const gerarRelatorio = async (comDetalhe: boolean): Promise<void> => {
    if (linhas.length === 0) return
    setGerando(true)
    try {
      let detalhes: Map<number | null, DetalheRelatorioComissao[]> | undefined
      if (comDetalhe) {
        detalhes = new Map()
        for (const l of comissionaveis) {
          const resp = await window.api.comissoes.detalhe(l.vendedor_id, mes)
          if (resp.success) detalhes.set(l.vendedor_id, resp.data)
        }
      }
      const html = gerarHtmlRelatorioComissoes(mes, linhas, { detalhes })
      await imprimirDoc(html, nomeImpressao.relatorioComissoes(mes), 'documento')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BadgePercent className="w-6 h-6 text-primary" /> Comissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Percentual sobre o valor da venda, já com o desconto abatido e sem o que foi devolvido.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Mês</Label>
            <MesPicker value={mes} onChange={setMes} maxMes={mesAtualLocal()} align="right" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gerarRelatorio(false)}
            disabled={gerando || linhas.length === 0}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Resumo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gerarRelatorio(true)}
            disabled={gerando || comissionaveis.length === 0}
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" /> Detalhado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card rotulo="Vendedores" valor={String(comissionaveis.length)} />
        <Card rotulo="Base de cálculo" valor={dinheiro(totais.base)} />
        <Card rotulo="Comissão apurada" valor={dinheiro(totais.apurado)} />
        <Card rotulo="Em aberto" valor={dinheiro(totais.emAberto)} destaque />
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Apurando…</p>
      ) : linhas.length === 0 ? (
        <EstadoVazio
          icone={<Users className="w-10 h-10" />}
          dica="Escolha outro mês, ou confira se as vendas do período têm vendedor informado."
        >
          Nenhuma venda em {rotuloMesComissao(mes)}.
        </EstadoVazio>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Vendedor</th>
                <th className="text-right font-medium px-4 py-2.5">Vendas</th>
                <th className="text-right font-medium px-4 py-2.5">Base</th>
                <th className="text-right font-medium px-4 py-2.5">%</th>
                <th className="text-right font-medium px-4 py-2.5">Comissão</th>
                <th className="text-left font-medium px-4 py-2.5">Situação</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const semVendedor = l.comissionavel === 0
                const pago = l.pago_em !== null
                // Devolução lançada depois do fechamento faz o apurado de hoje
                // discordar do que saiu do caixa. Não é erro — é informação que
                // o gerente precisa pra acertar no mês seguinte.
                const divergente =
                  pago &&
                  l.valor_pago_comissao !== null &&
                  Math.abs(l.valor_pago_comissao - l.valor_comissao) >= 0.01
                return (
                  <tr
                    key={String(l.vendedor_id)}
                    className={
                      'border-t ' + (semVendedor ? 'bg-muted/30 text-muted-foreground' : '')
                    }
                  >
                    <td className="px-4 py-2.5">
                      {semVendedor ? (
                        <span className="italic">Sem vendedor</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirDetalhe(l)}
                          className="font-medium hover:text-primary hover:underline text-left"
                        >
                          {l.vendedor_nome}
                        </button>
                      )}
                      {l.ativo === 0 && !semVendedor && (
                        <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.qtd_vendas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(l.base)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {semVendedor ? (
                        '—'
                      ) : l.pct_misto === 1 ? (
                        <span
                          className="text-xs text-muted-foreground"
                          title="As vendas deste período foram feitas com percentuais diferentes. O detalhamento mostra o de cada venda."
                        >
                          misto
                        </span>
                      ) : (
                        percentual(l.pct_vigente)
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                      {dinheiro(l.valor_comissao)}
                    </td>
                    <td className="px-4 py-2.5">
                      {semVendedor ? (
                        <span className="text-xs">não comissiona</span>
                      ) : pago ? (
                        <span className="inline-flex items-center gap-1 text-xs rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                          <CheckCircle className="w-3 h-3" /> Pago em {dataBr(l.pago_em as string)}
                        </span>
                      ) : (
                        <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                          Em aberto
                        </span>
                      )}
                      {divergente && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Pago {dinheiro(l.valor_pago_comissao as number)} — houve devolução depois
                          do fechamento.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {!semVendedor &&
                        (pago ? (
                          <Button variant="ghost" size="sm" onClick={() => estornar(l)}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Estornar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={l.valor_comissao <= 0}
                            onClick={() => setPagamento({ linha: l, observacao: '' })}
                          >
                            Registrar pagamento
                          </Button>
                        ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {linhas.some((l) => l.comissionavel === 0) && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Vendas sem vendedor informado aparecem na lista para explicar a diferença contra o
          faturamento do mês, mas não geram comissão — não há a quem pagar.
        </p>
      )}

      {/* Detalhamento venda a venda */}
      <Dialog open={detalhe !== null} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {detalhe?.linha.vendedor_nome} — {rotuloMesComissao(mes)}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Venda</th>
                  <th className="text-left font-medium px-3 py-2">Data</th>
                  <th className="text-left font-medium px-3 py-2">Cliente</th>
                  <th className="text-right font-medium px-3 py-2">Total</th>
                  <th className="text-right font-medium px-3 py-2">Devolvido</th>
                  <th className="text-right font-medium px-3 py-2">Base</th>
                  <th className="text-right font-medium px-3 py-2">%</th>
                  <th className="text-right font-medium px-3 py-2">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {detalhe?.vendas.map((v) => (
                  <tr key={v.venda_id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      #{v.venda_id}
                    </td>
                    <td className="px-3 py-2">{dataBr(v.data)}</td>
                    <td className="px-3 py-2">{v.cliente_nome ?? 'Consumidor'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinheiro(v.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {v.devolvido > 0 ? `− ${dinheiro(v.devolvido)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinheiro(v.base)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{percentual(v.pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {dinheiro(v.valor_comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-2" colSpan={7}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {dinheiro(detalhe?.linha.valor_comissao ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalhe(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pagamento */}
      <Dialog open={pagamento !== null} onOpenChange={(o) => !o && setPagamento(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento da comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{pagamento?.linha.vendedor_nome}</strong> — {rotuloMesComissao(mes)}
            </p>
            <div className="rounded-lg border bg-muted/40 p-3 flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Valor da comissão</span>
              <span className="text-xl font-bold">
                {dinheiro(pagamento?.linha.valor_comissao ?? 0)}
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="com-obs">Observação (opcional)</Label>
              <Input
                id="com-obs"
                value={pagamento?.observacao ?? ''}
                onChange={(e) =>
                  setPagamento((p) => (p ? { ...p, observacao: e.target.value } : p))
                }
                placeholder="Ex.: pago em dinheiro, junto com o salário"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O sistema guarda este valor como o que foi pago. Devolução lançada depois não
              reescreve o registro — ela aparece como diferença para você acertar no mês seguinte.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagamento(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmarPagamento} disabled={salvando}>
              {salvando ? 'Registrando…' : 'Confirmar pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Comissoes

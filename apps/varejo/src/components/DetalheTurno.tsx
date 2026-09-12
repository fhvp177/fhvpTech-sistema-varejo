import { FC, useCallback, useEffect, useState } from 'react'
import { Printer, Ban } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import { gerarHtmlFechamentoCaixa } from '@/utils/relatorioFinanceiro'
import { gerarHtmlCupomFechamentoCaixa } from '@/utils/cupomCaixa'
import { obterDadosLoja } from '@/utils/dadosLoja'
import { useImprimir } from '@/components/ImpressaoProvider'

type Contagem = {
  forma: string
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

type VendaDoTurno = {
  id: number
  data: string
  total: number
  valor_pago: number
  status_pagamento: string
  forma_pagamento: string | null
  cliente_nome: string | null
  vendedor_nome: string | null
  cancelada: number
}

type Resumo = {
  num_vendas: number
  total: number
  recebido: number
  a_prazo: number
  canceladas: number
  por_forma: Array<{ forma: string; num: number; total: number }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TurnoLinha = any

type Props = {
  turno: TurnoLinha | null
  onFechar: () => void
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtQuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  crediario: 'Crediário',
  credito_loja: 'Crédito da loja'
}

/**
 * O que aconteceu num turno já fechado.
 *
 * ── A pergunta que isto responde ────────────────────────────────────────────
 * "Fechou com R$ 40 a menos. De onde veio?"
 *
 * Antes o histórico mostrava quem fechou, quando, e a etiqueta de conferido —
 * e mais nada. A diferença ficava só na tela do fechamento, que passa uma vez e
 * some, e o relatório impresso existia sem nenhum botão que o alcançasse.
 *
 * ── ⚠️ Total e recebido são colunas SEPARADAS, e é o ponto ─────────────────
 * O total é o que saiu da prateleira; o recebido é o dinheiro que entrou. Uma
 * venda a prazo soma no primeiro e não no segundo, e só o segundo tem chance de
 * bater com a contagem da gaveta. Mostrar um número só faria o lojista procurar
 * uma diferença que nunca existiu.
 */
const DetalheTurno: FC<Props> = ({ turno, onFechar }) => {
  const imprimirDoc = useImprimir()
  const [contagens, setContagens] = useState<Contagem[]>([])
  const [vendas, setVendas] = useState<VendaDoTurno[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const turnoId = turno?.id ?? null

  const carregar = useCallback(async () => {
    if (turnoId == null) return
    setCarregando(true)
    setErro('')
    const [rRel, rVendas] = await Promise.all([
      window.api.caixa.turnoParaRelatorio(turnoId),
      window.api.caixa.vendasDoTurno(turnoId)
    ])
    if (rRel.success && rRel.data) setContagens((rRel.data as { contagens: Contagem[] }).contagens)
    else if (!rRel.success) setErro(rRel.error)
    if (rVendas.success) {
      const d = rVendas.data as { vendas: VendaDoTurno[]; resumo: Resumo }
      setVendas(d.vendas)
      setResumo(d.resumo)
    }
    setCarregando(false)
  }, [turnoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const imprimirRelatorio = async () => {
    if (turnoId == null) return
    const r = await window.api.caixa.turnoParaRelatorio(turnoId)
    if (!r.success || !r.data) {
      setErro(r.success ? 'Turno não encontrado.' : r.error)
      return
    }
    const d = r.data as { turno: TurnoLinha; contagens: Contagem[] }
    /*
     * ⚠️ Em que papel sai é escolha do lojista (Configurações → Impressão), e
     * o padrão é a bobina. O layout e a CATEGORIA andam juntos: HTML de 68mm
     * pela categoria de folha sai como uma tira no meio da A4, e o contrário
     * sai cortado na bobina.
     */
    const prefs = await window.api.impressao.obterPreferencias()
    const emA4 = prefs.success && prefs.data.papelCaixa === 'a4'
    const html = emA4
      ? gerarHtmlFechamentoCaixa(d.turno, d.contagens)
      : gerarHtmlCupomFechamentoCaixa(d.turno, d.contagens, await obterDadosLoja())
    await imprimirDoc(
      html,
      `Fechamento de caixa ${turnoId}`,
      emA4 ? 'documento' : 'cupom'
    )
  }

  const dinheiro = contagens.find((c) => c.forma === 'dinheiro')

  return (
    <Dialog open={turno !== null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {turno?.conta_nome} · {fmtQuando(turno?.aberto_em ?? null)} a{' '}
            {fmtQuando(turno?.fechado_em ?? null)}
          </DialogTitle>
        </DialogHeader>

        {erro && (
          <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{erro}</p>
        )}

        <div className="max-h-[70vh] space-y-3 overflow-y-auto">
          {/* ── A diferença, que é o que se procura ao abrir isto ── */}
          {dinheiro && (
            <div
              className={`rounded-lg px-3 py-3 text-center ${
                dinheiro.diferenca === 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              <p className="text-[12.5px]">Diferença no dinheiro</p>
              <p className="num text-2xl font-bold">
                {dinheiro.diferenca === 0
                  ? 'Sem diferença'
                  : `${dinheiro.diferenca > 0 ? 'Sobra de ' : 'Falta de '}${fmt(
                      Math.abs(dinheiro.diferenca)
                    )}`}
              </p>
              <p className="num mt-1 text-[11.5px]">
                esperado {fmt(dinheiro.valor_esperado)} · contado {fmt(dinheiro.valor_contado)}
              </p>
            </div>
          )}

          {turno?.justificativa && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px]">
              <span className="font-medium">Observação: </span>
              {turno.justificativa}
            </p>
          )}

          {/* ── O que foi vendido ── */}
          {resumo && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { r: 'Vendas', v: String(resumo.num_vendas) },
                { r: 'Total vendido', v: fmt(resumo.total) },
                { r: 'Recebido', v: fmt(resumo.recebido) },
                { r: 'A prazo', v: fmt(resumo.a_prazo) }
              ].map((c) => (
                <div key={c.r} className="rounded-lg border px-3 py-2">
                  <p className="text-[11.5px] text-muted-foreground">{c.r}</p>
                  <p className="num text-[15px] font-semibold">{c.v}</p>
                </div>
              ))}
            </div>
          )}

          {resumo && resumo.por_forma.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {resumo.por_forma.map((f) => (
                <li key={f.forma} className="flex items-center justify-between px-3 py-1.5">
                  <span>
                    {ROTULO_FORMA[f.forma] ?? f.forma}
                    <span className="ml-1 text-[11.5px] text-muted-foreground">
                      {f.num} venda{f.num !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="num">{fmt(f.total)}</span>
                </li>
              ))}
            </ul>
          )}

          {carregando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : vendas.length === 0 ? (
            /*
              ⚠️ A frase distingue "não vendeu nada" de "é anterior ao registro".
              Turnos fechados antes da migration 047 não têm vínculo com venda
              nenhuma, e uma lista vazia sem explicação faria o lojista concluir
              que o movimento sumiu.
            */
            <p className="rounded-lg bg-muted/50 px-3 py-3 text-center text-[12.5px] text-muted-foreground">
              Nenhuma venda vinculada a este turno. Turnos fechados antes desta
              atualização não guardavam esse vínculo — o fechamento acima continua
              válido.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {vendas.map((v) => (
                <li
                  key={v.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-2 ${
                    v.cancelada ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      #{v.id} · {v.cliente_nome || 'Avulso'}
                      {v.cancelada === 1 && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-destructive">
                          <Ban className="h-3 w-3" /> cancelada
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {[
                        fmtQuando(v.data),
                        v.forma_pagamento ? ROTULO_FORMA[v.forma_pagamento] ?? v.forma_pagamento : null,
                        v.vendedor_nome
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="num shrink-0 text-right font-medium">{fmt(v.total)}</span>
                </li>
              ))}
            </ul>
          )}

          {resumo && resumo.canceladas > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {resumo.canceladas} venda{resumo.canceladas !== 1 ? 's' : ''} cancelada
              {resumo.canceladas !== 1 ? 's' : ''} neste turno — não somam nos totais acima, e
              costumam explicar diferença na gaveta.
            </p>
          )}
        </div>

        <Button variant="outline" onClick={imprimirRelatorio}>
          <Printer className="mr-1.5 h-4 w-4" />
          Imprimir o fechamento
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export default DetalheTurno

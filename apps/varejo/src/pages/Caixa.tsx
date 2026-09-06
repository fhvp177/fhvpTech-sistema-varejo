import { FC, useCallback, useEffect, useState } from 'react'
import {
  Lock,
  LockOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  History,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'
import { useToast } from '@fhvptech/core/ui/toast'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useSessao } from '@/App'

/**
 * Turno de caixa, com fechamento às cegas.
 *
 * ── ⚠️ O que esta tela NUNCA pode mostrar ───────────────────────────────────
 * O valor esperado, enquanto o turno está aberto. Não é escolha de layout: o
 * backend não tem canal que responda isso — o esperado só volta na resposta do
 * fechamento, depois de a contagem ter sido enviada.
 *
 * O motivo é simples e vale repetir: quem vê o esperado antes não conta, confere.
 * O número bate sempre, a quebra nunca aparece, e o controle vira enfeite.
 *
 * ── O fluxo ─────────────────────────────────────────────────────────────────
 *   abrir (fundo de troco)
 *     → vender o dia todo, com sangrias e suprimentos
 *       → contar às cegas e enviar
 *         → o sistema revela a diferença
 *           → o GERENTE aceita com o PIN dele, e o turno vira pedra
 *
 * ⚠️ Aceitar não é "eu vi": é assumir a diferença. Se faltaram R$ 50, alguém
 * respondeu por eles.
 */

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito'
}

/*
 * ⚠️ Só o DINHEIRO é contado de verdade.
 *
 * Cartão e PIX não estão na gaveta: o que existe deles é o comprovante da
 * maquininha e o aplicativo do banco. Eles aparecem no fechamento para o
 * lojista conferir contra esses papéis, mas pedir para "contar" PIX seria
 * teatro — e teatro ensina o operador a preencher qualquer número.
 */
const FORMAS_CONTAGEM = ['dinheiro', 'pix', 'debito', 'credito']

const Caixa: FC = () => {
  const { ehDono } = useSessao()
  const { showToast } = useToast()

  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [turno, setTurno] = useState<TurnoCaixa | null>(null)
  const [historico, setHistorico] = useState<TurnoCaixa[]>([])
  const [carregando, setCarregando] = useState(true)

  const [abrirDialog, setAbrirDialog] = useState(false)
  const [contaId, setContaId] = useState('')
  const [fundo, setFundo] = useState('')

  const [movDialog, setMovDialog] = useState<'sangria' | 'suprimento' | null>(null)
  const [movValor, setMovValor] = useState('')
  const [movDescricao, setMovDescricao] = useState('')

  const [fecharDialog, setFecharDialog] = useState(false)
  const [contagem, setContagem] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<TurnoFechado | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const [rContas, rTurno, rHist] = await Promise.all([
      window.api.financeiro.listarContas(),
      window.api.caixa.turnoAberto(),
      ehDono ? window.api.caixa.listarTurnos(20) : Promise.resolve({ success: true, data: [] })
    ])
    if (rContas.success) {
      const lista = rContas.data as ContaFinanceira[]
      setContas(lista)
      setContaId((a) => a || String(lista.find((c) => c.tipo === 'caixa')?.id ?? lista[0]?.id ?? ''))
    }
    if (rTurno.success) setTurno(rTurno.data as TurnoCaixa | null)
    if (rHist.success) setHistorico((rHist.data as TurnoCaixa[]) ?? [])
    setCarregando(false)
  }, [ehDono])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abrir = async () => {
    const valor = parseFloat(fundo.replace(/\./g, '').replace(',', '.')) || 0
    const r = await window.api.caixa.abrirTurno(Number(contaId), valor)
    if (r.success) {
      setAbrirDialog(false)
      setFundo('')
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  const lancarMov = async () => {
    if (!turno || !movDialog) return
    const valor = parseFloat(movValor.replace(/\./g, '').replace(',', '.')) || 0
    const fn = movDialog === 'sangria' ? window.api.caixa.sangria : window.api.caixa.suprimento
    const r = await fn(turno.conta_id, valor, movDescricao)
    if (r.success) {
      setMovDialog(null)
      setMovValor('')
      setMovDescricao('')
      showToast({ message: movDialog === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.', variant: 'success' })
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  const fechar = async () => {
    if (!turno) return
    setOcupado(true)
    const contagens = FORMAS_CONTAGEM.map((forma) => ({
      forma,
      valor_contado: parseFloat((contagem[forma] ?? '').replace(/\./g, '').replace(',', '.')) || 0
    }))
    const r = await window.api.caixa.fecharTurno(turno.id, contagens)
    if (r.success) {
      setResultado(r.data as TurnoFechado)
      setFecharDialog(false)
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
    setOcupado(false)
  }

  const confirmar = async () => {
    if (!resultado) return
    setOcupado(true)
    const r = await window.api.caixa.confirmarTurno(resultado.turno.id, justificativa)
    if (r.success) {
      setResultado(null)
      setJustificativa('')
      showToast({ message: 'Fechamento confirmado.', variant: 'success' })
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
    setOcupado(false)
  }

  if (carregando) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="entrada-escalonada p-4 lg:p-8">
      <div className="hidden lg:block mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary" />
          Caixa
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Abra o turno ao começar o dia e feche ao terminar, contando o que está na gaveta.
        </p>
      </div>

      {/* ── Turno aberto, ou o convite para abrir ── */}
      {turno ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <LockOpen className="w-4 h-4 text-emerald-600" />
                Caixa aberto
              </p>
              <p className="num mt-1 text-[12.5px] text-muted-foreground">
                {turno.conta_nome} · aberto por {turno.aberto_por_nome ?? '—'} em{' '}
                {fmtDataHora(turno.aberto_em)}
              </p>
              <p className="num mt-0.5 text-[12.5px] text-muted-foreground">
                Fundo de troco: {fmt(turno.fundo_troco)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 lg:flex-none"
              onClick={() => {
                setMovDialog('sangria')
                setMovValor('')
                setMovDescricao('')
              }}
            >
              <ArrowUpFromLine className="w-4 h-4 mr-1.5" />
              Sangria
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 lg:flex-none"
              onClick={() => {
                setMovDialog('suprimento')
                setMovValor('')
                setMovDescricao('')
              }}
            >
              <ArrowDownToLine className="w-4 h-4 mr-1.5" />
              Suprimento
            </Button>
            <Button
              className="h-11 w-full lg:w-auto"
              onClick={() => {
                setContagem({})
                setFecharDialog(true)
              }}
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Fechar caixa
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Nenhum caixa aberto
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Abra o turno para que as vendas do dia entrem na conferência.
          </p>
          <Button className="mt-3 h-11 w-full lg:w-auto" onClick={() => setAbrirDialog(true)}>
            <LockOpen className="w-4 h-4 mr-1.5" />
            Abrir caixa
          </Button>
        </div>
      )}

      {/* ── Histórico ── */}
      {ehDono && (
        <div className="mt-5 lg:mt-6">
          <h3 className="mb-2 flex items-center gap-2 text-base lg:text-lg font-semibold">
            <History className="w-4 h-4 text-muted-foreground" />
            Fechamentos anteriores
          </h3>
          {historico.filter((t) => t.fechado_em).length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EstadoVazio icone={<History className="w-9 h-9" />}>
                Nenhum turno fechado ainda.
              </EstadoVazio>
            </div>
          ) : (
            <ul className="rounded-xl border bg-card divide-y">
              {historico
                .filter((t) => t.fechado_em)
                .map((t) => (
                  <li key={t.id} className="px-3 py-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium leading-tight">
                          {fmtDataHora(t.aberto_em)} → {fmtDataHora(t.fechado_em)}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {t.conta_nome} · fechou {t.fechado_por_nome ?? '—'}
                          {t.fora_de_hora === 1 ? ' · fora de hora' : ''}
                        </p>
                        {t.justificativa && (
                          <p className="mt-0.5 truncate text-[11.5px] italic text-muted-foreground">
                            “{t.justificativa}”
                          </p>
                        )}
                      </div>
                      <span className="shrink-0">
                        {t.confirmado_em ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                            <ShieldCheck className="w-3 h-3" /> conferido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> sem conferência
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Abrir ── */}
      <Dialog open={abrirDialog} onOpenChange={setAbrirDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid gap-1.5">
              <Label>Caixa</Label>
              <Select
                value={contaId}
                onChange={setContaId}
                opcoes={contas.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fundo">Fundo de troco</Label>
              <Input
                id="fundo"
                className="num"
                value={fundo}
                onChange={(e) => setFundo(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
              <p className="text-[11.5px] text-muted-foreground">
                Quanto já está na gaveta agora. Ele entra na conferência do fim do dia.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={abrir}>Abrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sangria / suprimento ── */}
      <Dialog open={movDialog !== null} onOpenChange={(o) => !o && setMovDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{movDialog === 'sangria' ? 'Sangria' : 'Suprimento'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <p className="text-[12.5px] text-muted-foreground">
              {movDialog === 'sangria'
                ? 'Dinheiro saindo da gaveta (depósito, pagamento em espécie).'
                : 'Dinheiro entrando na gaveta fora de uma venda (troco, aporte).'}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="mov-valor">Valor</Label>
              <Input
                id="mov-valor"
                className="num"
                value={movValor}
                onChange={(e) => setMovValor(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mov-desc">
                {movDialog === 'sangria' ? 'Para onde foi' : 'De onde veio'}
              </Label>
              <Input
                id="mov-desc"
                value={movDescricao}
                onChange={(e) => setMovDescricao(e.target.value)}
                placeholder={movDialog === 'sangria' ? 'Depósito no banco' : 'Troco do dono'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={lancarMov}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contagem às cegas ── */}
      <Dialog open={fecharDialog} onOpenChange={setFecharDialog}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Contar o caixa</DialogTitle>
          </DialogHeader>
          {/*
            ⚠️ Nenhum número esperado aparece aqui. É o ponto inteiro do
            fechamento às cegas — e não é só a tela que se cala: o backend não
            tem como responder essa pergunta antes de a contagem chegar.
          */}
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
              Conte a gaveta e digite o que <strong>encontrou</strong>. A diferença só aparece
              depois de enviar — é assim que a conferência vale alguma coisa.
            </p>
            {FORMAS_CONTAGEM.map((forma) => (
              <div key={forma} className="grid gap-1.5">
                <Label htmlFor={`cont-${forma}`}>
                  {ROTULO_FORMA[forma]}
                  {forma !== 'dinheiro' && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (do comprovante, se quiser conferir)
                    </span>
                  )}
                </Label>
                <Input
                  id={`cont-${forma}`}
                  className="num"
                  value={contagem[forma] ?? ''}
                  onChange={(e) => setContagem({ ...contagem, [forma]: e.target.value })}
                  placeholder="0,00"
                  autoFocus={forma === 'dinheiro'}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFecharDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={fechar} disabled={ocupado}>
              {ocupado ? 'Fechando…' : 'Fechar e ver a diferença'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── O resultado, e a confirmação do gerente ── */}
      <Dialog open={resultado !== null} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Fechamento do caixa</DialogTitle>
          </DialogHeader>
          {resultado && (
            <div className="grid gap-3 py-1">
              <div
                className={`rounded-lg px-3 py-3 text-center ${
                  resultado.diferenca_dinheiro === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                <p className="text-[12.5px]">Diferença no dinheiro</p>
                <p className="num text-2xl font-bold">
                  {resultado.diferenca_dinheiro === 0
                    ? 'Bateu certinho'
                    : `${resultado.diferenca_dinheiro > 0 ? 'Sobrou ' : 'Faltou '}${fmt(
                        Math.abs(resultado.diferenca_dinheiro)
                      )}`}
                </p>
              </div>

              <ul className="rounded-lg border divide-y text-sm">
                {resultado.contagens.map((c) => (
                  <li key={c.forma} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">{ROTULO_FORMA[c.forma] ?? c.forma}</span>
                    <span className="num shrink-0 text-right text-[12.5px]">
                      <span className="text-muted-foreground">esperado {fmt(c.valor_esperado)}</span>
                      {' · '}
                      contado {fmt(c.valor_contado)}
                      {c.diferenca !== 0 && (
                        <strong className={c.diferenca > 0 ? ' text-emerald-700' : ' text-rose-700'}>
                          {' '}
                          ({c.diferenca > 0 ? '+' : '−'}
                          {fmt(Math.abs(c.diferenca))})
                        </strong>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {ehDono ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="justif">
                      Observação
                      {resultado.diferenca_dinheiro !== 0 && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Input
                      id="justif"
                      value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                      placeholder="O que explica a diferença?"
                    />
                  </div>
                  {/*
                    ⚠️ Confirmar não é "eu vi": é ASSUMIR a diferença. Por isso o
                    texto do botão diz aceitar, e por isso só o gerente pode.
                  */}
                  <p className="text-[11.5px] text-muted-foreground">
                    Ao confirmar, o turno é fechado em definitivo e não pode mais ser alterado.
                    Correção depois disso é lançamento novo, no extrato.
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
                  A contagem foi registrada. Um gerente precisa conferir e aceitar a diferença.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultado(null)}>
              Fechar
            </Button>
            {ehDono && (
              <Button
                onClick={confirmar}
                disabled={
                  ocupado ||
                  (resultado?.diferenca_dinheiro !== 0 && justificativa.trim() === '')
                }
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Aceitar a diferença
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Caixa

import { FC, useCallback, useEffect, useState } from 'react'
import {
  Lock,
  LockOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  History,
  AlertTriangle,
  CheckCircle2,
  MonitorSmartphone
} from 'lucide-react'
import { IMaskInput } from 'react-imask'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
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
import { useCaixaDoAparelho } from '@/hooks/useCaixaDoAparelho'
import { CLASSE_DINHEIRO, paraNumero } from '@/utils/mascaras'

/**
 * Caixas da loja, e o fechamento às cegas.
 *
 * ── ⚠️ Só o DINHEIRO é contado ──────────────────────────────────────────────
 * Decisão do dono em 06/09, e ele tem razão: pedir para o vendedor digitar
 * quanto entrou de cartão e PIX é trabalho sem resultado. Esses valores o
 * sistema já sabe — não há nada para conferir contra, porque não existe pilha
 * de PIX na gaveta. Pior: um campo que sempre bate ensina a preencher qualquer
 * número, e essa é a mesma mão que preenche o do dinheiro.
 *
 * Então a contagem tem UM campo. As outras formas aparecem depois, no
 * resultado, como informação do que o sistema registrou no turno.
 *
 * ── ⚠️ O que esta tela NUNCA pode mostrar antes de fechar ───────────────────
 * O valor esperado. Não é disciplina de layout: o backend não tem canal que
 * responda isso — o esperado só volta na resposta do fechamento.
 *
 * ── Um turno por CAIXA ──────────────────────────────────────────────────────
 * A loja pode ter Caixa 1 e Caixa 2 abertos ao mesmo tempo. O que não pode é a
 * mesma gaveta com dois turnos, senão duas contagens brigam pelo mesmo dinheiro.
 */

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito'
}

type CaixaComTurno = { id: number; nome: string; turno: TurnoCaixa | null }

const Caixa: FC = () => {
  const { ehDono } = useSessao()
  const { showToast } = useToast()
  const { caixaId, escolher } = useCaixaDoAparelho()

  const [caixas, setCaixas] = useState<CaixaComTurno[]>([])
  const [historico, setHistorico] = useState<TurnoCaixa[]>([])
  const [carregando, setCarregando] = useState(true)

  const [abrindo, setAbrindo] = useState<CaixaComTurno | null>(null)
  const [fundo, setFundo] = useState('')

  const [movDialog, setMovDialog] = useState<{ tipo: 'sangria' | 'suprimento'; caixa: CaixaComTurno } | null>(null)
  const [movValor, setMovValor] = useState('')
  const [movDescricao, setMovDescricao] = useState('')

  const [fechando, setFechando] = useState<CaixaComTurno | null>(null)
  const [contado, setContado] = useState('')
  const [resultado, setResultado] = useState<TurnoFechado | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const [rCaixas, rHist] = await Promise.all([
      window.api.caixa.caixasComTurno(),
      ehDono ? window.api.caixa.listarTurnos(20) : Promise.resolve({ success: true, data: [] })
    ])
    if (rCaixas.success) setCaixas(rCaixas.data as CaixaComTurno[])
    if (rHist.success) setHistorico((rHist.data as TurnoCaixa[]) ?? [])
    setCarregando(false)
  }, [ehDono])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abrir = async () => {
    if (!abrindo) return
    const r = await window.api.caixa.abrirTurno(abrindo.id, paraNumero(fundo))
    if (r.success) {
      // Abrir um caixa é o gesto que diz "estou operando aqui": o aparelho
      // passa a ser este caixa, e o PDV para de perguntar.
      escolher(abrindo.id)
      setAbrindo(null)
      setFundo('')
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  const lancarMov = async () => {
    if (!movDialog) return
    const fn =
      movDialog.tipo === 'sangria' ? window.api.caixa.sangria : window.api.caixa.suprimento
    const r = await fn(movDialog.caixa.id, paraNumero(movValor), movDescricao)
    if (r.success) {
      setMovDialog(null)
      setMovValor('')
      setMovDescricao('')
      showToast({
        message: movDialog.tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.',
        variant: 'success'
      })
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  const fechar = async () => {
    if (!fechando?.turno) return
    setOcupado(true)
    // ⚠️ UMA contagem só: dinheiro. Ver o cabeçalho.
    const r = await window.api.caixa.fecharTurno(fechando.turno.id, [
      { forma: 'dinheiro', valor_contado: paraNumero(contado) }
    ])
    if (r.success) {
      setResultado(r.data as TurnoFechado)
      setFechando(null)
      setContado('')
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
      showToast({ message: 'Fechamento conferido.', variant: 'success' })
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
          Caixas
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Abra o caixa no início do expediente e feche ao encerrar, conferindo o dinheiro
          da gaveta.
        </p>
      </div>

      {caixas.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EstadoVazio
            icone={<Lock className="w-9 h-9" />}
            dica="Cadastre um caixa em Financeiro › Contas, escolhendo o tipo “Caixa”."
          >
            Nenhum caixa cadastrado.
          </EstadoVazio>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {caixas.map((c) => {
            const aberto = c.turno !== null
            const esteAparelho = caixaId === c.id
            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-card p-4 ${
                  esteAparelho ? 'border-primary ring-1 ring-primary/25' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      {aberto ? (
                        <LockOpen className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      {c.nome}
                    </p>
                    {aberto ? (
                      <>
                        <p className="num mt-1 text-[12.5px] text-muted-foreground">
                          Aberto por {c.turno!.aberto_por_nome ?? '—'} em{' '}
                          {fmtDataHora(c.turno!.aberto_em)}
                        </p>
                        <p className="num mt-0.5 text-[12.5px] text-muted-foreground">
                          Fundo de troco: {fmt(c.turno!.fundo_troco)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-[12.5px] text-muted-foreground">Fechado</p>
                    )}
                  </div>
                  {esteAparelho && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <MonitorSmartphone className="w-3 h-3" /> este aparelho
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {aberto ? (
                    <>
                      {/*
                        ⚠️ Cores próprias, e não o cinza de sempre. Sangria e
                        suprimento movem dinheiro de verdade: pintados como
                        qualquer botão secundário, eles somem no meio da tela e o
                        vendedor não encontra na hora em que precisa.
                      */}
                      <Button
                        className="h-11 flex-1 bg-amber-500 text-white hover:bg-amber-600 lg:flex-none"
                        onClick={() => {
                          setMovDialog({ tipo: 'sangria', caixa: c })
                          setMovValor('')
                          setMovDescricao('')
                        }}
                      >
                        <ArrowUpFromLine className="w-4 h-4 mr-1.5" />
                        Sangria
                      </Button>
                      <Button
                        className="h-11 flex-1 bg-sky-600 text-white hover:bg-sky-700 lg:flex-none"
                        onClick={() => {
                          setMovDialog({ tipo: 'suprimento', caixa: c })
                          setMovValor('')
                          setMovDescricao('')
                        }}
                      >
                        <ArrowDownToLine className="w-4 h-4 mr-1.5" />
                        Suprimento
                      </Button>
                      <Button
                        className="h-11 w-full bg-slate-800 text-white hover:bg-slate-900 lg:w-auto"
                        onClick={() => {
                          setContado('')
                          setFechando(c)
                        }}
                      >
                        <Lock className="w-4 h-4 mr-1.5" />
                        Fechar caixa
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700 lg:w-auto"
                      onClick={() => {
                        setFundo('')
                        setAbrindo(c)
                      }}
                    >
                      <LockOpen className="w-4 h-4 mr-1.5" />
                      Abrir caixa
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
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
                          {t.conta_nome} · {fmtDataHora(t.aberto_em)} → {fmtDataHora(t.fechado_em)}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          Fechado por {t.fechado_por_nome ?? '—'}
                          {t.fora_de_hora === 1 ? ' · fora do horário' : ''}
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
      <Dialog open={abrindo !== null} onOpenChange={(o) => !o && setAbrindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir {abrindo?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid gap-1.5">
              <Label htmlFor="fundo">Fundo de troco</Label>
              <IMaskInput
                id="fundo"
                {...CLASSE_DINHEIRO}
                value={fundo}
                onAccept={(v: string) => setFundo(v)}
                autoFocus
              />
              <p className="text-[11.5px] text-muted-foreground">
                Quanto já está na gaveta agora. Entra na conferência do fim do dia.
              </p>
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
              Este aparelho passa a operar em <strong>{abrindo?.nome}</strong>. As vendas feitas
              aqui entram neste caixa.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrindo(null)}>
              Cancelar
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={abrir}>
              Abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sangria / suprimento ── */}
      <Dialog open={movDialog !== null} onOpenChange={(o) => !o && setMovDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {movDialog?.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} — {movDialog?.caixa.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <p className="text-[12.5px] text-muted-foreground">
              {movDialog?.tipo === 'sangria'
                ? 'Dinheiro saindo da gaveta (depósito, pagamento em espécie).'
                : 'Dinheiro entrando na gaveta fora de uma venda (troco, aporte).'}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="mov-valor">Valor</Label>
              <IMaskInput
                id="mov-valor"
                {...CLASSE_DINHEIRO}
                value={movValor}
                onAccept={(v: string) => setMovValor(v)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mov-desc">
                {movDialog?.tipo === 'sangria' ? 'Para onde foi' : 'De onde veio'}
              </Label>
              <Input
                id="mov-desc"
                value={movDescricao}
                onChange={(e) => setMovDescricao(e.target.value)}
                placeholder={movDialog?.tipo === 'sangria' ? 'Depósito no banco' : 'Reposição de troco'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>
              Cancelar
            </Button>
            <Button
              className={
                movDialog?.tipo === 'sangria'
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-sky-600 text-white hover:bg-sky-700'
              }
              onClick={lancarMov}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contagem às cegas: UM campo ── */}
      <Dialog open={fechando !== null} onOpenChange={(o) => !o && setFechando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conferir {fechando?.nome}</DialogTitle>
          </DialogHeader>
          {/*
            ⚠️ Nenhum número esperado aparece aqui, e há UM campo só.

            Cartão e PIX não estão na gaveta: não há o que contar, e um campo que
            sempre bate ensina a preencher qualquer número — inclusive o do
            dinheiro, que é o único que importa.
          */}
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
              Confira as cédulas e moedas da gaveta e informe o total <strong>apurado</strong>.
              O sistema compara com o valor registrado e apresenta o resultado em seguida.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="contado">Dinheiro na gaveta</Label>
              <IMaskInput
                id="contado"
                {...CLASSE_DINHEIRO}
                value={contado}
                onAccept={(v: string) => setContado(v)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFechando(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-slate-800 text-white hover:bg-slate-900"
              onClick={fechar}
              disabled={ocupado}
            >
              {ocupado ? 'Fechando…' : 'Fechar caixa'}
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
                    ? 'Sem diferença'
                    : `${resultado.diferenca_dinheiro > 0 ? 'Sobra de ' : 'Falta de '}${fmt(
                        Math.abs(resultado.diferenca_dinheiro)
                      )}`}
                </p>
              </div>

              <ul className="rounded-lg border divide-y text-sm">
                {resultado.contagens.map((c) => (
                  <li key={c.forma} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">
                      {ROTULO_FORMA[c.forma] ?? c.forma}
                      {c.forma !== 'dinheiro' && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          (registrado, não contado)
                        </span>
                      )}
                    </span>
                    <span className="num shrink-0 text-right text-[12.5px]">
                      {c.forma === 'dinheiro' ? (
                        <>
                          <span className="text-muted-foreground">
                            esperado {fmt(c.valor_esperado)}
                          </span>
                          {' · '}contado {fmt(c.valor_contado)}
                          {c.diferenca !== 0 && (
                            <strong className={c.diferenca > 0 ? ' text-emerald-700' : ' text-rose-700'}>
                              {' '}
                              ({c.diferenca > 0 ? '+' : '−'}
                              {fmt(Math.abs(c.diferenca))})
                            </strong>
                          )}
                        </>
                      ) : (
                        fmt(c.valor_esperado)
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
                      placeholder="Motivo da diferença"
                    />
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    Ao aceitar, o turno é encerrado em definitivo e não pode mais ser
                    alterado. Qualquer correção posterior exige um novo lançamento no
                    extrato.
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
                  A contagem foi registrada. O fechamento aguarda a conferência de um
                  gerente, que responde pela diferença apurada.
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
                  ocupado || (resultado?.diferenca_dinheiro !== 0 && justificativa.trim() === '')
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

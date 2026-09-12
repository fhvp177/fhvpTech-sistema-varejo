import { FC, useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Wrench
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import { Skeleton } from '@fhvptech/core/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useSessao } from '@/App'
import { useEhCelular } from '@/hooks/useEhCelular'
import DicaRolante from '@/components/DicaRolante'

/**
 * Garantias: até quando a loja responde pelo que vendeu.
 *
 * ── O que esta tela responde ────────────────────────────────────────────────
 * Duas perguntas, e elas chegam nesta ordem no balcão:
 *
 *   1. "Isto aqui ainda está na garantia?" — com o cupom na mão, ou só com o
 *      nome do cliente, ou bipando o código da peça.
 *   2. "O que está em aberto?" — o que a loja ainda deve resolver.
 *
 * ── ⚠️ Esta tela NÃO mexe em dinheiro ───────────────────────────────────────
 * Registrar o desfecho é registrar a DECISÃO. Quando a resolução é devolver o
 * dinheiro, ele sai pela tela de Vendas, na devolução, que já lança o crédito,
 * baixa o livro-caixa e repõe a peça no estoque. Dois caminhos mexendo no mesmo
 * dinheiro dariam duas verdades para a mesma venda, e o caixa sairia do lugar
 * na primeira troca registrada nos dois lugares.
 *
 * ── ⚠️ Fora do prazo não é recusa automática ────────────────────────────────
 * O atendimento abre marcado como fora do prazo, e quem decide é o lojista.
 * Barrar aqui tiraria dele uma escolha que ele toma todo dia (cobrir por fora
 * da regra para não perder um cliente antigo), e a recusa ficaria sem registro.
 */

/** Mesma casca visual do `<Input>` do núcleo, para texto de várias linhas. */
const CLASSE_TEXTAREA =
  'mt-1 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 ' +
  'text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataCurta = (iso: string | null): string => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

const dataHora = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * O rótulo da garantia de um item, na linguagem do balcão.
 *
 * ⚠️ Os três casos são diferentes e precisam de frases diferentes. "Sem
 * garantia" é uma decisão do lojista; "vencida" é o prazo que passou; e
 * "estimada" é venda anterior a este módulo, em que o sistema não sabe o que
 * foi prometido e diz isso em vez de inventar uma data.
 */
function situacaoDoItem(item: ItemComGarantia): {
  texto: string
  detalhe: string
  cor: string
} {
  if (item.venda_cancelada) {
    return {
      texto: 'Venda cancelada',
      detalhe: 'esta compra foi desfeita, não há garantia sobre ela',
      cor: 'bg-muted text-muted-foreground'
    }
  }
  if (item.garantia_dias === 0 || item.garantia_ate == null) {
    return {
      texto: 'Sem garantia',
      detalhe: 'este produto foi vendido sem prazo de garantia',
      cor: 'bg-muted text-muted-foreground'
    }
  }
  const faltam = item.dias_restantes ?? 0
  if (faltam < 0) {
    return {
      texto: 'Garantia vencida',
      detalhe: `terminou em ${dataCurta(item.garantia_ate)}, há ${Math.abs(faltam)} dia(s)`,
      cor: 'bg-critical-soft text-critical'
    }
  }
  return {
    texto: 'Na garantia',
    detalhe: `até ${dataCurta(item.garantia_ate)}${faltam === 0 ? ', vence hoje' : `, faltam ${faltam} dia(s)`}`,
    cor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  }
}

const ROTULO_DESFECHO: Record<string, string> = {
  troca: 'Trocado',
  conserto: 'Consertado',
  devolucao: 'Dinheiro devolvido',
  sem_defeito: 'Sem defeito encontrado',
  fora_do_prazo: 'Fora do prazo'
}

/**
 * Os cinco desfechos, agrupados pelo que significam para a loja.
 *
 * ⚠️ A separação entre resolver e recusar não é cosmética: loja com muitas
 * TROCAS tem problema de produto, loja com muitas RECUSAS tem problema de
 * expectativa criada na venda. São diagnósticos diferentes.
 */
const DESFECHOS: Array<{ valor: string; rotulo: string; descricao: string; recusa: boolean }> = [
  {
    valor: 'troca',
    rotulo: 'Trocar o produto',
    descricao: 'o cliente levou outra peça no lugar',
    recusa: false
  },
  {
    valor: 'conserto',
    rotulo: 'Consertar',
    descricao: 'a peça foi arrumada e devolvida',
    recusa: false
  },
  {
    valor: 'devolucao',
    rotulo: 'Devolver o dinheiro',
    descricao: 'registre a devolução na tela de Vendas para o dinheiro sair do caixa',
    recusa: false
  },
  {
    valor: 'sem_defeito',
    rotulo: 'Não tinha defeito',
    descricao: 'a peça foi testada e está boa',
    recusa: true
  },
  {
    valor: 'fora_do_prazo',
    rotulo: 'Recusar por prazo',
    descricao: 'a garantia já tinha vencido',
    recusa: true
  }
]

type Aba = 'consultar' | 'atendimentos'
type FiltroSituacao = 'aberta' | 'resolvida' | 'recusada' | 'todas'

const Numero: FC<{ rotulo: string; valor: number; alerta?: boolean }> = ({
  rotulo,
  valor,
  alerta
}) => (
  <div className={`rounded-lg px-3 py-2.5 ${alerta && valor > 0 ? 'bg-warn-soft' : 'bg-muted/60'}`}>
    <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    <p className="num mt-0.5 text-[19px] font-bold leading-tight">{valor}</p>
  </div>
)

const Garantias: FC = () => {
  const { ehDono } = useSessao()
  const ehCelular = useEhCelular()
  const { showToast } = useToast()

  const [aba, setAba] = useState<Aba>('consultar')
  const [resumo, setResumo] = useState<ResumoGarantias | null>(null)

  // ── Consulta ──
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<ItemComGarantia[] | null>(null)
  const [buscando, setBuscando] = useState(false)

  // ── Atendimentos ──
  const [filtro, setFiltro] = useState<FiltroSituacao>('aberta')
  const [lista, setLista] = useState<Garantia[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)

  // ── Diálogos ──
  const [abrindo, setAbrindo] = useState<ItemComGarantia | null>(null)
  const [defeito, setDefeito] = useState('')
  const [obsAbertura, setObsAbertura] = useState('')
  const [fechando, setFechando] = useState<Garantia | null>(null)
  const [desfecho, setDesfecho] = useState('')
  const [obsFechamento, setObsFechamento] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregarResumo = useCallback(() => {
    void window.api.garantias.resumo().then((r) => {
      if (r.success) setResumo(r.data)
    })
  }, [])

  const carregarLista = useCallback(() => {
    setCarregandoLista(true)
    window.api.garantias
      .listar(filtro === 'todas' ? undefined : filtro)
      .then((r) => {
        if (r.success) setLista(r.data)
      })
      .finally(() => setCarregandoLista(false))
  }, [filtro])

  useEffect(() => {
    carregarResumo()
  }, [carregarResumo])

  useEffect(() => {
    carregarLista()
  }, [carregarLista])

  /*
   * A busca é por botão e por Enter, e NÃO a cada tecla digitada. Ela varre
   * itens de venda com cinco condições e um subselect; disparar a cada letra
   * faria a tela travar numa loja com histórico, justamente onde ela importa.
   */
  const buscar = async () => {
    const t = termo.trim()
    if (!t) {
      setAchados(null)
      return
    }
    setBuscando(true)
    try {
      const r = await window.api.garantias.buscarItens(t)
      setAchados(r.success ? r.data : [])
      if (!r.success) showToast({ message: r.error, variant: 'destructive' })
    } finally {
      setBuscando(false)
    }
  }

  const abrirDialogo = (item: ItemComGarantia) => {
    setAbrindo(item)
    setDefeito('')
    setObsAbertura('')
    setErro('')
  }

  const confirmarAbertura = async () => {
    if (!abrindo) return
    setOcupado(true)
    setErro('')
    try {
      const r = await window.api.garantias.abrir({
        item_venda_id: abrindo.item_venda_id,
        defeito,
        observacao: obsAbertura
      })
      if (!r.success) {
        // ⚠️ O erro NÃO fecha a caixa: fechar apagaria o que foi digitado.
        setErro(r.error)
        return
      }
      showToast({
        message: r.data.dentro_do_prazo
          ? 'Atendimento aberto, dentro da garantia.'
          : 'Atendimento aberto, mas FORA do prazo de garantia.',
        variant: r.data.dentro_do_prazo ? 'success' : 'destructive'
      })
      setAbrindo(null)
      carregarResumo()
      carregarLista()
      void buscar()
    } finally {
      setOcupado(false)
    }
  }

  const abrirFechamento = (g: Garantia) => {
    setFechando(g)
    // Fora do prazo já chega com a recusa por prazo sugerida: é o desfecho mais
    // provável, e ele continua trocável em um clique.
    setDesfecho(g.dentro_do_prazo ? '' : 'fora_do_prazo')
    setObsFechamento('')
    setErro('')
  }

  const confirmarFechamento = async () => {
    if (!fechando || !desfecho) return
    setOcupado(true)
    setErro('')
    try {
      const r = await window.api.garantias.fechar(fechando.id, desfecho, obsFechamento)
      if (!r.success) {
        setErro(r.error)
        return
      }
      showToast({ message: 'Atendimento encerrado.', variant: 'success' })
      setFechando(null)
      carregarResumo()
      carregarLista()
    } finally {
      setOcupado(false)
    }
  }

  const reabrir = async (g: Garantia) => {
    const r = await window.api.garantias.reabrir(g.id)
    if (!r.success) {
      showToast({ message: r.error, variant: 'destructive' })
      return
    }
    showToast({ message: 'Atendimento reaberto.', variant: 'success' })
    carregarResumo()
    carregarLista()
  }

  const BotaoAba: FC<{ valor: Aba; children: React.ReactNode }> = ({ valor, children }) => (
    <button
      type="button"
      onClick={() => setAba(valor)}
      aria-pressed={aba === valor}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        aba === valor
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="entrada-escalonada p-4 lg:p-8">
      <div className="mb-4 hidden lg:block">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Garantias
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Até quando a loja responde pelo que vendeu, e o que ainda está por resolver.
        </p>
      </div>

      {/* Os quatro números do topo. */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        <Numero rotulo="Em aberto" valor={resumo?.abertas ?? 0} />
        <Numero rotulo="Fora do prazo" valor={resumo?.fora_do_prazo_abertas ?? 0} alerta />
        <Numero rotulo="Resolvidas (30 dias)" valor={resumo?.resolvidas_30d ?? 0} />
        <Numero rotulo="Recusadas (30 dias)" valor={resumo?.recusadas_30d ?? 0} />
      </div>

      <div className="mb-4 flex gap-2">
        <BotaoAba valor="consultar">Consultar garantia</BotaoAba>
        <BotaoAba valor="atendimentos">Atendimentos</BotaoAba>
      </div>

      {aba === 'consultar' && (
        <>
          <div className="mb-3 flex items-center gap-2 lg:mb-4 lg:max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void buscar()
                }}
                placeholder={ehCelular ? '' : 'Número da venda, cliente, telefone, produto ou código'}
                aria-label="Número da venda, cliente, telefone, produto ou código"
                className="pl-9"
              />
              {ehCelular && termo === '' && (
                <DicaRolante texto="Venda, cliente, telefone, produto ou código" />
              )}
            </div>
            <Button onClick={() => void buscar()} disabled={buscando || !termo.trim()}>
              {buscando ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>

          {achados === null ? (
            <div className="rounded-xl border bg-card">
              <EstadoVazio
                icone={<ShieldCheck className="h-9 w-9" />}
                dica="Bipe o código da peça, digite o número da venda do cupom ou o nome do cliente."
              >
                Procure a compra para saber se ela ainda está na garantia.
              </EstadoVazio>
            </div>
          ) : achados.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EstadoVazio
                icone={<Search className="h-9 w-9" />}
                dica="Confira o número da venda ou tente pelo nome do cliente."
              >
                Nenhuma compra encontrada com isso.
              </EstadoVazio>
            </div>
          ) : (
            <ul className="space-y-2">
              {achados.map((item) => {
                const s = situacaoDoItem(item)
                return (
                  <li key={item.item_venda_id} className="rounded-xl border bg-card p-3 lg:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold" title={item.produto_nome}>
                          {item.produto_nome}
                          {item.tamanho ? ` (${item.tamanho})` : ''}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          Venda #{item.venda_id} · {dataCurta(item.data_venda)} ·{' '}
                          {item.quantidade} un · {fmt(item.preco_unitario)}
                        </p>
                        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                          {item.cliente_nome ?? 'Sem cliente no cadastro'}
                          {item.cliente_telefone ? ` · ${item.cliente_telefone}` : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${s.cor}`}
                      >
                        {s.texto}
                      </span>
                    </div>

                    <p className="mt-2 text-[12.5px] text-muted-foreground">{s.detalhe}</p>

                    {/*
                      ⚠️ Venda anterior a este módulo não tem prazo congelado. A
                      tela avisa em vez de afirmar uma data que ninguém prometeu.
                    */}
                    {item.prazo_estimado && !item.venda_cancelada && item.garantia_dias > 0 && (
                      <p className="mt-1 flex items-start gap-1.5 text-[12px] text-warn">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          Esta compra é anterior ao controle de garantias. O prazo acima é o padrão
                          de hoje, não o que foi prometido na época.
                        </span>
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={s.texto === 'Na garantia' ? 'default' : 'outline'}
                        onClick={() => abrirDialogo(item)}
                        disabled={!!item.venda_cancelada}
                      >
                        <Wrench className="mr-1.5 h-3.5 w-3.5" /> Abrir atendimento
                      </Button>
                      {item.atendimentos > 0 && (
                        <span className="text-[12px] text-muted-foreground">
                          {item.atendimentos} atendimento(s) já registrado(s) nesta peça
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {aba === 'atendimentos' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['aberta', 'resolvida', 'recusada', 'todas'] as FiltroSituacao[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  filtro === f
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f === 'aberta'
                  ? 'Em aberto'
                  : f === 'resolvida'
                    ? 'Resolvidas'
                    : f === 'recusada'
                      ? 'Recusadas'
                      : 'Todas'}
              </button>
            ))}
          </div>

          {carregandoLista ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : lista.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EstadoVazio
                icone={<ShieldCheck className="h-9 w-9" />}
                dica="Um atendimento nasce na aba Consultar garantia, depois de achar a compra."
              >
                Nenhum atendimento nesta situação.
              </EstadoVazio>
            </div>
          ) : (
            <ul className="space-y-2">
              {lista.map((g) => (
                <li key={g.id} className="rounded-xl border bg-card p-3 lg:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" title={g.produto_nome}>
                        {g.produto_nome}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        Venda #{g.venda_id} de {dataCurta(g.data_venda)} ·{' '}
                        {g.cliente_nome ?? 'Sem cliente no cadastro'}
                        {g.cliente_telefone ? ` · ${g.cliente_telefone}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {!g.dentro_do_prazo && (
                        <span className="rounded-md bg-warn-soft px-2 py-1 text-xs font-semibold text-warn">
                          Fora do prazo
                        </span>
                      )}
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          g.situacao === 'aberta'
                            ? 'bg-primary/10 text-primary'
                            : g.situacao === 'resolvida'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-critical-soft text-critical'
                        }`}
                      >
                        {g.situacao === 'aberta'
                          ? 'Em aberto'
                          : (ROTULO_DESFECHO[g.desfecho ?? ''] ?? 'Encerrado')}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Problema: </span>
                    {g.defeito}
                  </p>
                  {g.observacao && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{g.observacao}</p>
                  )}

                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Aberto em {dataHora(g.aberta_em)}
                      {g.aberta_por_nome ? ` por ${g.aberta_por_nome}` : ''}
                    </span>
                    {g.fechada_em && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Encerrado em {dataHora(g.fechada_em)}
                        {g.fechada_por_nome ? ` por ${g.fechada_por_nome}` : ''}
                      </span>
                    )}
                  </p>

                  {/*
                    ⚠️ Encerrar é do dono: é onde a loja assume o custo de uma
                    troca. O canal cobra isso por conta própria — esconder o
                    botão é só para o vendedor não bater numa recusa.
                  */}
                  {ehDono && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {g.situacao === 'aberta' ? (
                        <Button size="sm" onClick={() => abrirFechamento(g)}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Encerrar atendimento
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void reabrir(g)}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reabrir
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Abrir atendimento ─────────────────────────────────────────────── */}
      <Dialog open={!!abrindo} onOpenChange={(v) => !v && setAbrindo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrir atendimento de garantia</DialogTitle>
          </DialogHeader>

          {abrindo && (
            <>
              <div className="rounded-lg bg-muted/60 px-3 py-2.5">
                <p className="font-medium">
                  {abrindo.produto_nome}
                  {abrindo.tamanho ? ` (${abrindo.tamanho})` : ''}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Venda #{abrindo.venda_id} de {dataCurta(abrindo.data_venda)} ·{' '}
                  {abrindo.cliente_nome ?? 'sem cliente no cadastro'}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {situacaoDoItem(abrindo).detalhe}
                </p>
              </div>

              {/*
                ⚠️ O aviso não impede nada. Ele existe para o lojista saber o que
                está decidindo antes de decidir, e a decisão continua dele.
              */}
              {(abrindo.dias_restantes == null || abrindo.dias_restantes < 0) && (
                <p className="flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta peça está fora da garantia. O atendimento abre assim mesmo, marcado como
                    fora do prazo, e você decide no fim se a loja cobre ou não.
                  </span>
                </p>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="defeito">Problema apresentado</Label>
                <textarea
                  id="defeito"
                  rows={3}
                  value={defeito}
                  onChange={(e) => setDefeito(e.target.value)}
                  placeholder="O que o cliente relatou. Ex.: não liga depois de duas semanas de uso."
                  className={CLASSE_TEXTAREA}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="obs-abertura">Observação (opcional)</Label>
                <textarea
                  id="obs-abertura"
                  rows={2}
                  value={obsAbertura}
                  onChange={(e) => setObsAbertura(e.target.value)}
                  placeholder="Ex.: cliente trouxe a caixa e a nota."
                  className={CLASSE_TEXTAREA}
                />
              </div>
            </>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrindo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarAbertura()} disabled={ocupado || !defeito.trim()}>
              {ocupado ? 'Abrindo...' : 'Abrir atendimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Encerrar atendimento ──────────────────────────────────────────── */}
      <Dialog open={!!fechando} onOpenChange={(v) => !v && setFechando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Encerrar atendimento</DialogTitle>
          </DialogHeader>

          {fechando && (
            <>
              <div className="rounded-lg bg-muted/60 px-3 py-2.5">
                <p className="font-medium">{fechando.produto_nome}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{fechando.defeito}</p>
              </div>

              <div className="grid gap-1.5">
                <Label>O que foi feito</Label>
                {/*
                  ⚠️ Botões, e não uma lista suspensa: os cinco desfechos cabem
                  na tela e cada um precisa da frase que explica o que significa.
                  Uma lista esconderia as frases justamente na hora de escolher.
                */}
                <div className="grid gap-1.5">
                  {DESFECHOS.map((d) => (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => setDesfecho(d.valor)}
                      aria-pressed={desfecho === d.valor}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        desfecho === d.valor
                          ? d.recusa
                            ? 'border-critical bg-critical-soft'
                            : 'border-emerald-600/60 bg-emerald-500/10'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      {/*
                        ⚠️ A cor é a informação, não o enfeite: verde para o que a
                        loja ASSUMIU, vermelho para o que ela RECUSOU. É a mesma
                        divisão que separa "problema de produto" de "problema de
                        expectativa" no relatório, e aqui ela aparece antes de o
                        lojista clicar, não depois.
                      */}
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {d.recusa ? (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-critical" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                        {d.rotulo}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {d.descricao}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/*
                ⚠️ O recado mais importante desta tela. Sem ele, o lojista marca
                "devolver o dinheiro" e sai achando que o caixa já foi baixado.
              */}
              {(desfecho === 'devolucao' || desfecho === 'troca') && (
                <p className="flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {desfecho === 'devolucao' ? (
                    <span>
                      Isto registra a decisão, mas não move dinheiro nenhum. Para o valor sair do
                      caixa e a peça voltar ao estoque, faça a <strong>devolução</strong> na tela
                      de <strong>Vendas</strong>.
                    </span>
                  ) : (
                    <span>
                      Isto registra a decisão, mas não mexe no estoque. Faça a{' '}
                      <strong>devolução</strong> desta venda na tela de <strong>Vendas</strong>,
                      deixando <strong>desmarcado</strong> “devolver ao estoque” (a peça com
                      defeito não volta a ser vendida), e passe a peça nova numa venda usando o
                      crédito gerado. Assim o estoque fecha certo dos dois lados.
                    </span>
                  )}
                </p>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="obs-fechamento">Observação (opcional)</Label>
                <textarea
                  id="obs-fechamento"
                  rows={2}
                  value={obsFechamento}
                  onChange={(e) => setObsFechamento(e.target.value)}
                  placeholder="Ex.: trocado pela mesma peça, número de série novo anotado."
                  className={CLASSE_TEXTAREA}
                />
              </div>
            </>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFechando(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarFechamento()} disabled={ocupado || !desfecho}>
              {ocupado ? 'Encerrando...' : 'Encerrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Garantias

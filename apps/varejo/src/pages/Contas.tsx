import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Landmark,
  Plus,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Power,
  ScrollText,
  ArrowLeftRight
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { useToast } from '@fhvptech/core/ui/toast'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import { MenuAcoes, type AcaoMenu } from '@fhvptech/core/ui/MenuAcoes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { IMaskInput } from 'react-imask'
import { useEhCelular } from '@/hooks/useEhCelular'
import { CLASSE_AGENCIA, CLASSE_CONTA, CLASSE_DINHEIRO, paraMascara, paraNumero } from '@/utils/mascaras'

/**
 * Contas do dinheiro, e o extrato de cada uma.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Uma aba de contas bancárias no financeiro, onde eu cadastro os bancos em que
 * recebo e tiro dinheiro, e toda movimentação diz de qual conta saiu ou entrou."
 *
 * ── ⚠️ O saldo aqui não é digitado, é somado ────────────────────────────────
 * O que se cadastra é o saldo INICIAL: quanto havia na conta no dia em que o
 * sistema começou a contar. Dali em diante o saldo é a soma dos movimentos, e é
 * por isso que ele não pode ser "corrigido" na mão — corrigir o saldo
 * esconderia o lançamento que está faltando, que é justamente o que se quer
 * enxergar. Para acertar, lança-se um ajuste, e ele aparece no extrato.
 */

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const FORMAS = [
  { valor: '', rotulo: 'Nenhuma em especial' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'debito', rotulo: 'Cartão de débito' },
  { valor: 'credito', rotulo: 'Cartão de crédito' }
]

const TIPOS = [
  { valor: 'caixa', rotulo: 'Caixa (dinheiro na loja)' },
  { valor: 'banco', rotulo: 'Banco' }
]

const FORM_VAZIO = {
  nome: '',
  tipo: 'banco',
  banco: '',
  agencia: '',
  conta: '',
  saldo_inicial: '',
  forma_padrao: '',
  padrao_recebimento: false,
  padrao_pagamento: false
}

const Contas: FC = () => {
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([])
  const [carregando, setCarregando] = useState(true)

  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<ContaFinanceira | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  /*
   * Transferência entre contas da loja.
   *
   * ⚠️ É movimento INTERNO: não entra como receita nem como despesa no resumo
   * do mês. Ver a migration 055 — contada como entrada, o mês apareceria
   * faturando o que só mudou de bolso.
   */
  const [transfAberta, setTransfAberta] = useState(false)
  const [transfOrigem, setTransfOrigem] = useState('')
  const [transfDestino, setTransfDestino] = useState('')
  const [transfValor, setTransfValor] = useState('')
  const [transfObs, setTransfObs] = useState('')
  const [transferindo, setTransferindo] = useState(false)

  const [lancamentoAberto, setLancamentoAberto] = useState(false)
  const [lancValor, setLancValor] = useState('')
  const [lancDescricao, setLancDescricao] = useState('')
  const [lancSaida, setLancSaida] = useState(false)

  const confirmar = useConfirm()
  const { showToast } = useToast()
  const ehCelular = useEhCelular()

  /*
   * Só contas ATIVAS podem transferir.
   *
   * ⚠️ Esta tela lista também as desativadas (é onde o lojista as reativa), mas
   * conta fora de circulação não recebe nem envia: o banco recusa, e oferecer
   * aqui faria o lojista descobrir a regra levando um erro.
   */
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativa), [contas])

  const abrirTransferencia = (): void => {
    // A conta aberta na tela entra como origem: é de onde o lojista está
    // olhando o dinheiro sair. O destino ele escolhe.
    setTransfOrigem(selecionada ? String(selecionada) : '')
    setTransfDestino('')
    setTransfValor('')
    setTransfObs('')
    setErro('')
    setTransfAberta(true)
  }

  const transferir = async (): Promise<void> => {
    const valor = paraNumero(transfValor)
    if (!transfOrigem || !transfDestino) {
      setErro('Escolha a conta de origem e a de destino.')
      return
    }
    if (transfOrigem === transfDestino) {
      setErro('Escolha duas contas diferentes.')
      return
    }
    if (!valor || valor <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }
    setTransferindo(true)
    setErro('')
    const r = await window.api.financeiro.transferir({
      conta_origem_id: Number(transfOrigem),
      conta_destino_id: Number(transfDestino),
      valor,
      observacao: transfObs.trim() || null
    })
    setTransferindo(false)
    if (!r.success) {
      setErro(r.error)
      return
    }
    setTransfAberta(false)
    showToast({ message: 'Transferência registrada.', variant: 'success' })
    await carregar()
    await carregarExtrato(selecionada)
  }

  const carregar = useCallback(async () => {
    const r = await window.api.financeiro.listarContas(true)
    if (r.success) {
      const lista = r.data as ContaFinanceira[]
      setContas(lista)
      setSelecionada((atual) => atual ?? lista.find((c) => c.ativa === 1)?.id ?? null)
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const carregarExtrato = useCallback(async (contaId: number | null) => {
    if (!contaId) {
      setMovimentos([])
      return
    }
    const r = await window.api.financeiro.extrato({ conta_id: contaId, limite: 200 })
    if (r.success) setMovimentos(r.data as MovimentoFinanceiro[])
  }, [])

  useEffect(() => {
    void carregarExtrato(selecionada)
  }, [selecionada, carregarExtrato])

  const total = useMemo(
    () => contas.filter((c) => c.ativa === 1).reduce((s, c) => s + c.saldo, 0),
    [contas]
  )

  const abrirNova = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (c: ContaFinanceira) => {
    setEditando(c)
    setForm({
      nome: c.nome,
      tipo: c.tipo === 'a_receber' ? 'banco' : c.tipo,
      banco: c.banco ?? '',
      agencia: c.agencia ?? '',
      conta: c.conta ?? '',
      saldo_inicial: paraMascara(c.saldo_inicial),
      forma_padrao: c.forma_padrao ?? '',
      padrao_recebimento: c.padrao_recebimento === 1,
      padrao_pagamento: c.padrao_pagamento === 1
    })
    setErro('')
    setDialogAberto(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Dê um nome à conta.')
      return
    }
    setSalvando(true)
    const dados = { ...form, saldo_inicial: paraNumero(form.saldo_inicial) }
    const r = editando
      ? await window.api.financeiro.atualizarConta(editando.id, dados)
      : await window.api.financeiro.criarConta(dados)
    if (r.success) {
      await carregar()
      setDialogAberto(false)
    } else {
      setErro(r.error)
    }
    setSalvando(false)
  }

  const alternarAtiva = async (c: ContaFinanceira) => {
    if (c.ativa === 1) {
      const ok = await confirmar({
        titulo: 'Desativar conta',
        mensagem:
          `"${c.nome}" some das escolhas novas, mas continua no histórico — o extrato ` +
          'dos meses passados não muda. Confirma?'
      })
      if (!ok) return
      const r = await window.api.financeiro.desativarConta(c.id)
      if (!r.success) {
        showToast({ message: r.error, variant: 'destructive' })
        return
      }
    } else {
      await window.api.financeiro.reativarConta(c.id)
    }
    await carregar()
  }

  const lancar = async () => {
    if (!selecionada) return
    const valor = paraNumero(lancValor)
    if (valor <= 0) {
      showToast({ message: 'Informe um valor maior que zero.', variant: 'destructive' })
      return
    }
    const r = await window.api.financeiro.lancar(
      selecionada,
      lancSaida ? -valor : valor,
      'ajuste',
      lancDescricao
    )
    if (r.success) {
      setLancamentoAberto(false)
      setLancValor('')
      setLancDescricao('')
      await carregar()
      await carregarExtrato(selecionada)
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  const contaAtual = contas.find((c) => c.id === selecionada) ?? null

  return (
    <div className="entrada-escalonada p-4 lg:p-8">
      <div className="hidden lg:flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Contas
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Onde o dinheiro da loja fica. Toda venda recebida e toda conta paga entra ou sai
            de uma destas.
          </p>
        </div>
        <Button onClick={abrirNova}>
          <Plus className="w-4 h-4 mr-2" />
          Nova conta
        </Button>
      </div>

      {/* Total consolidado */}
      <div className="mb-3 lg:mb-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Saldo somado das contas ativas</p>
          <p className="num text-xl lg:text-2xl font-bold">{fmt(total)}</p>
        </div>
        <Button onClick={abrirNova} className="lg:hidden h-11 w-11 shrink-0 p-0" aria-label="Nova conta">
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {/* Contas */}
      {carregando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : contas.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EstadoVazio icone={<Landmark className="w-9 h-9" />} dica="Cadastre o caixa da loja e os bancos onde você recebe.">
            Nenhuma conta cadastrada.
          </EstadoVazio>
        </div>
      ) : (
        <div className="space-y-5">
          {/*
            ⚠️ Duas seções, e não uma lista só. Pedido dele: "o caixa da loja não
            deve ser uma conta, deve ser algo à parte".

            Por dentro ele CONTINUA sendo uma conta, e precisa ser — o livro tem
            uma tabela de movimentos só, e todo dinheiro cai nela. Inventar um
            segundo lugar para a gaveta daria duas verdades sobre quanto a loja
            tem. O que muda é o que se vê: onde o dinheiro MORA (banco) e por
            onde ele PASSA (gaveta) são coisas diferentes para quem opera.
          */}
          {([
            ['caixa', 'Caixas da loja', 'Gavetas de dinheiro. Abrem e fecham turno.'],
            ['banco', 'Contas bancárias', 'Onde o dinheiro fica guardado.']
          ] as const).map(([grupo, titulo, ajuda]) => {
            const doGrupo = contas.filter((c) =>
              grupo === 'caixa' ? c.tipo === 'caixa' : c.tipo !== 'caixa'
            )
            if (doGrupo.length === 0) return null
            return (
              <section key={grupo}>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.10em] text-muted-foreground">
                  {titulo}
                </h3>
                <p className="mb-2 text-[11.5px] text-muted-foreground">{ajuda}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {doGrupo.map((c) => {
            const acoes: AcaoMenu[] = [
              { rotulo: 'Editar', icone: <Pencil className="w-4 h-4" />, onSelecionar: () => abrirEdicao(c) },
              {
                rotulo: c.ativa === 1 ? 'Desativar' : 'Reativar',
                icone: <Power className="w-4 h-4" />,
                destrutiva: c.ativa === 1,
                onSelecionar: () => void alternarAtiva(c)
              }
            ]
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelecionada(c.id)}
                className={`rounded-xl border bg-card p-3 text-left transition-colors ${
                  selecionada === c.id ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted/30'
                } ${c.ativa === 0 ? 'opacity-55' : ''}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[14.5px] font-semibold">
                      {c.tipo === 'caixa' ? (
                        <Wallet className="w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Landmark className="w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                      {c.nome}
                    </p>
                    <p className="num mt-0.5 text-lg font-bold">{fmt(c.saldo)}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {[
                        c.ativa === 0 ? 'desativada' : null,
                        c.forma_padrao ? `recebe ${c.forma_padrao}` : null,
                        c.padrao_recebimento === 1 ? 'padrão de entrada' : null,
                        c.padrao_pagamento === 1 ? 'padrão de saída' : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'sem padrão definido'}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    <MenuAcoes rotulo={`Ações de ${c.nome}`} acoes={acoes} />
                  </span>
                </div>
              </button>
            )
          })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Extrato */}
      {contaAtual && (
        <div className="mt-5 lg:mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base lg:text-lg font-semibold">
              <ScrollText className="w-4 h-4 text-muted-foreground" />
              Extrato de {contaAtual.nome}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                Transferir fica ao lado do extrato da conta aberta, e não no topo
                da tela: é daqui que o lojista olha o saldo e decide mover.
              */}
              <Button
                variant="outline"
                size="sm"
                className="h-11 lg:h-9"
                onClick={abrirTransferencia}
              >
                <ArrowLeftRight className="w-4 h-4 mr-1.5" aria-hidden />
                Transferir
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 lg:h-9"
                onClick={() => {
                  setLancSaida(false)
                  setLancValor('')
                  setLancDescricao('')
                  setLancamentoAberto(true)
                }}
              >
                Lançar ajuste
              </Button>
            </div>
          </div>

          {movimentos.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EstadoVazio
                icone={<ScrollText className="w-9 h-9" />}
                dica="O livro começa a contar a partir de agora — vendas e contas pagas aparecem aqui."
              >
                Nenhum movimento nesta conta ainda.
              </EstadoVazio>
            </div>
          ) : (
            /*
              ⚠️ A lista vem do mais antigo para o mais novo, e não ao contrário:
              o saldo corrente só faz sentido lido de cima para baixo. Invertida,
              cada linha mostraria um saldo que não bate com a de cima.
            */
            <ul className="rounded-xl border bg-card divide-y">
              {movimentos.map((m) => (
                <li key={m.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        m.valor >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                      aria-hidden
                    >
                      {m.valor >= 0 ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium leading-tight">
                        {m.descricao || m.tipo}
                      </p>
                      <p className="num mt-0.5 truncate text-[12px] text-muted-foreground">
                        {fmtDataHora(m.data)}
                        {m.forma_pagamento ? ` · ${m.forma_pagamento}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`num text-[14px] font-semibold ${
                          m.valor >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {m.valor >= 0 ? '+' : '−'} {fmt(Math.abs(m.valor))}
                      </p>
                      {!ehCelular && (
                        <p className="num text-[11.5px] text-muted-foreground">
                          saldo {fmt(m.saldo_corrente)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Diálogo: conta ── */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar conta' : 'Nova conta'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid gap-1.5">
              <Label htmlFor="conta-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="conta-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Caixa da loja, Banco do Brasil…"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0 [&>*>*]:min-w-0">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onChange={(v) => setForm({ ...form, tipo: v })}
                  opcoes={TIPOS}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="conta-saldo">Saldo inicial</Label>
                <IMaskInput
                  id="conta-saldo"
                  {...CLASSE_DINHEIRO}
                  value={form.saldo_inicial}
                  onAccept={(v: string) => setForm({ ...form, saldo_inicial: v })}
                />
              </div>
            </div>

            {/*
              ⚠️ O saldo inicial é quanto havia na conta no dia em que o sistema
              começou a contar. Ele não é o saldo de hoje e não deve ser mexido
              para "acertar" o número: corrigir aqui esconde o lançamento que
              está faltando. Para acertar, lance um ajuste — ele aparece no
              extrato e explica a diferença.
            */}
            <p className="-mt-1 text-[11.5px] text-muted-foreground">
              Quanto havia nesta conta quando o sistema começou a contar. Dali em diante o saldo
              é somado sozinho. Para acertar depois, lance um ajuste no extrato.
            </p>

            <div className="grid gap-1.5">
              <Label>Recebe qual forma de pagamento?</Label>
              <Select
                value={form.forma_padrao}
                onChange={(v) => setForm({ ...form, forma_padrao: v })}
                opcoes={FORMAS}
              />
              <p className="text-[11.5px] text-muted-foreground">
                Venda paga nesta forma cai aqui sozinha. É o que evita escolher a conta a cada
                venda.
              </p>
            </div>

            {form.tipo === 'banco' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0 [&>*>*]:min-w-0">
                <div className="grid gap-1.5">
                  <Label htmlFor="conta-banco">Banco</Label>
                  <Input
                    id="conta-banco"
                    value={form.banco}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="conta-ag">Agência</Label>
                  <IMaskInput
                    id="conta-ag"
                    {...CLASSE_AGENCIA}
                    value={form.agencia}
                    onAccept={(v: string) => setForm({ ...form, agencia: v })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="conta-num">Conta</Label>
                  <IMaskInput
                    id="conta-num"
                    {...CLASSE_CONTA}
                    value={form.conta}
                    onAccept={(v: string) => setForm({ ...form, conta: v })}
                  />
                </div>
              </div>
            )}

            {/*
              ⚠️ Os rótulos antigos ("conta padrão para o que ENTRA") eram jargão e
              ele disse que não entendia. O que eles significam é uma coisa só:
              PARA ONDE VAI o dinheiro quando o sistema não tem como saber.

              Isso é raro de propósito. Venda já vai pela forma de pagamento
              (dinheiro na gaveta, PIX no banco) e despesa passa a perguntar. Sobra
              o caso sem pista: receber uma dívida antiga cuja forma ninguém
              registrou. Sem um destino combinado, esse dinheiro não teria onde
              cair — e ficar de fora do livro é o único desfecho inaceitável.
            */}
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-[12px] font-medium">Quando o sistema não souber a conta</p>
              <p className="text-[11.5px] text-muted-foreground">
                Acontece pouco: venda já vai pela forma de pagamento e despesa pergunta. Sobra
                o recebimento antigo, sem forma registrada.
              </p>
              {(
                [
                  ['padrao_recebimento', 'Usar esta conta para dinheiro que ENTRA'],
                  ['padrao_pagamento', 'Usar esta conta para dinheiro que SAI']
                ] as const
              ).map(([campo, rotulo]) => (
                <label
                  key={campo}
                  className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm lg:min-h-0"
                >
                  <input
                    type="checkbox"
                    className="accent-blue-600 h-4 w-4"
                    checked={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.checked })}
                  />
                  {rotulo}
                </label>
              ))}
            </div>

            {erro && (
              <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: transferência entre contas ── */}
      <Dialog open={transfAberta} onOpenChange={setTransfAberta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transferir entre contas</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid gap-1.5">
              <Label htmlFor="transf-origem">Sai de</Label>
              <Select
                id="transf-origem"
                value={transfOrigem}
                onChange={setTransfOrigem}
                opcoes={[
                  { valor: '', rotulo: 'Escolha a conta' },
                  ...contasAtivas.map((c) => ({
                    valor: String(c.id),
                    rotulo: `${c.nome} · ${fmt(c.saldo)}`
                  }))
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="transf-destino">Entra em</Label>
              {/*
                ⚠️ A conta de origem sai da lista de destino. O banco recusa as
                duas iguais de qualquer jeito, mas oferecer a opção e depois
                recusar é fazer o lojista descobrir a regra errando.
              */}
              <Select
                id="transf-destino"
                value={transfDestino}
                onChange={setTransfDestino}
                opcoes={[
                  { valor: '', rotulo: 'Escolha a conta' },
                  ...contasAtivas
                    .filter((c) => String(c.id) !== transfOrigem)
                    .map((c) => ({ valor: String(c.id), rotulo: c.nome }))
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="transf-valor">Valor</Label>
              <IMaskInput
                id="transf-valor"
                {...CLASSE_DINHEIRO}
                value={transfValor}
                onAccept={(v: string) => setTransfValor(v)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="transf-obs">Observação</Label>
              <Input
                id="transf-obs"
                value={transfObs}
                onChange={(e) => setTransfObs(e.target.value)}
                placeholder="Depósito do caixa, acerto entre bancos…"
              />
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Transferência não conta como venda nem como despesa: é o mesmo dinheiro mudando
              de conta. Se sair do caixa, o valor baixa do esperado no fechamento.
            </p>
            {erro && (
              <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransfAberta(false)}>
              Cancelar
            </Button>
            <Button onClick={transferir} disabled={transferindo}>
              {transferindo ? 'Transferindo…' : 'Transferir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: ajuste ── */}
      <Dialog open={lancamentoAberto} onOpenChange={setLancamentoAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lançar ajuste em {contaAtual?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [false, 'Entrou'],
                  [true, 'Saiu']
                ] as const
              ).map(([saida, rotulo]) => (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => setLancSaida(saida)}
                  className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                    lancSaida === saida
                      ? saida
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lanc-valor">Valor</Label>
              <IMaskInput
                id="lanc-valor"
                {...CLASSE_DINHEIRO}
                value={lancValor}
                onAccept={(v: string) => setLancValor(v)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lanc-desc">Motivo</Label>
              <Input
                id="lanc-desc"
                value={lancDescricao}
                onChange={(e) => setLancDescricao(e.target.value)}
                placeholder="Aporte do dono, acerto de conferência…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLancamentoAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={lancar}>Lançar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Contas

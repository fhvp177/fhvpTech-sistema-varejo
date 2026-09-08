import { FC, useCallback, useEffect, useState } from 'react'
import {
  PackageCheck,
  Truck,
  Store,
  MessageCircle,
  Printer,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import { MenuAcoes, type AcaoMenu } from '@fhvptech/core/ui/MenuAcoes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { FORMAS_A_VISTA } from '@/utils/formaPagamento'
import { linkWhatsApp, mensagemPedidoSeparado } from '@/utils/whatsapp'
import { obterDadosLoja } from '@/utils/dadosLoja'
import { gerarHtmlComprovanteEntrega } from '@/utils/relatorioFinanceiro'
import { useImprimir } from '@/components/ImpressaoProvider'
import { useCaixaDoAparelho } from '@/hooks/useCaixaDoAparelho'
import { nomeImpressao } from '@/utils/nomeImpressao'

/**
 * Pedidos separados: a mercadoria já saiu da prateleira, o dinheiro ainda não.
 *
 * ── O que esta tela responde ────────────────────────────────────────────────
 * "O que está fora da loja agora, com quem, e desde quando." É a lista que o
 * lojista olha no fim do dia para saber o que ainda não virou dinheiro.
 *
 * ── ⚠️ O pedido não é uma venda pela metade ─────────────────────────────────
 * Nada aqui entra no faturamento, na comissão ou na nota. Isso só acontece no
 * momento em que o cliente paga, e é aí que o pedido vira venda de verdade.
 */

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const Pedidos: FC = () => {
  const [pedidos, setPedidos] = useState<PedidoSeparado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [nomeLoja, setNomeLoja] = useState('loja')

  const [receber, setReceber] = useState<PedidoSeparado | null>(null)
  const [forma, setForma] = useState('dinheiro')
  const [ocupado, setOcupado] = useState(false)

  const { showToast } = useToast()
  const confirmar = useConfirm()
  const imprimirDoc = useImprimir()
  const { caixaId } = useCaixaDoAparelho()

  const carregar = useCallback(async () => {
    const r = await window.api.pedidos.listar('separado')
    if (r.success) setPedidos(r.data as PedidoSeparado[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
    void obterDadosLoja().then((l) => setNomeLoja(l?.nome || 'loja'))
  }, [carregar])

  const concluir = async () => {
    if (!receber) return
    setOcupado(true)
    const r = await window.api.pedidos.concluir(receber.id, {
      status_pagamento: 'pago',
      forma_pagamento: forma,
      // ⚠️ Receber é uma venda: cai no caixa deste aparelho e exige turno aberto,
      // como qualquer outra. Sem isso o dinheiro entraria fora da conferência.
      caixa_id: caixaId
    })
    if (r.success) {
      showToast({ message: `Pedido #${receber.id} virou venda.`, variant: 'success' })
      setReceber(null)
      await carregar()
    } else {
      showToast({
        message:
          r.error === 'CAIXA_FECHADO'
            ? 'Abra o caixa antes de receber — senão este dinheiro fica fora da conferência.'
            : r.error,
        variant: 'destructive'
      })
    }
    setOcupado(false)
  }

  /*
   * O papel que vai com o entregador.
   *
   * Ideia dele, e é boa: quem sai com a joia precisa de algo na mão. Sem papel,
   * o entregador depende da memória para saber quanto cobrar, e o cliente não
   * tem como conferir se o que chegou é o que pediu.
   */
  const imprimirParaEntregador = async (p: PedidoSeparado) => {
    const r = await window.api.pedidos.detalhe(p.id)
    if (!r.success || !r.data) {
      showToast({ message: 'Não consegui ler os itens do pedido.', variant: 'destructive' })
      return
    }
    const detalhe = r.data as PedidoSeparado
    const html = gerarHtmlComprovanteEntrega(
      { ...p, observacao: p.observacao },
      detalhe.itens ?? [],
      nomeLoja
    )
    await imprimirDoc(html, nomeImpressao.pedidoEntrega(p.id), 'cupom')
  }

  const cancelar = async (p: PedidoSeparado) => {
    const ok = await confirmar({
      titulo: 'Cancelar pedido',
      mensagem:
        `As peças do pedido #${p.id} voltam a ficar disponíveis para venda. ` +
        'Nada é registrado como devolução, porque a venda não chegou a acontecer.',
      variante: 'destructive'
    })
    if (!ok) return
    const r = await window.api.pedidos.cancelar(p.id, 'Cancelado na tela de pedidos')
    if (r.success) {
      await carregar()
    } else {
      showToast({ message: r.error, variant: 'destructive' })
    }
  }

  /*
   * ⚠️ O link é montado e aberto na hora do clique, não guardado na linha: a
   * mensagem leva o total do pedido, e um link montado antes ficaria velho se a
   * lista fosse recarregada.
   */
  const chamarNoWhats = (p: PedidoSeparado) => {
    const link = linkWhatsApp(
      p.cliente_telefone,
      mensagemPedidoSeparado({
        cliente: p.cliente_nome,
        loja: nomeLoja,
        total: fmt(p.total),
        paraEntrega: p.para_entrega === 1
      })
    )
    if (!link) {
      showToast({
        message: 'Este cliente não tem um telefone válido no cadastro.',
        variant: 'destructive'
      })
      return
    }
    window.open(link, '_blank', 'noopener')
  }

  return (
    <div className="entrada-escalonada p-4 lg:p-8">
      <div className="hidden lg:block mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary" />
          Pedidos separados
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          O que já saiu da prateleira e ainda não foi pago. Enquanto está aqui, não conta como
          venda.
        </p>
      </div>

      {carregando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EstadoVazio
            icone={<PackageCheck className="w-9 h-9" />}
            dica="No caixa, monte o carrinho e use “Separar pedido” em vez de finalizar a venda."
          >
            Nenhum pedido separado.
          </EstadoVazio>
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y">
          {pedidos.map((p) => {
            const acoes: AcaoMenu[] = [
              {
                rotulo: 'Receber e concluir',
                icone: <CheckCircle2 className="w-4 h-4" />,
                onSelecionar: () => {
                  setForma('dinheiro')
                  setReceber(p)
                }
              },
              {
                rotulo: 'Chamar no WhatsApp',
                icone: <MessageCircle className="w-4 h-4" />,
                onSelecionar: () => chamarNoWhats(p)
              },
              {
                rotulo: 'Imprimir para o entregador',
                icone: <Printer className="w-4 h-4" />,
                onSelecionar: () => void imprimirParaEntregador(p)
              },
              {
                rotulo: 'Cancelar pedido',
                icone: <XCircle className="w-4 h-4" />,
                destrutiva: true,
                onSelecionar: () => void cancelar(p)
              }
            ]
            /*
              Três dias é o ponto em que uma joia fora da loja deixa de ser
              "saiu hoje" e vira dinheiro parado que alguém precisa cobrar.
            */
            const parado = p.dias_parado >= 3
            return (
              <li key={p.id} className="px-3 py-2.5">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    {p.para_entrega === 1 ? (
                      <Truck className="h-4 w-4" />
                    ) : (
                      <Store className="h-4 w-4" />
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-tight">
                        {p.cliente_nome ?? 'Sem cliente'}
                      </p>
                      <span className="num shrink-0 text-[14px] font-semibold">{fmt(p.total)}</span>
                    </div>
                    <p className="num mt-0.5 truncate text-[12.5px] text-muted-foreground">
                      #{p.id} · {p.para_entrega === 1 ? 'entrega' : 'retirada'} ·{' '}
                      {p.vendedor_nome ?? '—'}
                    </p>
                    {p.para_entrega === 1 && p.endereco_entrega && (
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {p.endereco_entrega}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                          parado ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {p.dias_parado === 0
                          ? 'separado hoje'
                          : `há ${p.dias_parado} dia${p.dias_parado > 1 ? 's' : ''}`}
                      </span>
                      {p.observacao && (
                        <span className="truncate text-[11.5px] italic text-muted-foreground">
                          “{p.observacao}”
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center">
                    <MenuAcoes rotulo={`Ações do pedido ${p.id}`} acoes={acoes} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Receber ── */}
      <Dialog open={receber !== null} onOpenChange={(o) => !o && setReceber(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receber o pedido #{receber?.id}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 [&>*]:min-w-0 [&>*>*]:min-w-0">
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-[12.5px] text-muted-foreground">Total combinado</p>
              <p className="num text-xl font-bold">{receber ? fmt(receber.total) : ''}</p>
            </div>
            {/*
              ⚠️ A forma só é perguntada AGORA, e é o ponto do recurso: o cliente
              decide na porta se paga em dinheiro, PIX ou cartão. Perguntar na
              separação obrigaria a adivinhar.
            */}
            <div className="grid gap-1.5">
              <Label>Como o cliente pagou?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {FORMAS_A_VISTA.map((f) => {
                  const Icone = f.icone
                  return (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => setForma(f.valor)}
                      aria-pressed={forma === f.valor}
                      className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-2.5 text-left text-sm transition-colors ${
                        forma === f.valor
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      <Icone className="w-4 h-4 shrink-0" />
                      <span className="truncate">{f.rotulo}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Ao confirmar, o pedido vira venda: baixa o estoque, entra no faturamento e gera
              comissão.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceber(null)}>
              Cancelar
            </Button>
            <Button onClick={concluir} disabled={ocupado}>
              {ocupado ? 'Registrando…' : 'Receber e concluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Pedidos

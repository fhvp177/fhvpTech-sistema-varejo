import { FC, useCallback, useEffect, useState } from 'react'
import { Megaphone, Target, Pencil, AlertCircle, Info } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import { Skeleton } from '@fhvptech/core/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { IMaskInput } from 'react-imask'
import MesPicker from '@/components/MesPicker'
import { CLASSE_DINHEIRO, paraMascara, paraNumero } from '@/utils/mascaras'

/**
 * Os dois cartões de tráfego pago do Painel.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Cards de ROAS e tráfego pago na Dashboard."
 *
 * ── ⚠️ O ROAS aparece em dois números, e isso não é indecisão ───────────────
 * O **atribuído** conta só o faturamento de cliente com a origem preenchida no
 * cadastro. É o número honesto, e numa loja que não pergunta "como você nos
 * conheceu?" ele vem zero — corretamente, porque não há como saber.
 *
 * O **geral** divide o faturamento da loja inteira pelo mesmo gasto. Sempre
 * parece melhor, porque inclui o cliente antigo que nunca viu anúncio.
 *
 * Mostrar só o atribuído faria o lojista concluir que o anúncio não funciona
 * quando o que falta é preencher a origem. Mostrar só o geral faria qualquer
 * campanha parecer um sucesso. Por isso os dois, com o aviso de quantos
 * clientes ainda estão sem origem.
 *
 * ── ⚠️ O valor investido é digitado, e só o dono digita ─────────────────────
 * Nenhuma fatura de anúncio passa pelo caixa. O número entra por esta tela, por
 * mês e por canal, e substitui o anterior em vez de somar (ver a migration
 * 050): o lojista volta aqui para corrigir, e corrigir não pode dobrar o gasto.
 */

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** ROAS se escreve como multiplicador: "3,2x" diz mais que "320%". */
const fmtRoas = (v: number): string => `${v.toFixed(2).replace('.', ',')}x`

const mesAtualLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type LinhaForm = {
  origem_id: number
  origem_nome: string
  texto: string
  clientes: number
}

/**
 * O lançamento do investimento do mês.
 *
 * ⚠️ Sem `max-h` nem `overflow` aqui: os dois já vêm do `DialogContent` do
 * núcleo. Repetir na tela é o erro que faz o título sumir em cima.
 */
const DialogoInvestimento: FC<{
  aberto: boolean
  onFechar: () => void
  onGravado: () => void
}> = ({ aberto, onFechar, onGravado }) => {
  const [mes, setMes] = useState(mesAtualLocal())
  const [linhas, setLinhas] = useState<LinhaForm[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    setCarregando(true)
    setErro('')
    window.api.trafego
      .investimentos(mes)
      .then((r) => {
        if (!ativo) return
        if (r.success) {
          setLinhas(
            r.data.map((l) => ({
              origem_id: l.origem_id,
              origem_nome: l.origem_nome,
              clientes: l.clientes,
              // Zero entra como campo VAZIO, não como "0,00": o campo cheio de
              // zero parece preenchido, e o lojista passa direto sem lançar.
              texto: l.valor > 0 ? paraMascara(l.valor) : ''
            }))
          )
        } else setErro(r.error)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [aberto, mes])

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    try {
      const r = await window.api.trafego.gravarInvestimentos(
        mes,
        linhas.map((l) => ({ origem_id: l.origem_id, valor: paraNumero(l.texto) }))
      )
      if (!r.success) {
        // ⚠️ O erro NÃO fecha a caixa: fechar apagaria o que ele digitou.
        setErro(r.error)
        return
      }
      onGravado()
      onFechar()
    } finally {
      setSalvando(false)
    }
  }

  const total = linhas.reduce((s, l) => s + paraNumero(l.texto), 0)

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Investimento em anúncio</DialogTitle>
        </DialogHeader>

        {/*
          ⚠️ Este texto existe por causa de uma pergunta de verdade: "por que ele
          tem que informar em 4 cantos? E quais são esses 4 canais?".

          A lista não é do sistema: são as ORIGENS DE CLIENTE que a própria loja
          cadastrou, e elas não são todas pagas — "Indicação" e "Presencial"
          convivem com "Instagram" ali no meio. Sem esta frase, a tela parece
          exigir quatro valores; com ela, fica claro que se preenche só onde há
          anúncio pago.
        */}
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            Quanto a loja gastou em cada canal no mês. É o único número desta tela que o sistema
            não tem como saber sozinho: nenhuma fatura de anúncio passa pelo caixa.
          </p>
          <p>
            A lista abaixo são os <strong>canais de origem de cliente</strong> da sua loja, os
            mesmos que aparecem no cadastro. <strong>Preencha só aqueles em que você paga
            anúncio</strong> e deixe os outros em branco: canal sem valor não entra na conta do
            ROAS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs">Mês</Label>
          <MesPicker value={mes} onChange={setMes} maxMes={mesAtualLocal()} />
        </div>

        {carregando ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum canal cadastrado ainda. Os canais são as origens de cliente: cadastre em{' '}
            <strong>Clientes</strong>, no botão <strong>Origens</strong>, e eles aparecem aqui.
          </p>
        ) : (
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={l.origem_id} className="flex items-start gap-2">
                <Label
                  htmlFor={`inv-${l.origem_id}`}
                  className="min-w-0 flex-1 text-sm font-normal"
                  title={l.origem_nome}
                >
                  <span className="block truncate">{l.origem_nome}</span>
                  <span className="block text-[11.5px] font-normal text-muted-foreground">
                    {l.clientes === 0
                      ? 'nenhum cliente veio por aqui ainda'
                      : `${l.clientes} cliente(s) vieram por aqui`}
                  </span>
                </Label>
                {/*
                  ⚠️ `IMaskInput`, nunca reformatar no onChange: é o IMask que
                  preserva a posição do cursor. Sem ele o cursor pula para o fim
                  a cada tecla digitada.
                */}
                {/*
                  ⚠️ A largura fica no CONTÊINER, não na classe do campo.

                  `CLASSE_DINHEIRO.className` já traz `w-full`, e acrescentar
                  `w-36` depois não ganha: as duas viram regras do mesmo peso na
                  folha de estilo, e quem decide é a ORDEM em que o Tailwind as
                  emite — não a ordem em que foram escritas aqui. `w-full` sai
                  depois e vence.
                  O campo então tomava a linha inteira, o nome do canal era
                  espremido a zero e o texto de baixo quebrava uma palavra por
                  linha, por trás do campo. Foi exatamente o que o dono viu.

                  Com a largura no pai e `w-full` no filho, não há disputa.
                */}
                <div className="w-36 shrink-0">
                  <IMaskInput
                    {...CLASSE_DINHEIRO}
                    id={`inv-${l.origem_id}`}
                    value={l.texto}
                    onAccept={(valor: string) =>
                      setLinhas((atuais) =>
                        atuais.map((x, j) => (j === i ? { ...x, texto: valor } : x))
                      )
                    }
                    className={`${CLASSE_DINHEIRO.className} text-right`}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Total do mês</span>
              <span className="num font-bold">{fmt(total)}</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Deixar o campo vazio apaga o lançamento daquele canal no mês. Canal sem valor não
              entra na conta do ROAS.
            </p>
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || carregando || linhas.length === 0}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const Numero: FC<{ rotulo: string; valor: string; detalhe?: string; forte?: boolean }> = ({
  rotulo,
  valor,
  detalhe,
  forte
}) => (
  <div className={`rounded-lg px-3 py-2.5 ${forte ? 'bg-primary/10' : 'bg-muted/60'}`}>
    <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    <p className="num mt-0.5 text-[19px] font-bold leading-tight break-words">{valor}</p>
    {detalhe && (
      <p className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">{detalhe}</p>
    )}
  </div>
)

const CardsTrafegoPago: FC<{ inicio: string; fim: string; rotuloPeriodo: string }> = ({
  inicio,
  fim,
  rotuloPeriodo
}) => {
  const [dados, setDados] = useState<ResumoTrafego | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [versao, setVersao] = useState(0)

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    window.api.trafego
      .resumo(inicio, fim)
      .then((r) => {
        if (!ativo) return
        setDados(r.success ? r.data : null)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [inicio, fim, versao])

  const semInvestimento = !!dados && dados.investimento <= 0

  return (
    <>
      {/* ── Cartão 1: o que foi gasto, canal por canal ─────────────────── */}
      <div className="anim-gatilho rounded-xl border bg-card p-3 lg:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="anim-alvo-acena h-5 w-5 shrink-0 text-muted-foreground" />
          <h3 className="font-semibold">Tráfego pago</h3>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setDialogoAberto(true)}
            title="Lançar quanto a loja gastou em anúncio no mês"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Lançar
          </Button>
        </div>
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          Investido em anúncio, {rotuloPeriodo.toLowerCase()}
        </p>

        {carregando ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : semInvestimento ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum investimento lançado neste período. Use o botão <strong>Lançar</strong> para
            registrar quanto a loja gastou em anúncio, e o ROAS aparece ao lado.
          </p>
        ) : (
          <>
            <Numero
              rotulo="Investido no período"
              valor={fmt(dados!.investimento)}
              detalhe={`${dados!.canais.length} canal(is) com anúncio`}
              forte
            />
            <ul className="mt-3 space-y-2.5">
              {dados!.canais.map((c) => (
                <li key={c.origem_id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium" title={c.origem_nome}>
                      {c.origem_nome}
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(c.investimento)} · {c.roas > 0 ? fmtRoas(c.roas) : 'sem retorno'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (c.investimento / Math.max(1, dados!.canais[0].investimento)) * 100
                          )
                        )}%`
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {fmt(c.receita)} em {c.num_vendas} venda(s) · {c.clientes_novos} cliente(s)
                    novo(s)
                  </p>
                </li>
              ))}
            </ul>
            {/*
              A janela do Painel quase nunca coincide com o mês da fatura. O
              aviso existe para o lojista não estranhar um investimento
              "quebrado" que ele nunca digitou.
            */}
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                O valor é lançado por mês. Quando o período escolhido pega só parte de um mês, o
                investimento entra na mesma proporção de dias.
              </span>
            </p>
          </>
        )}
      </div>

      {/* ── Cartão 2: o retorno ────────────────────────────────────────── */}
      <div className="anim-gatilho rounded-xl border bg-card p-3 lg:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="anim-alvo-acena h-5 w-5 shrink-0 text-muted-foreground" />
          <h3 className="font-semibold">ROAS</h3>
        </div>
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          Quanto voltou para cada real de anúncio
        </p>

        {carregando ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : semInvestimento ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Sem investimento lançado não há divisão a fazer. Lance o gasto do mês no cartão ao lado.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Numero
                rotulo="ROAS atribuído"
                valor={fmtRoas(dados!.roas_atribuido)}
                detalhe={`${fmt(dados!.receita_atribuida)} de quem veio pelo canal`}
                forte
              />
              <Numero
                rotulo="ROAS geral"
                valor={fmtRoas(dados!.roas_geral)}
                detalhe={`${fmt(dados!.receita_total)} da loja inteira`}
              />
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Clientes novos pelos canais pagos</span>
                <span className="num font-semibold">{dados!.clientes_novos_atribuidos}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Custo por cliente novo</span>
                <span className="num font-semibold">
                  {dados!.clientes_novos_atribuidos > 0 ? fmt(dados!.custo_por_cliente) : '—'}
                </span>
              </div>
            </div>

            {/*
              ⚠️ O aviso que separa "o anúncio não funciona" de "ninguém
              preencheu de onde o cliente veio". Sem ele, um ROAS atribuído baixo
              seria lido como fracasso da campanha.
            */}
            {dados!.clientes_sem_origem > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-[12px] text-warn">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {dados!.clientes_sem_origem} cliente(s) estão sem a origem preenchida. O que eles
                  compram não entra no ROAS atribuído, só no geral.
                </span>
              </p>
            )}

            <p className="mt-3 text-[11.5px] text-muted-foreground">
              O atribuído conta só quem foi marcado com um canal pago no cadastro. O geral divide o
              faturamento da loja inteira pelo mesmo gasto, então sempre parece maior.
            </p>
          </>
        )}
      </div>

      <DialogoInvestimento
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        onGravado={recarregar}
      />
    </>
  )
}

export default CardsTrafegoPago

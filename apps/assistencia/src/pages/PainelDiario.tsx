import { FC, ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarCheck, ClipboardList, MapPin, MessageCircle, Package, Plus,
  ShoppingCart, Truck, Wrench, CheckCircle2, Hourglass, LucideIcon
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useToast } from '@fhvptech/core/ui/toast'
import { abrirWhatsAppOS } from '@/utils/whatsapp'

// A casa do técnico (que aqui também é o dono): responde "o que eu tenho pra
// hoje?" em quatro filas vivas. Dinheiro continua na Dashboard — esta tela é
// sobre TRABALHO. Clicar em qualquer OS leva pra tela de OS já aberta nela.

type StatusOS =
  | 'aberta' | 'orcamento' | 'aguardando_aprovacao' | 'aprovada' | 'agendada'
  | 'em_reparo' | 'aguardando_peca' | 'pronta' | 'entregue' | 'recusada' | 'cancelada'

type OrdemServico = {
  id: number
  tipo_atendimento: 'bancada' | 'externo'
  categoria?: 'equipamento' | 'cftv'
  status: StatusOS
  equipamento: string | null
  endereco_atendimento: string | null
  agendado_para: string | null
  defeito_relatado: string
  cliente_nome?: string
  cliente_telefone?: string | null
  total?: number
  dias_parada?: number
}

const fmt = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numeroOS = (id: number): string => `#${String(id).padStart(3, '0')}`

const hojeLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const horaDe = (iso: string | null): string =>
  iso && iso.length >= 16 ? iso.slice(11, 16) : ''

const diaDe = (iso: string | null): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''

const PainelDiario: FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [lista, setLista] = useState<OrdemServico[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    ;(async () => {
      const resp = await window.api.os.listar()
      if (resp.success) setLista(resp.data as OrdemServico[])
      setCarregado(true)
    })()
  }, [])

  const hoje = hojeLocal()

  const filas = useMemo(() => {
    const visitas = lista
      .filter((os) => os.status === 'agendada' && (os.agendado_para ?? '').slice(0, 10) <= hoje)
      .sort((a, b) => (a.agendado_para ?? '').localeCompare(b.agendado_para ?? ''))
    const bancada = lista
      .filter((os) => ['aprovada', 'em_reparo', 'aguardando_peca'].includes(os.status))
      .sort((a, b) => (b.dias_parada ?? 0) - (a.dias_parada ?? 0))
    const esperando = lista
      .filter((os) => os.status === 'aguardando_aprovacao')
      .sort((a, b) => (b.dias_parada ?? 0) - (a.dias_parada ?? 0))
    const prontas = lista
      .filter((os) => os.status === 'pronta')
      .sort((a, b) => (b.dias_parada ?? 0) - (a.dias_parada ?? 0))
    const naFila = lista.filter((os) => os.status === 'aberta' || os.status === 'orcamento')
    return { visitas, bancada, esperando, prontas, naFila }
  }, [lista, hoje])

  const abrirOS = (id: number) => navigate('/os', { state: { abrirOs: id } })

  const whatsapp = (os: OrdemServico) => {
    if (!abrirWhatsAppOS(os.cliente_telefone, os)) {
      showToast({
        message: 'Este cliente não tem um telefone válido no cadastro.',
        variant: 'destructive'
      })
    }
  }

  const dataExtenso = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-primary" />
            Painel Diário
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            O que tem para hoje, em filas de trabalho. Dinheiro fica na Dashboard; aqui é
            serviço. Clicar numa OS abre ela direto.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/vendas')}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            Nova Venda
          </Button>
          <Button
            onClick={() => navigate('/os', { state: { novaOs: true } })}
            data-tour="painel-nova-os"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova OS
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground capitalize mb-5">{dataExtenso}</p>

      {filas.naFila.length > 0 && (
        <button
          onClick={() => navigate('/os')}
          className="mb-4 w-full flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors text-left"
        >
          <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>
            <b>{filas.naFila.length}</b> OS{filas.naFila.length !== 1 ? 's' : ''} na fila de
            orçamento — abrir a lista completa
          </span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CartaoFila
          titulo="Visitas de hoje"
          icone={Truck}
          corIcone="text-cyan-600"
          vazio={carregado ? 'Nenhuma visita agendada pra hoje.' : '...'}
          itens={filas.visitas}
          render={(os) => (
            <LinhaOS
              os={os}
              onAbrir={() => abrirOS(os.id)}
              onWhatsApp={() => whatsapp(os)}
              direita={
                (os.agendado_para ?? '').slice(0, 10) < hoje ? (
                  <span className="text-destructive font-semibold text-xs">
                    atrasada ({diaDe(os.agendado_para)})
                  </span>
                ) : (
                  <span className="text-cyan-700 font-semibold text-sm">{horaDe(os.agendado_para) || 'hoje'}</span>
                )
              }
              contexto={os.endereco_atendimento ?? ''}
              iconeContexto={MapPin}
            />
          )}
        />

        <CartaoFila
          titulo="Bancada e execução"
          icone={Wrench}
          corIcone="text-orange-600"
          vazio={carregado ? 'Nada em execução agora.' : '...'}
          itens={filas.bancada}
          render={(os) => (
            <LinhaOS
              os={os}
              onAbrir={() => abrirOS(os.id)}
              direita={
                os.status === 'aprovada' ? (
                  <span className="text-violet-700 font-semibold text-xs">pode começar</span>
                ) : os.status === 'aguardando_peca' ? (
                  <span className="text-yellow-700 font-semibold text-xs flex items-center gap-1">
                    <Hourglass className="w-3 h-3" /> peça
                  </span>
                ) : (
                  <DiasBadge dias={os.dias_parada ?? 0} sufixo="em execução" />
                )
              }
              contexto={os.equipamento ?? os.endereco_atendimento ?? ''}
              iconeContexto={os.tipo_atendimento === 'bancada' ? Package : MapPin}
            />
          )}
        />

        <CartaoFila
          titulo="Esperando o cliente"
          icone={MessageCircle}
          corIcone="text-amber-600"
          vazio={carregado ? 'Nenhum orçamento aguardando resposta.' : '...'}
          itens={filas.esperando}
          render={(os) => (
            <LinhaOS
              os={os}
              onAbrir={() => abrirOS(os.id)}
              onWhatsApp={() => whatsapp(os)}
              direita={
                <div className="text-right">
                  {os.total ? <div className="font-semibold text-sm">{fmt(os.total)}</div> : null}
                  <DiasBadge dias={os.dias_parada ?? 0} sufixo="esperando" />
                </div>
              }
              contexto={os.equipamento ?? os.endereco_atendimento ?? ''}
              iconeContexto={os.tipo_atendimento === 'bancada' ? Package : MapPin}
            />
          )}
        />

        <CartaoFila
          titulo="Prontas pra entregar"
          icone={CheckCircle2}
          corIcone="text-green-600"
          vazio={carregado ? 'Nada esperando entrega ou retirada.' : '...'}
          itens={filas.prontas}
          render={(os) => (
            <LinhaOS
              os={os}
              onAbrir={() => abrirOS(os.id)}
              onWhatsApp={() => whatsapp(os)}
              direita={<DiasBadge dias={os.dias_parada ?? 0} sufixo="pronta" />}
              contexto={os.equipamento ?? os.endereco_atendimento ?? ''}
              iconeContexto={os.tipo_atendimento === 'bancada' ? Package : MapPin}
            />
          )}
        />
      </div>

      {carregado && lista.length === 0 && (
        <div className="mt-6 text-center text-sm text-muted-foreground border rounded-lg py-10">
          <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhuma OS por aqui ainda. Quando chegar o primeiro aparelho, clique em{' '}
          <b>Nova OS</b> — e o seu dia passa a se organizar sozinho nesta tela.
        </div>
      )}
    </div>
  )
}

// ── Peças visuais ──

const DiasBadge: FC<{ dias: number; sufixo: string }> = ({ dias, sufixo }) => (
  <span
    className={`text-xs font-medium ${
      dias >= 7 ? 'text-destructive' : dias >= 3 ? 'text-amber-600' : 'text-muted-foreground'
    }`}
  >
    {dias === 0 ? `${sufixo} hoje` : `${sufixo} há ${dias}d`}
  </span>
)

const CartaoFila: FC<{
  titulo: string
  icone: LucideIcon
  corIcone: string
  vazio: string
  itens: OrdemServico[]
  render: (os: OrdemServico) => ReactNode
}> = ({ titulo, icone: Icone, corIcone, vazio, itens, render }) => (
  <div className="border rounded-xl bg-card overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
      <Icone className={`w-4 h-4 ${corIcone}`} />
      <h3 className="font-semibold text-sm">{titulo}</h3>
      <span className="ml-auto text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
        {itens.length}
      </span>
    </div>
    {itens.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-6">{vazio}</p>
    ) : (
      <ul className="divide-y">
        {itens.slice(0, 6).map((os) => (
          <li key={os.id}>{render(os)}</li>
        ))}
        {itens.length > 6 && (
          <li className="px-4 py-2 text-xs text-muted-foreground text-center">
            + {itens.length - 6} na lista de OS
          </li>
        )}
      </ul>
    )}
  </div>
)

const LinhaOS: FC<{
  os: OrdemServico
  onAbrir: () => void
  onWhatsApp?: () => void
  direita: ReactNode
  contexto: string
  iconeContexto: LucideIcon
}> = ({ os, onAbrir, onWhatsApp, direita, contexto, iconeContexto: IconeCtx }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
    <button onClick={onAbrir} className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{numeroOS(os.id)}</span>
        <span className="font-medium text-sm truncate">{os.cliente_nome}</span>
      </div>
      {contexto && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 min-w-0">
          <IconeCtx className="w-3 h-3 shrink-0" />
          <span className="truncate">{contexto}</span>
        </div>
      )}
    </button>
    <div className="shrink-0">{direita}</div>
    {onWhatsApp && (
      <button
        onClick={onWhatsApp}
        title="Chamar no WhatsApp com mensagem pronta"
        className="shrink-0 rounded-full p-1.5 text-green-600 hover:bg-green-50 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
      </button>
    )}
  </div>
)

export default PainelDiario

import { FC, useEffect, useRef, useState } from 'react'
import { Bell, Wallet, Package, Settings, Gift, X, ChevronRight } from 'lucide-react'

export type NotificacaoItem = {
  id: number
  // Identifica o TIPO de alerta (ex.: 'vence-amanha', 'estoque-baixo'). O app usa
  // pra decidir se, ao clicar, abre um popup de detalhe em vez de só navegar.
  chave: string
  tipo: 'dinheiro' | 'estoque' | 'sistema' | 'relacionamento'
  severidade: 'critico' | 'alerta' | 'info'
  titulo: string
  descricao: string | null
  rota: string | null
  acao: 'suporte' | 'pix' | 'instalar-update' | null
  criada_em: string
  lida: number
}

type Props = {
  itens: NotificacaoItem[]
  naoLidas: number
  aberto: boolean
  onToggle: () => void
  onFechar: () => void
  onClicar: (n: NotificacaoItem) => void
  onDispensar: (id: number) => void
}

const ICONE_TIPO = {
  dinheiro: Wallet,
  estoque: Package,
  sistema: Settings,
  relacionamento: Gift
} as const

// Cor do "chip" do ícone por severidade — o mesmo sistema de acento do resto do app.
const COR_SEVERIDADE = {
  critico: 'bg-red-100 text-red-600',
  alerta: 'bg-amber-100 text-amber-600',
  info: 'bg-blue-100 text-blue-600'
} as const

const ROTULO_ACAO = {
  pix: 'Renovar',
  'instalar-update': 'Instalar',
  suporte: 'Falar com suporte'
} as const

function tempoRelativo(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const dias = Math.floor(h / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return d.toLocaleDateString('pt-BR')
}

const SinoNotificacoes: FC<Props> = ({
  itens, naoLidas, aberto, onToggle, onFechar, onClicar, onDispensar
}) => {
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 16 })

  // Ancora o painel logo abaixo do sino (posição fixa, pra não ser cortado por
  // containers com overflow-hidden no caminho).
  useEffect(() => {
    if (aberto && botaoRef.current) {
      const r = botaoRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
  }, [aberto])

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={onToggle}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={onFechar} />
          <div
            className="fixed w-80 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-slate-200 z-[70] flex flex-col overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Notificações</h3>
              <button
                type="button"
                onClick={onFechar}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">Tudo em dia ✨</p>
                <p className="text-xs text-slate-400 mt-0.5">Nenhum aviso no momento.</p>
              </div>
            ) : (
              <ul className="overflow-y-auto divide-y divide-slate-100">
                {itens.map((n) => {
                  const Icone = ICONE_TIPO[n.tipo]
                  const clicavel = Boolean(n.rota || n.acao)
                  return (
                    <li
                      key={n.id}
                      className={`group relative flex items-start gap-3 px-4 py-3 border-l-2 transition-colors ${
                        n.lida ? 'border-transparent' : 'border-blue-500 bg-blue-100/70'
                      } ${clicavel ? 'hover:bg-muted/60 cursor-pointer' : ''}`}
                      onClick={() => clicavel && onClicar(n)}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          COR_SEVERIDADE[n.severidade]
                        }`}
                      >
                        <Icone className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <p className={`text-sm leading-snug ${n.lida ? 'text-slate-700' : 'font-semibold text-slate-800'}`}>
                          {n.titulo}
                        </p>
                        {n.descricao && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.descricao}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-slate-400">{tempoRelativo(n.criada_em)}</span>
                          {n.acao && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600">
                              {ROTULO_ACAO[n.acao]} <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDispensar(n.id) }}
                        className="absolute top-2 right-2 text-slate-300 hover:text-slate-600 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Dispensar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default SinoNotificacoes

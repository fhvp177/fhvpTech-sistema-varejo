import { FC, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Bot, Send, X, BotMessageSquare } from 'lucide-react'

type Mensagem = { role: 'user' | 'assistant'; content: string; erro?: boolean }

const SUGESTOES = [
  'Quais produtos estão com estoque baixo?',
  'Quanto vendi hoje?',
  'Quais clientes estão inadimplentes?'
]

// Posição (distância das bordas direita/inferior, em px). Ancorar pelo canto
// inferior-direito mantém o comportamento atual: a janela "cresce" pra cima/
// esquerda a partir do botão. Persistido pra lembrar onde o lojista largou.
type Pos = { right: number; bottom: number }
/**
 * Onde ele nasce quando ninguém o arrastou ainda.
 *
 * ⚠️ No celular a ilha de navegação ocupa a faixa de baixo, então 24px o
 * deixaria em cima dela. Os 88px = 14 (folga da ilha) + 62 (altura dela) +
 * 12 de respiro.
 *
 * Isto é um PADRÃO, não uma amarra: quem arrastar continua mandando. Fixar a
 * posição pelo CSS resolveria o estorvo e mataria o arraste junto — foi o que
 * eu fiz na primeira tentativa, e estava errado.
 */
const POS_PADRAO: Pos =
  typeof window !== 'undefined' && window.innerWidth < 1024
    ? { right: 14, bottom: 88 }
    : { right: 24, bottom: 24 }
const MARGEM = 8
const STORAGE_KEY = 'chat-assistente-pos'

function carregarPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Pos>
      if (typeof p.right === 'number' && typeof p.bottom === 'number') {
        return { right: p.right, bottom: p.bottom }
      }
    }
  } catch {
    // localStorage corrompido/indisponível — usa o padrão.
  }
  return POS_PADRAO
}

// Assistente de IA flutuante e arrastável. Conversa via window.api.chat.enviar,
// que roda o loop de tool-use no main process (consultas read-only ao SQLite
// local) e devolve a resposta final. Histórico só no estado local.
const ChatAssistente: FC = () => {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [entrada, setEntrada] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [pos, setPos] = useState<Pos>(carregarPos)
  const fimRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const moveuRef = useRef(false) // distingue arraste de clique no botão

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto, carregando])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  }, [pos])

  // Mantém o widget dentro da tela quando alterna botão↔janela (tamanhos
  // diferentes) e quando a janela do app é redimensionada.
  const clampNaTela = (p: Pos, w: number, h: number): Pos => ({
    right: Math.max(MARGEM, Math.min(p.right, window.innerWidth - w - MARGEM)),
    bottom: Math.max(MARGEM, Math.min(p.bottom, window.innerHeight - h - MARGEM))
  })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos((p) => clampNaTela(p, width, height))
  }, [aberto])

  useEffect(() => {
    const aoRedimensionar = () => {
      const el = containerRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      setPos((p) => clampNaTela(p, width, height))
    }
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  // Inicia o arraste a partir de um handle (botão recolhido ou cabeçalho).
  function aoPressionar(e: React.PointerEvent): void {
    if (e.button !== 0) return
    const inicioX = e.clientX
    const inicioY = e.clientY
    const inicio = pos
    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 0
    const h = rect?.height ?? 0
    moveuRef.current = false
    document.body.style.userSelect = 'none'

    const aoMover = (ev: PointerEvent) => {
      const dx = ev.clientX - inicioX
      const dy = ev.clientY - inicioY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moveuRef.current = true
      setPos(clampNaTela({ right: inicio.right - dx, bottom: inicio.bottom - dy }, w, h))
    }
    const aoSoltar = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerup', aoSoltar)
    }
    window.addEventListener('pointermove', aoMover)
    window.addEventListener('pointerup', aoSoltar)
  }

  async function enviar(texto: string): Promise<void> {
    const pergunta = texto.trim()
    if (!pergunta || carregando) return

    const novoHistorico: Mensagem[] = [...mensagens, { role: 'user', content: pergunta }]
    setMensagens(novoHistorico)
    setEntrada('')
    setCarregando(true)

    // Envia só os turnos de texto (user/assistant), sem os de erro.
    const paraEnviar = novoHistorico
      .filter((m) => !m.erro)
      .map((m) => ({ role: m.role, content: m.content }))

    const resp = await window.api.chat.enviar(paraEnviar)
    setCarregando(false)
    if (resp.success) {
      setMensagens((prev) => [...prev, { role: 'assistant', content: resp.data }])
    } else {
      setMensagens((prev) => [
        ...prev,
        { role: 'assistant', content: resp.error, erro: true }
      ])
    }
  }

  /*
   * A posição vai como VARIÁVEL, não como `right`/`bottom` embutidos.
   *
   * Estilo embutido vence qualquer seletor, então com `right` direto aqui não
   * haveria como o celular reposicionar o botão sem `!important` nem uma
   * condicional em JavaScript. Como variável, o desktop consome o valor salvo
   * do arraste e o celular o ignora, redefinindo as duas propriedades no CSS
   * (ver `.fab-assistente` no index.css, §4 do roteiro).
   */
  return (
    <div
      ref={containerRef}
      className="fab-assistente fixed z-50"
      style={
        {
          '--fab-right': pos.right + 'px',
          '--fab-bottom': pos.bottom + 'px'
        } as CSSProperties
      }
    >
      {!aberto ? (
        <button
          onPointerDown={aoPressionar}
          onClick={() => { if (!moveuRef.current) setAberto(true) }}
          title="Assistente de IA — arraste para mover"
          aria-label="Assistente de IA"
          /*
            Só o círculo, sem o rótulo. Numa tela de 360px a cápsula com a
            palavra "Assistente" tinha quase 150px de largura e cobria nome de
            cliente, preço e valor de venda — era o pior vizinho da tela.

            48px é maior que os 44 que o dedo pede, então encolher não custou
            alcance. `touch-none` continua: é o que impede o navegador de
            interpretar o arraste como rolagem.
          */
          className="flex h-12 w-12 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 lg:h-auto lg:w-auto lg:gap-2 lg:px-4 lg:py-3"
        >
          <BotMessageSquare className="w-5 h-5 shrink-0" />
          <span className="hidden text-sm font-medium lg:inline">Assistente</span>
        </button>
      ) : (
        <div className="flex w-[380px] max-w-[calc(100vw-3rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* Cabeçalho — handle de arraste */}
          <div
            onPointerDown={aoPressionar}
            className="flex cursor-move touch-none select-none items-center justify-between rounded-t-xl bg-slate-900 px-4 py-3 text-white"
            title="Arraste para mover"
          >
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-semibold">Assistente</span>
            </div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setAberto(false)}
              title="Fechar"
              className="text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 280, maxHeight: '50vh' }}>
            {mensagens.length === 0 && !carregando && (
              <div className="text-slate-500 text-sm space-y-3">
                <p>Pergunte sobre estoque, preços, vendas, giro e inadimplência dos seus clientes.</p>
                <div className="space-y-1.5">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="block w-full text-left text-[13px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensagens.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : m.erro
                        ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {carregando && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                  Consultando…
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          {/* Entrada */}
          <div className="border-t border-slate-200 p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar(entrada)
                  }
                }}
                rows={1}
                placeholder="Pergunte algo sobre a loja…"
                disabled={carregando}
                className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 max-h-28"
              />
              <button
                onClick={() => enviar(entrada)}
                disabled={carregando || !entrada.trim()}
                title="Enviar"
                className="shrink-0 rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatAssistente

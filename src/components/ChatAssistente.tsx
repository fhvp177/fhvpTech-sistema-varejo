import { FC, useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Sparkles } from 'lucide-react'

type Mensagem = { role: 'user' | 'assistant'; content: string; erro?: boolean }

const SUGESTOES = [
  'Quais produtos estão com estoque baixo?',
  'Quanto vendi hoje?',
  'Qual o giro da blusa nos últimos 30 dias?'
]

// Assistente de IA flutuante. Conversa via window.api.chat.enviar, que roda o
// loop de tool-use no main process (consultas read-only ao SQLite local) e
// devolve a resposta final em texto. Mantém o histórico só no estado local.
const ChatAssistente: FC = () => {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [entrada, setEntrada] = useState('')
  const [carregando, setCarregando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto, carregando])

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

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        title="Assistente de IA"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-sm font-medium">Assistente</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between rounded-t-xl bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold">Assistente</span>
        </div>
        <button onClick={() => setAberto(false)} title="Fechar" className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 280, maxHeight: '50vh' }}>
        {mensagens.length === 0 && !carregando && (
          <div className="text-slate-500 text-sm space-y-3">
            <p>Pergunte sobre estoque, preços, vendas e giro dos seus produtos.</p>
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
  )
}

export default ChatAssistente

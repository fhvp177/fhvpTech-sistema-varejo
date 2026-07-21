import { FC, useEffect, useRef, useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'

type Props = {
  vendedorId: number
  // Email salvo com sucesso — o pai deve recarregar a sessão (o modal some
  // sozinho quando a sessão passa a ter email).
  onSalvo: () => void
  // Gerente optou por adiar — escondemos nesta sessão, mas perguntamos de novo no
  // próximo login (o email continua faltando).
  onPular: () => void
}

const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const ModalCadastrarEmailDono: FC<Props> = ({ vendedorId, onSalvo, onPular }) => {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const salvar = async () => {
    setErro('')
    const alvo = email.trim()
    if (!REGEX_EMAIL.test(alvo)) {
      setErro('Digite um email válido.')
      return
    }
    setCarregando(true)
    const resp = await window.api.vendedores.atualizar(vendedorId, { email: alvo })
    setCarregando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    onSalvo()
  }

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            Cadastre seu email de recuperação
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Com um email cadastrado, você consegue redefinir seu PIN sozinho caso o esqueça — sem
            depender do suporte.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Seu email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !carregando) salvar()
                }}
                disabled={carregando}
                placeholder="seuemail@exemplo.com"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
              />
            </div>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {erro}
            </div>
          )}

          <button
            onClick={salvar}
            disabled={carregando || !email.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {carregando ? 'Salvando...' : 'Salvar email'}
          </button>

          <button
            onClick={onPular}
            disabled={carregando}
            className="w-full text-xs text-slate-500 hover:text-slate-700"
          >
            Agora não (perguntaremos na próxima vez)
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalCadastrarEmailDono

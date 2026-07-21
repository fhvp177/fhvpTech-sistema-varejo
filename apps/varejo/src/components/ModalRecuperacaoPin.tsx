import { FC, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Mail, KeyRound, ShieldCheck } from 'lucide-react'

type Props = {
  // Chamado quando o usuário desiste e volta pro login.
  onCancelar: () => void
  // Chamado após redefinir o PIN com sucesso — a sessão do usuário já foi aberta
  // no main (login automático), então o pai deve só desbloquear o sistema.
  onSucesso: () => void
}

const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const ModalRecuperacaoPin: FC<Props> = ({ onCancelar, onSucesso }) => {
  const [etapa, setEtapa] = useState<'pedir' | 'redefinir'>('pedir')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(false)
  const primeiroInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    primeiroInput.current?.focus()
  }, [etapa])

  const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  const enviarCodigo = async () => {
    setErro('')
    const alvo = email.trim()
    if (!REGEX_EMAIL.test(alvo)) {
      setErro('Digite um email válido.')
      return
    }
    setCarregando(true)
    const resp = await window.api.auth.solicitarRecuperacao(alvo)
    setCarregando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    if (!resp.data.enviado) {
      setErro(
        'Não encontramos um usuário ativo com esse email. Confira o endereço, ou peça ao gerente para redefinir seu PIN nas Configurações.'
      )
      return
    }
    setAviso('Enviamos um código de 6 dígitos para seu email. Ele é válido por 15 minutos.')
    setEtapa('redefinir')
  }

  const redefinir = async () => {
    setErro('')
    if (!/^\d{6}$/.test(codigo)) {
      setErro('O código tem 6 dígitos.')
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setErro('O novo PIN deve ter de 4 a 6 dígitos.')
      return
    }
    if (pin !== pinConfirmacao) {
      setErro('A confirmação não confere com o novo PIN.')
      return
    }
    setCarregando(true)
    const resp = await window.api.auth.redefinirComCodigo(email.trim(), codigo, pin)
    setCarregando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    if (!resp.data.ok) {
      setErro('Não foi possível redefinir o PIN. Solicite um novo código.')
      return
    }
    onSucesso()
  }

  const inputPin =
    'w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100'

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 text-slate-700">
            <ShieldCheck className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Recuperar acesso</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {etapa === 'pedir'
              ? 'Enviaremos um código para o email cadastrado na sua conta.'
              : 'Digite o código recebido e escolha um novo PIN.'}
          </p>
        </div>

        {aviso && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800 mb-4">
            {aviso}
          </div>
        )}

        {etapa === 'pedir' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Seu email cadastrado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={primeiroInput}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !carregando) enviarCodigo()
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
              onClick={enviarCodigo}
              disabled={carregando || !email.trim()}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {carregando ? 'Enviando...' : 'Enviar código'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Código de 6 dígitos
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={primeiroInput}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(e) => setCodigo(soDigitos(e.target.value))}
                  disabled={carregando}
                  placeholder="000000"
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Novo PIN (4 a 6 dígitos)
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(soDigitos(e.target.value))}
                disabled={carregando}
                placeholder="••••"
                className={inputPin}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirme o novo PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinConfirmacao}
                onChange={(e) => setPinConfirmacao(soDigitos(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !carregando) redefinir()
                }}
                disabled={carregando}
                placeholder="••••"
                className={inputPin}
              />
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {erro}
              </div>
            )}

            <button
              onClick={redefinir}
              disabled={carregando || codigo.length < 6 || pin.length < 4}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {carregando ? 'Validando...' : 'Redefinir PIN e entrar'}
            </button>

            <button
              onClick={() => {
                setEtapa('pedir')
                setCodigo('')
                setPin('')
                setPinConfirmacao('')
                setErro('')
                setAviso('')
              }}
              disabled={carregando}
              className="w-full text-xs text-slate-500 hover:text-slate-700"
            >
              Não recebeu? Enviar um novo código
            </button>
          </div>
        )}

        <button
          onClick={onCancelar}
          disabled={carregando}
          className="mt-6 w-full flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o login
        </button>
      </div>
    </div>
  )
}

export default ModalRecuperacaoPin

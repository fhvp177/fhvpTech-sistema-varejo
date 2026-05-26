import { FC, useEffect, useRef, useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import logoGnModas from '@/assets/logo.png'

const MAX_TENTATIVAS = 5
const SEGUNDOS_BLOQUEIO = 30

type Props = {
  // true = primeira execução, precisa cadastrar PIN
  modoCadastro: boolean
  onDesbloquear: () => void
}

const LoginSistema: FC<Props> = ({ modoCadastro, onDesbloquear }) => {
  const [pin, setPin] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [tentativas, setTentativas] = useState(0)
  const [segundosTravado, setSegundosTravado] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Conta regressiva do bloqueio temporário após 5 erros
  useEffect(() => {
    if (segundosTravado <= 0) return
    const t = setTimeout(() => setSegundosTravado(segundosTravado - 1), 1000)
    return () => clearTimeout(t)
  }, [segundosTravado])

  const sanitizar = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  const cadastrar = async () => {
    setErro('')
    if (!/^\d{4,6}$/.test(pin)) {
      setErro('O PIN deve ter entre 4 e 6 dígitos numéricos.')
      return
    }
    if (pin !== pinConfirmacao) {
      setErro('A confirmação não confere com o PIN digitado.')
      return
    }
    setCarregando(true)
    const resp = await window.api.auth.definirPin(pin)
    if (resp.success) {
      onDesbloquear()
    } else {
      setErro(resp.error)
      setCarregando(false)
    }
  }

  const desbloquear = async () => {
    setErro('')
    if (segundosTravado > 0) return
    if (!/^\d{4,6}$/.test(pin)) {
      setErro('Digite seu PIN (4 a 6 dígitos).')
      return
    }
    setCarregando(true)
    const resp = await window.api.auth.verificarPin(pin)
    setCarregando(false)
    if (resp.success && resp.data.ok) {
      onDesbloquear()
      return
    }
    const novasTentativas = tentativas + 1
    setTentativas(novasTentativas)
    setPin('')
    if (novasTentativas >= MAX_TENTATIVAS) {
      setSegundosTravado(SEGUNDOS_BLOQUEIO)
      setTentativas(0)
      setErro(`Muitas tentativas. Aguarde ${SEGUNDOS_BLOQUEIO}s antes de tentar novamente.`)
    } else {
      setErro(
        `PIN incorreto. ${MAX_TENTATIVAS - novasTentativas} tentativa${MAX_TENTATIVAS - novasTentativas !== 1 ? 's' : ''} restante${MAX_TENTATIVAS - novasTentativas !== 1 ? 's' : ''}.`
      )
    }
    inputRef.current?.focus()
  }

  const acao = modoCadastro ? cadastrar : desbloquear
  const travado = segundosTravado > 0
  const podeEnviar = !carregando && !travado && pin.length >= 4 && (!modoCadastro || pinConfirmacao.length >= 4)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <img src={logoGnModas} alt="GN Modas" className="w-24 h-24 mx-auto mb-3 object-contain" />
          <div className="flex items-center justify-center gap-2 text-slate-700">
            {modoCadastro ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            <h1 className="text-lg font-semibold">
              {modoCadastro ? 'Configurar PIN de acesso' : 'Sistema bloqueado'}
            </h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {modoCadastro
              ? 'Defina um PIN para proteger o acesso ao sistema.'
              : 'Digite o PIN para desbloquear.'}
          </p>
        </div>

        {modoCadastro && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 text-sm text-blue-800">
            <p>
              O PIN será solicitado na primeira abertura do dia e após períodos de inatividade.
              Use de 4 a 6 dígitos, fácil de lembrar.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {modoCadastro ? 'PIN (4 a 6 dígitos)' : 'PIN'}
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(sanitizar(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && podeEnviar) acao()
              }}
              disabled={carregando || travado}
              placeholder="••••"
              className="w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
            />
          </div>

          {modoCadastro && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirme o PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinConfirmacao}
                onChange={(e) => setPinConfirmacao(sanitizar(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && podeEnviar) acao()
                }}
                disabled={carregando}
                placeholder="••••"
                className="w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-red-700 text-sm">{erro}</p>
              {travado && (
                <p className="text-red-700 text-sm mt-1">
                  Tente novamente em <span className="font-semibold">{segundosTravado}s</span>.
                </p>
              )}
            </div>
          )}

          <button
            onClick={acao}
            disabled={!podeEnviar}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {carregando
              ? 'Validando...'
              : modoCadastro
                ? 'Definir PIN e entrar'
                : 'Desbloquear'}
          </button>
        </div>

        {!modoCadastro && (
          <p className="text-center text-xs text-slate-400 mt-6">
            Esqueceu o PIN? Entre em contato com o suporte:{' '}
            <span className="font-semibold text-slate-600 whitespace-nowrap">
              (85) 9.2187-1975
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

export default LoginSistema

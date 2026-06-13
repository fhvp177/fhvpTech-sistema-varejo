import { FC, useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import logoEmpresa from './assets/logo.png'

type Props = {
  mensagemInicial: string
  // Subtítulo sob o logo — varia por nicho (ex.: "Sistema de Gestão Veterinária").
  subtitulo: string
  onAtivar: (diasRestantes?: number) => void
  onRenovarComPix: () => void
}

const LicencaBloqueada: FC<Props> = ({ mensagemInicial, subtitulo, onAtivar, onRenovarComPix }) => {
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState(mensagemInicial)
  const [carregando, setCarregando] = useState(false)
  const [temClienteSalvo, setTemClienteSalvo] = useState(false)

  // Se houver uma licença anterior salva (mesmo vencida), o clienteId pode
  // ser extraído e oferecemos a renovação direta por PIX. Sem licença prévia
  // (primeira instalação), só o caminho manual continua válido.
  useEffect(() => {
    window.api.licenca.obterClienteId().then((resp) => {
      if (resp.success && resp.data) setTemClienteSalvo(true)
    })
  }, [])

  const ativar = async () => {
    if (!chave.trim()) return
    setCarregando(true)
    setErro('')

    const resp = await window.api.licenca.ativar(chave.trim())

    if (resp.success) {
      const status = resp.data as { valida: boolean; mensagem: string; diasRestantes?: number }
      if (status.valida) {
        onAtivar(status.diasRestantes)
      } else {
        setErro(status.mensagem)
      }
    } else {
      setErro(resp.error)
    }
    setCarregando(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <img
            src={logoEmpresa}
            alt="FHVP Tech"
            className="w-32 h-32 mx-auto mb-3 object-contain"
          />
          <p className="text-slate-500 text-sm">{subtitulo}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-amber-800 text-sm font-medium">Ativação necessária</p>
          <p className="text-amber-700 text-sm mt-1">
            Insira a chave de licença fornecida pelo suporte para continuar.
          </p>
          <p className="text-amber-700 text-sm mt-2">
            Suporte: <span className="font-semibold whitespace-nowrap">(85) 9.2187-1975</span>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Chave de licença
            </label>
            <input
              type="text"
              value={chave}
              onChange={(e) => setChave(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && ativar()}
              placeholder="CLIENTE:AAAA-MM-DD:CODIGO"
              spellCheck={false}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-red-700 text-sm">{erro}</p>
            </div>
          )}

          <button
            onClick={ativar}
            disabled={carregando || !chave.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {carregando ? 'Validando...' : 'Ativar Sistema'}
          </button>

          {temClienteSalvo && (
            <>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-400">ou renove agora</span>
                </div>
              </div>
              <button
                onClick={onRenovarComPix}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <QrCode className="w-4 h-4" />
                Renovar com PIX
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Problemas? Entre em contato com o suporte:{' '}
          <span className="font-semibold text-slate-600 whitespace-nowrap">(85) 9.2187-1975</span>
        </p>
      </div>
    </div>
  )
}

export default LicencaBloqueada

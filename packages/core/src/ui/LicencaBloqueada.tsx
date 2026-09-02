import { FC, useEffect, useState } from 'react'
import { QrCode, DatabaseBackup, Check } from 'lucide-react'
import logoEmpresa from './assets/logo.png'

const CONTATO_FHVP = '(85) 9.2187-1975'

type Suporte = {
  atendidoPor: 'fhvp' | 'revendedor'
  nome: string
  contato: string | null
  podeRenovarNoApp: boolean
}

type Props = {
  mensagemInicial: string
  // Subtítulo sob o logo — varia por nicho (ex.: "Sistema de Gestão Veterinária").
  subtitulo: string
  /**
   * Marca do nicho. Mesma ideia do `subtitulo`: cada app tem a sua arte, e esta
   * tela é compartilhada. Sem a prop, cai na marca original — que é o que o
   * varejo quer.
   */
  logo?: string
  onAtivar: (diasRestantes?: number) => void
  onRenovarComPix: () => void
}

const LicencaBloqueada: FC<Props> = ({
  mensagemInicial,
  subtitulo,
  logo,
  onAtivar,
  onRenovarComPix
}) => {
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState(mensagemInicial)
  const [carregando, setCarregando] = useState(false)
  const [temClienteSalvo, setTemClienteSalvo] = useState(false)
  const [suporte, setSuporte] = useState<Suporte | null>(null)
  const [salvandoCopia, setSalvandoCopia] = useState(false)
  const [copiaFeita, setCopiaFeita] = useState(false)
  const [erroCopia, setErroCopia] = useState('')

  // Se houver uma licença anterior salva (mesmo vencida), o clienteId pode
  // ser extraído e oferecemos a renovação direta por PIX. Sem licença prévia
  // (primeira instalação), só o caminho manual continua válido.
  useEffect(() => {
    window.api.licenca.obterClienteId().then((resp) => {
      if (resp.success && resp.data) setTemClienteSalvo(true)
    })
  }, [])

  // Quem atende esta loja. Offline devolve null e a tela segue com o texto da
  // FHVP — ver o comentário do canal `licenca:suporte`.
  useEffect(() => {
    window.api.licenca.suporte?.().then((resp) => {
      if (resp.success && resp.data) setSuporte(resp.data as Suporte)
    })
  }, [])

  /**
   * Salvar uma cópia dos dados, com o sistema bloqueado.
   *
   * ── Por que este botão existe ──────────────────────────────────────────────
   * Bloqueio nunca pode sequestrar o dado. Esta tela pode aparecer porque um
   * REVENDEDOR deixou de renovar a loja — decisão de um terceiro — e a marca
   * estampada aqui é a da FHVP. Sem uma saída, "o sistema trancou meu
   * movimento" vira problema da FHVP, e com razão: o movimento é do lojista, a
   * licença é que venceu.
   *
   * Fica DEPOIS dos caminhos de ativação de propósito. É saída de emergência,
   * não a ação principal — quem chegou aqui deveria primeiro tentar reativar.
   */
  const salvarCopia = async () => {
    setSalvandoCopia(true)
    setErroCopia('')
    const resp = await window.api.backup.fazerManual()
    setSalvandoCopia(false)
    if (resp.success) setCopiaFeita(true)
    else setErroCopia(resp.error)
  }

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
            src={logo ?? logoEmpresa}
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
            {suporte?.atendidoPor === 'revendedor' ? (
              <>
                Quem atende esta loja:{' '}
                <span className="font-semibold">{suporte.nome}</span>
                {suporte.contato && (
                  <>
                    {' — '}
                    <span className="font-semibold whitespace-nowrap">{suporte.contato}</span>
                  </>
                )}
              </>
            ) : (
              <>
                Suporte:{' '}
                <span className="font-semibold whitespace-nowrap">{CONTATO_FHVP}</span>
              </>
            )}
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

          {/* Renovar por PIX só aparece para quem a FHVP cobra direto. A loja de
              revendedor tem outro credor — mostrar o botão mandaria o dinheiro
              dela para a conta errada do ciclo.

              A condição é `!== false`, e não `=== true`, de propósito: sem
              resposta do backend (`null`) o comportamento continua o de hoje.
              Isso é seguro porque renovar por PIX exige internet de qualquer
              forma — se a consulta não chegou, o pagamento também não chegaria,
              e esconder o botão só tiraria a saída de quem é cliente direto. */}
          {temClienteSalvo && suporte?.podeRenovarNoApp !== false && (
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

        {/* Saída de emergência: os dados são do lojista, a licença é que venceu.
            Fica no rodapé, discreta, depois de todos os caminhos de reativação —
            é rede de segurança, não a ação que se espera dele aqui. */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          {copiaFeita ? (
            <p className="flex items-center justify-center gap-1.5 text-sm text-emerald-700">
              <Check className="w-4 h-4" />
              Cópia salva na pasta de backup configurada.
            </p>
          ) : (
            <>
              <button
                onClick={salvarCopia}
                disabled={salvandoCopia}
                className="w-full flex items-center justify-center gap-2 border border-slate-300 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <DatabaseBackup className="w-4 h-4" />
                {salvandoCopia ? 'Salvando cópia…' : 'Salvar uma cópia dos meus dados'}
              </button>
              <p className="text-center text-xs text-slate-400 mt-2">
                Seus dados continuam aqui e são seus. Você pode guardar uma cópia mesmo com o
                sistema bloqueado.
              </p>
            </>
          )}
          {erroCopia && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
              <p className="text-red-700 text-sm">{erroCopia}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Problemas? Entre em contato com{' '}
          <span className="font-semibold text-slate-600 whitespace-nowrap">
            {suporte?.atendidoPor === 'revendedor'
              ? (suporte.contato ?? suporte.nome)
              : CONTATO_FHVP}
          </span>
        </p>
      </div>
    </div>
  )
}

export default LicencaBloqueada

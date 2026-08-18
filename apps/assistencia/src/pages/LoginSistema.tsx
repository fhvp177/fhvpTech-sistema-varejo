import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Lock, ShieldCheck, Crown, User as UserIcon } from 'lucide-react'
import logoEmpresa from '@/assets/logo.png'
import ModalRecuperacaoPin from '@/components/ModalRecuperacaoPin'
import ModalConfigurarMaquina from '@/components/ModalConfigurarMaquina'
import { useFocoAoLiberar } from '@fhvptech/core/lib/useFocoAoLiberar'
import { deveMostrarRodapeDoLogin } from '@fhvptech/core/lib/rodapeDoLogin'

type VendedorLogin = {
  id: number
  nome: string
  papel: 'dono' | 'vendedor'
  tem_pin: number
  /** Dígitos do PIN desta pessoa; null enquanto o sistema ainda não sabe. */
  pin_tamanho: number | null
}

type Props = {
  onDesbloquear: () => void
}

const MAX_TENTATIVAS = 5
const SEGUNDOS_BLOQUEIO = 30

const LoginSistema: FC<Props> = ({ onDesbloquear }) => {
  const [vendedores, setVendedores] = useState<VendedorLogin[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [erroLista, setErroLista] = useState('')
  const [selecionado, setSelecionado] = useState<VendedorLogin | null>(null)
  const [pin, setPin] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [tentativas, setTentativas] = useState(0)
  const [segundosTravado, setSegundosTravado] = useState(0)
  const [mostrarRecuperacao, setMostrarRecuperacao] = useState(false)
  const [mostrarConfigurarMaquina, setMostrarConfigurarMaquina] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guarda o último PIN que a confirmação automática já enviou. Sem isto, uma
  // falha que NÃO limpa o campo (erro de sistema, não PIN errado) deixaria o
  // efeito reenviando o mesmo PIN em laço.
  const pinAutoEnviado = useRef<string | null>(null)

  useEffect(() => {
    carregarVendedores()
  }, [])

  // Auto-seleciona se houver apenas um vendedor — ninguém precisa "clicar em si mesmo".
  useEffect(() => {
    if (!carregandoLista && vendedores.length === 1 && !selecionado) {
      setSelecionado(vendedores[0])
    }
  }, [carregandoLista, vendedores, selecionado])

  // Mantém o cursor no campo do PIN — inclusive DEPOIS de errar, que é quando
  // ele se perdia. O porquê (e por que `focus()` dentro de `entrar()` não
  // resolve) está no próprio hook, junto com os outros lugares que sofriam do
  // mesmo problema.
  useFocoAoLiberar(
    inputRef,
    carregando || segundosTravado > 0,
    Boolean(selecionado) && !mostrarRecuperacao && !mostrarConfigurarMaquina,
    selecionado?.id
  )

  // Conta regressiva do bloqueio temporário após 5 erros
  useEffect(() => {
    if (segundosTravado <= 0) return
    const t = setTimeout(() => setSegundosTravado(segundosTravado - 1), 1000)
    return () => clearTimeout(t)
  }, [segundosTravado])

  const carregarVendedores = async () => {
    setCarregandoLista(true)
    setErroLista('')
    const resp = await window.api.auth.listarVendedoresParaLogin()
    setCarregandoLista(false)
    if (!resp.success) {
      setErroLista(resp.error)
      return
    }
    setVendedores(resp.data)
  }

  const modoCadastro = selecionado?.tem_pin === 0
  const sanitizar = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  const voltarParaLista = () => {
    setSelecionado(null)
    setPin('')
    setPinConfirmacao('')
    setErro('')
    setTentativas(0)
  }

  const cadastrarPrimeiroPin = async () => {
    if (!selecionado) return
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
    const respCadastro = await window.api.auth.cadastrarPinPrimeiroUso(selecionado.id, pin)
    if (!respCadastro.success) {
      setErro(respCadastro.error)
      setCarregando(false)
      return
    }
    // Logo após cadastrar, faz login direto pra desbloquear o sistema
    const respLogin = await window.api.auth.login(selecionado.id, pin)
    setCarregando(false)
    if (!respLogin.success || !respLogin.data.ok) {
      setErro(respLogin.success ? 'Falha ao entrar com o PIN recém-cadastrado.' : respLogin.error)
      return
    }
    onDesbloquear()
  }

  const entrar = async () => {
    if (!selecionado) return
    setErro('')
    if (segundosTravado > 0) return
    if (!/^\d{4,6}$/.test(pin)) {
      setErro('Digite seu PIN (4 a 6 dígitos).')
      return
    }
    setCarregando(true)
    const resp = await window.api.auth.login(selecionado.id, pin)
    setCarregando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    if (resp.data.ok) {
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
      const restantes = MAX_TENTATIVAS - novasTentativas
      setErro(`PIN incorreto. ${restantes} tentativa${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''}.`)
    }
    // O foco volta pelo efeito lá em cima, quando o campo deixa de estar
    // desabilitado. Chamar focus() aqui seria um no-op: neste ponto o React
    // ainda não repintou e o input segue `disabled`.
  }

  const acao = modoCadastro ? cadastrarPrimeiroPin : entrar
  const travado = segundosTravado > 0
  // Suporte e "Configurar este computador" aparecem juntos, pela mesma regra:
  // são a saída de quem não consegue entrar.
  const mostrarRodape = deveMostrarRodapeDoLogin({
    alguemSelecionado: Boolean(selecionado),
    totalDeContas: vendedores.length
  })

  /**
   * Confirma sozinho ao completar o PIN, como faz o Windows — sem Enter.
   *
   * Só funciona porque o sistema sabe QUANTOS dígitos o PIN desta pessoa tem
   * (ver migration 036). O PIN aqui vai de 4 a 6 dígitos: confirmar num tamanho
   * fixo arrancaria uma tentativa errada de quem tem PIN mais longo e, com o
   * bloqueio de 5 tentativas, o trancaria para fora do sistema.
   *
   * Quem ainda não tem tamanho conhecido (instalação anterior à 036) segue com
   * Enter até o primeiro login dar certo — é ele que ensina o tamanho.
   */
  useEffect(() => {
    const tamanho = selecionado?.pin_tamanho ?? 0
    // Editou o PIN: rearma, pra que uma nova digitação possa enviar de novo.
    if (pin.length < tamanho) pinAutoEnviado.current = null
    if (modoCadastro || tamanho < 4) return
    if (pin.length !== tamanho) return
    if (carregando || travado) return
    if (pinAutoEnviado.current === pin) return
    pinAutoEnviado.current = pin
    entrar()
    // `entrar` é recriada a cada render; incluí-la nas dependências criaria
    // laço. O gatilho é o PIN chegar no tamanho, e isso está coberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selecionado, modoCadastro, carregando, travado])
  const podeEnviar =
    !carregando && !travado && pin.length >= 4 && (!modoCadastro || pinConfirmacao.length >= 4)

  const conteudo = useMemo(() => {
    if (carregandoLista) {
      return <p className="text-center text-sm text-slate-500 py-8">Carregando...</p>
    }

    if (erroLista) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p className="font-semibold mb-1">Não foi possível carregar os técnicos</p>
          <p>{erroLista}</p>
        </div>
      )
    }

    if (vendedores.length === 0) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Nenhum técnico cadastrado. Entre em contato com o suporte.
        </div>
      )
    }

    if (!selecionado) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 text-center">Quem está entrando agora?</p>
          <ul className="space-y-2 max-h-80 overflow-y-auto -mr-1 pr-1">
            {vendedores.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelecionado(v)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition text-left"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                      v.papel === 'dono' ? 'bg-amber-500' : 'bg-slate-500'
                    }`}
                  >
                    {v.nome.trim().slice(0, 1).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.nome}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {v.papel === 'dono' ? (
                        <>
                          <Crown className="w-3 h-3" /> Gerente da loja
                        </>
                      ) : (
                        <>
                          <UserIcon className="w-3 h-3" /> Técnico
                        </>
                      )}
                      {v.tem_pin === 0 && (
                        <span className="ml-1 text-amber-600">· definir PIN no 1º acesso</span>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
              selecionado.papel === 'dono' ? 'bg-amber-500' : 'bg-slate-500'
            }`}
          >
            {selecionado.nome.trim().slice(0, 1).toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{selecionado.nome}</p>
            <p className="text-xs text-slate-500">
              {selecionado.papel === 'dono' ? 'Gerente da loja' : 'Técnico'}
            </p>
          </div>
          {vendedores.length > 1 && (
            <button
              onClick={voltarParaLista}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> trocar
            </button>
          )}
        </div>

        {modoCadastro && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            Defina seu PIN de acesso. Use de 4 a 6 dígitos, fácil de lembrar.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {modoCadastro ? 'Novo PIN (4 a 6 dígitos)' : 'PIN'}
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
              if (e.key === 'Escape' && vendedores.length > 1) voltarParaLista()
            }}
            disabled={carregando || travado}
            placeholder="••••"
            className="w-full border border-slate-300 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
          />
        </div>

        {modoCadastro && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirme o PIN</label>
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
          {carregando ? 'Validando...' : modoCadastro ? 'Definir PIN e entrar' : 'Entrar'}
        </button>

        {!modoCadastro && (
          <button
            onClick={() => setMostrarRecuperacao(true)}
            disabled={carregando}
            className="w-full text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            Esqueci meu PIN
          </button>
        )}
      </div>
    )
  }, [
    carregandoLista,
    erroLista,
    vendedores,
    selecionado,
    pin,
    pinConfirmacao,
    erro,
    carregando,
    travado,
    segundosTravado,
    modoCadastro,
    podeEnviar
  ])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <img src={logoEmpresa} alt="FHVP Tech" className="w-24 h-24 mx-auto mb-3 object-contain" />
          <div className="flex items-center justify-center gap-2 text-slate-700">
            {modoCadastro ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            <h1 className="text-lg font-semibold">
              {modoCadastro ? 'Configurar PIN de acesso' : 'Acesso ao sistema'}
            </h1>
          </div>
        </div>

        {conteudo}

        {/* O telefone do suporte é para quem NÃO consegue entrar, então ele
            também precisa sobreviver à loja de uma conta só — ver
            `deveMostrarRodapeDoLogin`. Na etapa do PIN o texto encurta: o
            "Esqueci meu PIN" já está logo acima, e repeti-lo aqui só faria a
            pessoa ler duas vezes a mesma saída. */}
        {mostrarRodape && (
          <p className="text-center text-xs text-slate-400 mt-6">
            {selecionado ? (
              'Precisa de ajuda? Fale com o suporte: '
            ) : (
              <>
                Esqueceu o PIN?{' '}
                <button
                  onClick={() => setMostrarRecuperacao(true)}
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Recupere por e-mail
                </button>{' '}
                ou fale com o suporte:{' '}
              </>
            )}
            <span className="font-semibold text-slate-600 whitespace-nowrap">
              (85) 9.2187-1975
            </span>
          </p>
        )}

        {/* Precisa estar ANTES do login: numa instalação nova ninguém sabe o PIN
            do técnico que veio junto, então não dá pra entrar e chegar às
            Configurações. Discreto de propósito — a loja com um caixa só nunca
            vai precisar disto. */}
        {__FEAT_MULTICAIXA__ && mostrarRodape && (
          <p className="text-center text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setMostrarConfigurarMaquina(true)}
              className="hover:text-slate-600 hover:underline"
            >
              Configurar este computador
            </button>
          </p>
        )}
      </div>

      {mostrarRecuperacao && (
        <ModalRecuperacaoPin
          onCancelar={() => setMostrarRecuperacao(false)}
          onSucesso={onDesbloquear}
        />
      )}

      {/* A flag precisa estar AQUI também, e não só no botão: enquanto houver
          uma referência ao componente, o bundler não consegue removê-lo do
          binário do Básico — ele ficaria escondido em vez de ausente. */}
      {__FEAT_MULTICAIXA__ && mostrarConfigurarMaquina && (
        <ModalConfigurarMaquina onFechar={() => setMostrarConfigurarMaquina(false)} />
      )}
    </div>
  )
}

export default LoginSistema

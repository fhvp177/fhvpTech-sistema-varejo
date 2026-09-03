import { createContext, FC, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import {
  Lock,
  LayoutDashboard,
  BarChart3,
  Package,
  Users,
  Truck,
  ShoppingCart,
  ClipboardList,
  CalendarCheck,
  Tags,
  Receipt,
  ReceiptText,
  HandCoins,
  Settings,
  FileText,
  DatabaseBackup,
  MessageCircle,
  QrCode,
  Crown,
  Calculator,
  ChevronDown,
  LogOut,
  LucideIcon
} from 'lucide-react'
import Fornecedores from './pages/Fornecedores'
import ContasPagar from './pages/ContasPagar'
import Emprestimos from './pages/Emprestimos'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Vendas from './pages/Vendas'
import OrdensServico from './pages/OrdensServico'
import Recibos from './pages/Recibos'
import PainelDiario from './pages/PainelDiario'
import Configuracoes from './pages/Configuracoes'
import Relatorios from './pages/Relatorios'
import TelaRestauracao from './pages/TelaRestauracao'
// A marca do nicho. As telas de licença e de relógio vêm do core, que é
// compartilhado com o varejo — por isso a arte vai por prop, e não por import
// lá dentro.
import logoAssistencia from '@/assets/logo.png'
import LicencaBloqueada from '@fhvptech/core/ui/LicencaBloqueada'
import RelogioIncorreto from '@fhvptech/core/ui/RelogioIncorreto'
import { bloqueioDeRelogio, type BloqueioRelogio } from '@fhvptech/core/lib/relogioBloqueio'
import LoginSistema from './pages/LoginSistema'
import ModalCadastrarEmailDono from './components/ModalCadastrarEmailDono'
import IndicadorBackupAtivo from './components/backup/IndicadorBackupAtivo'
import AlertaBackupFalhando from './components/backup/AlertaBackupFalhando'
import AvisoSemConexao from './components/AvisoSemConexao'
import TelaSemCaixaPrincipal from './components/TelaSemCaixaPrincipal'
import DialogoBackupAoFechar from './components/backup/DialogoBackupAoFechar'
import ModalAtualizacaoDisponivel from './components/ModalAtualizacaoDisponivel'
import ModalPagamentoPix from '@fhvptech/core/ui/ModalPagamentoPix'
import ErrorBoundary from './components/ErrorBoundary'
import DashboardSkeleton from './components/DashboardSkeleton'
import RotaSomenteDono from './components/RotaSomenteDono'
import GuiaBoasVindas from '@fhvptech/core/ui/GuiaBoasVindas'
import TourGuiado, { type PassoTour } from '@fhvptech/core/ui/TourGuiado'
import { construirPassosTour } from './data/passosTour'
import ChecklistPrimeirosPassos, { type EstadoOnboarding } from './components/ChecklistPrimeirosPassos'
import { construirSlidesGuia } from './data/slidesGuia'
import NovidadesModal, { type ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'
import { NOVIDADES, novidadesParaMostrar } from './data/novidades'
import SinoNotificacoesHost from './components/SinoNotificacoesHost'
import { ToastProvider, useToast } from '@fhvptech/core/ui/toast'
import { ConfirmProvider } from '@fhvptech/core/ui/confirm'
import { ImpressaoProvider } from './components/ImpressaoProvider'
import { useAutoLock } from './hooks/useAutoLock'

// Features opcionais carregadas sob demanda e gateadas por edição (build-time).
// Quando a flag é `false`, o `lazy(import())` vira `null` e o bundler remove o
// chunk e suas libs exclusivas do binário (ex.: recharts sai junto do Dashboard).
const Dashboard = __FEAT_DASHBOARD__ ? lazy(() => import('./pages/Dashboard')) : null
const EtiquetasA4 = __FEAT_ETIQUETAS__ ? lazy(() => import('./pages/EtiquetasA4')) : null
const ChatAssistente = __FEAT_CHATBOT__ ? lazy(() => import('./components/ChatAssistente')) : null
const ConfiguracaoFiscal = __FEAT_NFE__ ? lazy(() => import('./pages/ConfiguracaoFiscal')) : null
// Calculadora do balcão — existe em todos os planos (é ferramenta de operação,
// não de plano). Carregada sob demanda: só entra na memória se for aberta.
const Calculadora = lazy(() => import('./components/Calculadora'))

const FallbackCarregando: FC = () => (
  <div className="flex-1 flex items-center justify-center p-8">
    <p className="text-sm text-muted-foreground">Carregando…</p>
  </div>
)

type EstadoLicenca = 'verificando' | 'valida' | 'invalida' | 'relogio'
type EstadoAuth = 'verificando' | 'bloqueado' | 'desbloqueado'

export type SessaoVendedor = {
  id: number
  nome: string
  ativo: number
  papel: 'dono' | 'vendedor'
  email: string | null
  tem_pin: number
  vendas_count: number
}

// Permite que a tela do PDV oculte a barra lateral enquanto está ativa,
// liberando a tela inteira para a operação de venda.
type PdvModeCtx = { ativo: boolean; setAtivo: (v: boolean) => void }
const PdvModeContext = createContext<PdvModeCtx>({ ativo: false, setAtivo: () => {} })
export const usePdvMode = () => useContext(PdvModeContext)

// Expõe a função "bloquear agora" para qualquer página acessar
// (Configurações usa para deslogar o usuário após mudar o PIN).
type LockCtx = { bloquear: () => void; autoLockMinutos: number; setAutoLockMinutos: (m: number) => void }
const LockContext = createContext<LockCtx>({ bloquear: () => {}, autoLockMinutos: 15, setAutoLockMinutos: () => {} })
export const useLock = () => useContext(LockContext)

// Quem está logado agora. ehDono é o atalho usado em quase toda regra de
// permissão; recarregar permite atualizar após alterar email/PIN.
type SessaoCtx = {
  vendedor: SessaoVendedor | null
  ehDono: boolean
  recarregar: () => Promise<SessaoVendedor | null>
}
const SessaoContext = createContext<SessaoCtx>({
  vendedor: null,
  ehDono: false,
  recarregar: async () => null
})
export const useSessao = () => useContext(SessaoContext)

// Permite que Configurações reabra o guia de boas-vindas ("Ver tutorial novamente").
type OnboardingCtx = { abrirGuia: () => void }
const OnboardingContext = createContext<OnboardingCtx>({ abrirGuia: () => {} })
export const useOnboarding = () => useContext(OnboardingContext)

// Permite que Configurações reabra as novidades da versão atual ("Ver novidades").
type NovidadesCtx = { abrirNovidades: () => void }
const NovidadesContext = createContext<NovidadesCtx>({ abrirNovidades: () => {} })

// Permite que Configurações reinicie o tour guiado pelas telas ("Refazer tour").
type TourCtx = { abrirTour: () => void }
const TourContext = createContext<TourCtx>({ abrirTour: () => {} })
export const useTour = () => useContext(TourContext)

// Calculadora do balcão. O estado vive aqui porque a janela é global — flutua
// por cima de qualquer tela, inclusive do PDV. O PDV precisa poder LER se ela
// está aberta: lá o Esc sai do caixa, e quem aperta Esc pra limpar o visor da
// calculadora não quer perder a venda.
type CalculadoraCtx = { aberta: boolean; alternar: () => void }
const CalculadoraContext = createContext<CalculadoraCtx>({ aberta: false, alternar: () => {} })
export const useCalculadora = () => useContext(CalculadoraContext)

// Módulos OPCIONAIS — funcionalidades que existem no binário mas só aparecem em
// quem contratou. Diferente das flags __FEAT_*, que são decididas na hora de
// gerar o instalador e valem pra edição inteira, este interruptor é POR LOJA e
// pode ser ligado no próprio app, em Configurações.
//
// Por que assim: Empréstimos nasceu de um pedido de UM cliente. Uma edição de
// build só pra ele viraria um terceiro canal de atualização publicado em toda
// release, pra sempre; uma capacidade na chave de licença mexeria no
// licenciador. O interruptor por loja custa quase nada e mantém o ponto de
// decisão num lugar só — se um dia virar item de plano, é aqui que a resposta
// passa a vir da flag de build ou da licença, sem tocar no módulo.
type ModulosCtx = { emprestimos: boolean; recarregar: () => Promise<void> }
const ModulosContext = createContext<ModulosCtx>({
  emprestimos: false,
  recarregar: async () => {}
})
export const useModulos = () => useContext(ModulosContext)
export const useNovidades = () => useContext(NovidadesContext)

// MemoryRouter é necessário no Electron: não existe servidor HTTP nem hash routing
const App: FC = () => {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  // Bloqueio por data errada — tela própria, não é problema de licença.
  const [relogio, setRelogio] = useState<BloqueioRelogio | null>(null)
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [avisoLicenca, setAvisoLicenca] = useState<string | null>(null)
  const [pdvAtivo, setPdvAtivo] = useState(false)
  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  // Caixa adicional que não conseguiu falar com o computador principal ao abrir.
  const [falhaCaixaPrincipal, setFalhaCaixaPrincipal] = useState<string | null>(null)
  const [tentativaCaixaPrincipal, setTentativaCaixaPrincipal] = useState(0)
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)
  const [mostrarPagamento, setMostrarPagamento] = useState(false)
  const [vendedor, setVendedor] = useState<SessaoVendedor | null>(null)
  // Gerente adiou o cadastro de email de recuperação — esconde só nesta sessão.
  const [pulouEmailDono, setPulouEmailDono] = useState(false)
  // Onboarding (tutorial de primeira abertura): estado do banco + guia aberto.
  const [onboarding, setOnboarding] = useState<EstadoOnboarding | null>(null)
  const [guiaAberto, setGuiaAberto] = useState(false)
  const [calculadoraAberta, setCalculadoraAberta] = useState(false)
  const slidesGuia = useMemo(() => construirSlidesGuia(), [])
  // Módulos opcionais ligados nesta loja (ver ModulosContext).
  const [emprestimosAtivo, setEmprestimosAtivo] = useState(false)
  // "O que há de novo" — destaques exibidos uma vez após uma atualização.
  const [novidades, setNovidades] = useState<{ versao: string; itens: ItemNovidade[] } | null>(null)
  const novidadesChecadas = useRef(false)

  const validarLicenca = useCallback(async (): Promise<void> => {
    const resp = await window.api.licenca.validar()
    if (resp.success) {
      const status = resp.data
      const bloqueio = bloqueioDeRelogio(status)
      setMensagemLicenca(status.mensagem)
      setRelogio(bloqueio)
      setEstadoLicenca(status.valida ? 'valida' : bloqueio ? 'relogio' : 'invalida')
      setDiasRestantes(
        status.valida && status.diasRestantes !== undefined ? status.diasRestantes : null
      )
      if (status.valida && status.aviso) setAvisoLicenca(status.aviso)
    } else {
      setMensagemLicenca(resp.error)
      setEstadoLicenca('invalida')
    }
  }, [])

  useEffect(() => {
    validarLicenca()
  }, [validarLicenca])

  const abrirPagamento = useCallback(() => setMostrarPagamento(true), [])
  const fecharPagamento = useCallback(() => setMostrarPagamento(false), [])
  const aoRenovar = useCallback(async () => {
    await validarLicenca()
  }, [validarLicenca])

  const recarregarSessao = useCallback(async (): Promise<SessaoVendedor | null> => {
    const resp = await window.api.auth.sessaoAtual()
    const v = resp.success ? resp.data : null
    setVendedor(v)
    return v
  }, [])

  // Verifica status de auth + sessão depois que a licença passa
  useEffect(() => {
    if (estadoLicenca !== 'valida') return
    ;(async () => {
      try {
        const respStatus = await window.api.auth.obterStatus()
        if (respStatus.success) {
          setAutoLockMinutos(respStatus.data.autoLockMinutos)
        }
        const sessao = await recarregarSessao()
        setFalhaCaixaPrincipal(null)
        setEstadoAuth(sessao ? 'desbloqueado' : 'bloqueado')
      } catch (erro) {
        // Num caixa adicional estas duas perguntas vão pela rede até o
        // computador principal. Sem ele, elas LANÇAM — e sem este catch o
        // estado nunca saía de "verificando", deixando a tela presa sem dizer
        // por quê e, se o caixa tivesse sido removido, sem nenhuma saída.
        setFalhaCaixaPrincipal((erro as Error).message || 'Sem conexão com o caixa principal.')
      }
    })()
  }, [estadoLicenca, recarregarSessao, tentativaCaixaPrincipal])

  // ── Onboarding ──────────────────────────────────────────────────────────────
  // Relê o estado do tutorial. Em caso de falha, assume "tudo visto" (fail-safe:
  // não bloqueia o modal de email nem mostra guia/checklist por engano).
  const recarregarOnboarding = useCallback(async () => {
    const resp = await window.api.onboarding.estado()
    setOnboarding(
      resp.success
        ? resp.data
        : {
            guiaVisto: true,
            checklistDispensada: true,
            progresso: { temProduto: false, temCliente: false, temVenda: false, lojaConfigurada: false }
          }
    )
  }, [])

  // Carrega o estado do onboarding quando o DONO desbloqueia (só ele vê o tutorial).
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado' || vendedor?.papel !== 'dono') {
      setOnboarding(null)
      return
    }
    recarregarOnboarding()
  }, [estadoAuth, vendedor, recarregarOnboarding])

  // Quais módulos opcionais esta loja usa. Vale pra qualquer papel: o menu é
  // montado antes de saber quem entrou, e a resposta ("esta loja usa
  // empréstimos") não conta nada sobre ninguém — quem protege o conteúdo é o
  // requerDono() de cada canal.
  const recarregarModulos = useCallback(async () => {
    const resp = await window.api.emprestimos.moduloAtivo()
    setEmprestimosAtivo(resp.success ? resp.data === true : false)
  }, [])

  useEffect(() => {
    if (estadoAuth !== 'desbloqueado') return
    recarregarModulos()
  }, [estadoAuth, recarregarModulos])

  const modulos = useMemo<ModulosCtx>(
    () => ({ emprestimos: emprestimosAtivo, recarregar: recarregarModulos }),
    [emprestimosAtivo, recarregarModulos]
  )

  // Primeira abertura do gerente → abre o guia antes de tudo.
  useEffect(() => {
    if (onboarding && vendedor?.papel === 'dono' && !onboarding.guiaVisto) {
      setGuiaAberto(true)
    }
  }, [onboarding, vendedor?.papel])

  // Tour guiado pelas telas reais (holofote + balão). Passos != null = tour rodando.
  const [tourPassos, setTourPassos] = useState<PassoTour[] | null>(null)
  const iniciarTour = useCallback((ehDonoTour: boolean) => {
    setPdvAtivo(false) // o tour navega pelas telas; o modo PDV esconderia o menu
    setTourPassos(construirPassosTour(ehDonoTour))
  }, [])
  const fecharTour = useCallback(() => setTourPassos(null), [])
  const abrirTour = useCallback(() => iniciarTour(true), [iniciarTour])

  const fecharGuia = useCallback(async () => {
    // Primeira abertura de verdade (não um replay)? Emenda o tour pelas telas
    // logo depois do carrossel — o gerente novo sai sabendo ONDE cada coisa mora.
    const primeiraVez = onboarding ? !onboarding.guiaVisto : false
    setGuiaAberto(false)
    await window.api.onboarding.marcarGuiaVisto()
    recarregarOnboarding()
    if (primeiraVez) iniciarTour(true)
  }, [recarregarOnboarding, onboarding, iniciarTour])

  // Vendedor entrou pela primeira vez nesta máquina → tour enxuto do dia a dia.
  // Flag em localStorage (é só UI): marcada já no início pra nunca insistir.
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado' || !vendedor || vendedor.papel === 'dono' || guiaAberto) return
    // ⚠️ NÃO no meio de uma venda. Desde que o caixa ganhou "trocar de conta"
    // (F7), o primeiro acesso de um atendente pode acontecer com o carrinho
    // cheio: o colega chama, ele entra no próprio nome pra venda sair certa, e
    // o tour navegava pra outra tela, desmontando o PDV e levando o carrinho.
    // Acontece uma vez por pessoa, na primeira venda dela, na frente do cliente.
    //
    // Sair antes de gravar a flag ADIA o tour em vez de cancelá-lo: ele aparece
    // no próximo login dessa pessoa fora do caixa, que é onde ele serve.
    if (pdvAtivo) return
    const chave = `fhvp-tour-visto-vendedor-${vendedor.id}`
    if (localStorage.getItem(chave)) return
    localStorage.setItem(chave, '1')
    iniciarTour(false)
  }, [estadoAuth, vendedor, guiaAberto, iniciarTour, pdvAtivo])

  const abrirGuia = useCallback(() => setGuiaAberto(true), [])

  const dispensarChecklist = useCallback(async () => {
    await window.api.onboarding.dispensarChecklist()
    recarregarOnboarding()
  }, [recarregarOnboarding])

  // Mostra as novidades uma vez após uma atualização (qualquer usuário, ao
  // desbloquear). Instalação nova NÃO vê — só quem atualizou.
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado' || novidadesChecadas.current) return
    novidadesChecadas.current = true
    ;(async () => {
      const resp = await window.api.novidades.estado()
      if (!resp.success) return
      const atual = __APP_VERSION__
      const { ultimaVersaoVista, guiaVisto } = resp.data
      const releases = ultimaVersaoVista
        ? novidadesParaMostrar(ultimaVersaoVista, atual)
        : // Estreia do recurso: cliente antigo (já viu o tutorial) vê a versão
          // atual; instalação nova não mostra nada.
          guiaVisto
          ? NOVIDADES.filter((n) => n.versao === atual)
          : []
      const itens = releases.flatMap((r) => r.itens)
      if (itens.length > 0) setNovidades({ versao: atual, itens })
      else window.api.novidades.marcar(atual) // nada a mostrar → fixa o baseline
    })()
  }, [estadoAuth])

  const fecharNovidades = useCallback(() => {
    setNovidades(null)
    window.api.novidades.marcar(__APP_VERSION__)
  }, [])

  // "Ver novidades" em Configurações: reabre os destaques da versão atual.
  const abrirNovidades = useCallback(() => {
    const atual = __APP_VERSION__
    const release = NOVIDADES.find((n) => n.versao === atual) ?? NOVIDADES[0]
    if (release) setNovidades({ versao: release.versao, itens: release.itens })
  }, [])

  const bloquear = useCallback(() => {
    // logout é fire-and-forget — a UI já some, e o resultado não bloqueia
    window.api.auth.logout().catch(() => {})
    setVendedor(null)
    setEstadoAuth((prev) => (prev === 'desbloqueado' ? 'bloqueado' : prev))
  }, [])

  const aoLogar = useCallback(async () => {
    await recarregarSessao()
    setEstadoAuth('desbloqueado')
  }, [recarregarSessao])

  // Atalho global Ctrl+L bloqueia o sistema imediatamente
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado') return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        bloquear()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [estadoAuth, bloquear])

  // Atalho global F10 abre/fecha a calculadora. Fica aqui, e não no PDV, porque
  // a calculadora serve a tela toda — mas é no PDV que ele faz mais falta: lá a
  // barra lateral (e com ela o botão da calculadora) some.
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F10' || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()
      setCalculadoraAberta((v) => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [estadoAuth])

  // Auto-lock por inatividade — só roda quando desbloqueado e tempo > 0
  useAutoLock(estadoAuth === 'desbloqueado' ? autoLockMinutos : 0, bloquear)

  if (estadoLicenca === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando licença...</p>
      </div>
    )
  }

  if (estadoLicenca === 'relogio' && relogio) {
    return (
      <RelogioIncorreto
        {...relogio}
        subtitulo="Sistema de Gestão de Assistência Técnica"
        logo={logoAssistencia}
        onTentarNovamente={validarLicenca}
      />
    )
  }

  // Qualquer estado que não seja 'valida' cai aqui — 'verificando' e 'relogio'
  // já retornaram acima. Testar por diferença, e não por igualdade a
  // 'invalida', garante que um estado novo nunca escorra para dentro do app.
  if (estadoLicenca !== 'valida') {
    return (
      <>
        <LicencaBloqueada
          mensagemInicial={mensagemLicenca}
          subtitulo="Sistema de Gestão de Assistência Técnica"
          logo={logoAssistencia}
          onAtivar={(dias) => { setEstadoLicenca('valida'); if (dias !== undefined) setDiasRestantes(dias) }}
          onRenovarComPix={abrirPagamento}
        />
        <ModalPagamentoPix
          aberto={mostrarPagamento}
          onClose={fecharPagamento}
          onLicencaRenovada={aoRenovar}
        />
      </>
    )
  }

  // Vem ANTES do "verificando": é exatamente o estado em que o caixa adicional
  // ficava preso, e agora ele explica o motivo e oferece saída.
  if (__FEAT_MULTICAIXA__ && falhaCaixaPrincipal !== null) {
    return (
      <TelaSemCaixaPrincipal
        motivo={falhaCaixaPrincipal}
        onTentarNovamente={() => setTentativaCaixaPrincipal((n) => n + 1)}
      />
    )
  }

  if (estadoAuth === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando acesso...</p>
      </div>
    )
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
      <ImpressaoProvider>
      <ToastInicial aviso={avisoLicenca} onMostrado={() => setAvisoLicenca(null)} />
      <SessaoContext.Provider
        value={{ vendedor, ehDono: vendedor?.papel === 'dono', recarregar: recarregarSessao }}
      >
       <OnboardingContext.Provider value={{ abrirGuia }}>
        <NovidadesContext.Provider value={{ abrirNovidades }}>
        <TourContext.Provider value={{ abrirTour }}>
        <LockContext.Provider value={{ bloquear, autoLockMinutos, setAutoLockMinutos }}>
          <PdvModeContext.Provider value={{ ativo: pdvAtivo, setAtivo: setPdvAtivo }}>
           <CalculadoraContext.Provider
             value={{ aberta: calculadoraAberta, alternar: () => setCalculadoraAberta((v) => !v) }}
           >
            <ModulosContext.Provider value={modulos}>
            <MemoryRouter>
              <div className="flex h-screen bg-background">
                {!pdvAtivo && (
                  <Sidebar
                    diasRestantes={diasRestantes}
                    onBloquear={bloquear}
                    onAbrirCalculadora={() => setCalculadoraAberta((v) => !v)}
                    onRenovarComPix={abrirPagamento}
                    vendedor={vendedor}
                    modulos={modulos}
                  />
                )}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Aparece inclusive com o PDV aberto, ao contrário dos
                      demais avisos: é justamente durante a venda que perder o
                      caixa principal precisa ficar visível. */}
                  <AvisoSemConexao />
                  {!pdvAtivo && <AlertaBackupFalhando />}
                  {!pdvAtivo && vendedor?.papel === 'dono' && (
                    <div className="h-12 shrink-0 border-b bg-background flex items-center justify-end px-6">
                      <span data-tour="sino">
                        <SinoNotificacoesHost onRenovarComPix={abrirPagamento} />
                      </span>
                    </div>
                  )}
                  <main className={`flex-1 overflow-auto ${pdvAtivo ? '' : 'pb-24'}`}>
                    <ChecklistPrimeirosPassos
                      estado={onboarding}
                      ehDono={vendedor?.papel === 'dono'}
                      pdvAtivo={pdvAtivo}
                      onRecarregar={recarregarOnboarding}
                      onDispensar={dispensarChecklist}
                    />
                    <Routes>
                      {/* A raiz não desenha tela: ela ENCAMINHA conforme o papel.
                          O gerente cai na Dashboard (a leitura do negócio); o
                          técnico cai no Painel Diário (a fila de trabalho dele).
                          Mandar todo mundo pra Dashboard daria ao técnico uma tela
                          de cadeado como primeira coisa do dia — ela é somenteDono. */}
                      <Route
                        path="/"
                        element={
                          // ⚠️ Espera a sessão chegar antes de decidir. O
                          // <Navigate> resolve UMA vez, na montagem, e com
                          // `replace` não há volta: decidir com `vendedor`
                          // ainda nulo mandaria o gerente pro Painel Diário e
                          // ele ficaria lá, porque a rota '/' já teria saído do
                          // histórico.
                          vendedor === null ? (
                            <FallbackCarregando />
                          ) : (
                            <Navigate
                              to={vendedor.papel === 'dono' && Dashboard ? '/dashboard' : '/painel'}
                              replace
                            />
                          )
                        }
                      />
                      <Route path="/painel" element={<PainelDiario />} />
                      {Dashboard && (
                        <Route
                          path="/dashboard"
                          element={
                            <RotaSomenteDono titulo="Dashboard">
                              <Suspense fallback={<DashboardSkeleton />}>
                                <Dashboard />
                              </Suspense>
                            </RotaSomenteDono>
                          }
                        />
                      )}
                      <Route path="/fornecedores" element={<Fornecedores />} />
                      <Route
                        path="/contas-pagar"
                        element={
                          <RotaSomenteDono titulo="Contas a Pagar">
                            <ContasPagar />
                          </RotaSomenteDono>
                        }
                      />
                      {/* Módulo opcional: a rota só existe onde a loja ligou.
                          Sem isso, quem soubesse o caminho chegaria numa tela
                          vazia e confusa — e o backend recusaria tudo. */}
                      {modulos.emprestimos && (
                        <Route
                          path="/emprestimos"
                          element={
                            <RotaSomenteDono titulo="Empréstimos">
                              <Emprestimos />
                            </RotaSomenteDono>
                          }
                        />
                      )}
                      <Route path="/produtos" element={<Produtos />} />
                      <Route path="/clientes" element={<Clientes />} />
                      <Route path="/vendas" element={<Vendas />} />
                      <Route path="/os" element={<OrdensServico />} />
                      <Route path="/recibos" element={<Recibos />} />
                      {EtiquetasA4 && (
                        <Route
                          path="/etiquetas"
                          element={
                            <Suspense fallback={<FallbackCarregando />}>
                              <EtiquetasA4 />
                            </Suspense>
                          }
                        />
                      )}
                      <Route
                        path="/relatorios"
                        element={
                          <RotaSomenteDono titulo="Relatórios">
                            <Relatorios />
                          </RotaSomenteDono>
                        }
                      />
                      {ConfiguracaoFiscal && (
                        <Route
                          path="/fiscal"
                          element={
                            <RotaSomenteDono titulo="Nota fiscal">
                              <Suspense fallback={<FallbackCarregando />}>
                                <ConfiguracaoFiscal />
                              </Suspense>
                            </RotaSomenteDono>
                          }
                        />
                      )}
                      <Route
                        path="/configuracoes"
                        element={
                          <RotaSomenteDono titulo="Configurações">
                            <Configuracoes />
                          </RotaSomenteDono>
                        }
                      />
                      <Route
                        path="/restauracao"
                        element={
                          <RotaSomenteDono titulo="Restauração">
                            <TelaRestauracao />
                          </RotaSomenteDono>
                        }
                      />
                    </Routes>
                  </main>
                </div>
              </div>
              <IndicadorBackupAtivo />
              {tourPassos && estadoAuth === 'desbloqueado' && !guiaAberto && (
                <TourHost passos={tourPassos} onFechar={fecharTour} />
              )}
              {vendedor && (
                <Suspense fallback={null}>
                  <Calculadora
                    aberta={calculadoraAberta}
                    onFechar={() => setCalculadoraAberta(false)}
                  />
                </Suspense>
              )}
              {ChatAssistente && vendedor && !pdvAtivo && (
                <ErrorBoundary rotulo="ChatAssistente">
                  <Suspense fallback={null}>
                    <ChatAssistente />
                  </Suspense>
                </ErrorBoundary>
              )}
              <DialogoBackupAoFechar />
              <ModalAtualizacaoDisponivel />
              <ModalPagamentoPix
                aberto={mostrarPagamento}
                onClose={fecharPagamento}
                onLicencaRenovada={aoRenovar}
              />
            </MemoryRouter>
            </ModulosContext.Provider>
           </CalculadoraContext.Provider>
          </PdvModeContext.Provider>
        </LockContext.Provider>
        </TourContext.Provider>
        </NovidadesContext.Provider>
       </OnboardingContext.Provider>
      </SessaoContext.Provider>
      {estadoAuth === 'bloqueado' && <LoginSistema onDesbloquear={aoLogar} />}
      {guiaAberto && estadoAuth === 'desbloqueado' && (
        <GuiaBoasVindas slides={slidesGuia} onConcluir={fecharGuia} />
      )}
      {novidades && !guiaAberto && estadoAuth === 'desbloqueado' && (
        <NovidadesModal
          versao={novidades.versao}
          itens={novidades.itens}
          onFechar={fecharNovidades}
        />
      )}
      {estadoAuth === 'desbloqueado' &&
        vendedor?.papel === 'dono' &&
        !vendedor.email &&
        !pulouEmailDono &&
        !guiaAberto &&
        (onboarding?.guiaVisto ?? false) && (
          <ModalCadastrarEmailDono
            vendedorId={vendedor.id}
            onSalvo={() => {
              recarregarSessao()
            }}
            onPular={() => setPulouEmailDono(true)}
          />
        )}
      </ImpressaoProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

// Exibe um toast assim que `aviso` muda para uma string. Precisa viver dentro do
// ToastProvider, por isso é um componente filho separado. O ref garante que o
// mesmo aviso não dispare dois toasts — necessário por causa do double-invoke
// de useEffect no React.StrictMode em dev.
const ToastInicial: FC<{ aviso: string | null; onMostrado: () => void }> = ({
  aviso,
  onMostrado
}) => {
  const { showToast } = useToast()
  const ultimoMostrado = useRef<string | null>(null)
  useEffect(() => {
    if (aviso && ultimoMostrado.current !== aviso) {
      ultimoMostrado.current = aviso
      showToast({ message: aviso, variant: 'destructive', durationMs: 15000 })
      onMostrado()
    }
  }, [aviso, showToast, onMostrado])
  return null
}

type ItemSidebar = {
  to: string
  label: string
  icon: LucideIcon
  somenteDono?: boolean
  /** Módulo opcional que precisa estar ligado nesta loja pro item existir. */
  requerModulo?: keyof Omit<ModulosCtx, 'recarregar'>
}
const CATEGORIAS_SIDEBAR: { titulo: string; itens: ItemSidebar[] }[] = [
  {
    titulo: 'Visão geral',
    itens: [
      // A Dashboard abre primeiro pra quem é gerente. O técnico não tem acesso a
      // ela (somenteDono), e por isso o '/' o encaminha direto ao Painel Diário —
      // senão ele começaria o dia numa tela de cadeado.
      ...(__FEAT_DASHBOARD__
        ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, somenteDono: true }]
        : []),
      { to: '/painel', label: 'Painel Diário', icon: CalendarCheck },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, somenteDono: true }
    ]
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: '/produtos', label: 'Produtos e Serviços', icon: Package },
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/fornecedores', label: 'Fornecedores', icon: Truck }
    ]
  },
  {
    titulo: 'Operação',
    itens: [
      { to: '/os', label: 'Ordens de Serviço', icon: ClipboardList },
      { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
      ...(__FEAT_ETIQUETAS__
        ? [{ to: '/etiquetas', label: 'Etiquetas A4', icon: Tags }]
        : [])
    ]
  },
  {
    titulo: 'Financeiro',
    itens: [
      { to: '/contas-pagar', label: 'Contas a Pagar', icon: Receipt, somenteDono: true },
      // Módulo opcional — só aparece na loja que ligou (ver ModulosContext).
      {
        to: '/emprestimos',
        label: 'Empréstimos',
        icon: HandCoins,
        somenteDono: true,
        requerModulo: 'emprestimos'
      },
      // Recibo é do balcão, não só do dono: quem recebe o dinheiro é quem
      // precisa entregar o papel na hora.
      { to: '/recibos', label: 'Recibos', icon: ReceiptText }
    ]
  },
  {
    titulo: 'Sistema',
    itens: [
      // Só existe no plano Pro; no Básico a flag remove o item e o chunk.
      ...(__FEAT_NFE__
        ? [{ to: '/fiscal', label: 'Nota fiscal', icon: FileText, somenteDono: true }]
        : []),
      { to: '/configuracoes', label: 'Configurações', icon: Settings, somenteDono: true },
      { to: '/restauracao', label: 'Restauração', icon: DatabaseBackup, somenteDono: true }
    ]
  }
]

const URL_SUPORTE_WHATSAPP = `https://wa.me/5585921871975?text=${encodeURIComponent(
  `Olá, sou usuário do Sistema FHVP Tech (versão ${__APP_VERSION__}) e preciso de suporte.`
)}`

const UserMenu: FC<{ vendedor: SessaoVendedor; onSair: () => void }> = ({
  vendedor,
  onSair
}) => {
  const [aberto, setAberto] = useState(false)
  const inicial = vendedor.nome.trim().slice(0, 1).toUpperCase() || '?'
  const ehDono = vendedor.papel === 'dono'
  return (
    <div className="bg-slate-800/60 rounded-lg p-3 mb-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-2.5 text-left"
        title={aberto ? 'Recolher menu' : 'Abrir menu'}
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${
            ehDono ? 'bg-amber-500' : 'bg-slate-500'
          }`}
        >
          {inicial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate" title={vendedor.nome}>
            {vendedor.nome}
          </p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            {ehDono ? (
              <>
                <Crown className="w-3 h-3 text-amber-400" /> Gerente
              </>
            ) : (
              'Técnico'
            )}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>
      {vendedor.email && (
        <p className="text-[11px] text-slate-400 mt-1.5 truncate" title={vendedor.email}>
          {vendedor.email}
        </p>
      )}
      {aberto && (
        <button
          onClick={onSair}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-900 rounded px-2 py-1.5 transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Sair
        </button>
      )}
    </div>
  )
}

// O motor do tour precisa navegar entre rotas — por isso este host vive DENTRO
// do MemoryRouter e injeta o navigate no componente genérico do core.
const TourHost: FC<{ passos: PassoTour[]; onFechar: () => void }> = ({ passos, onFechar }) => {
  const navigate = useNavigate()
  return <TourGuiado passos={passos} onNavegar={navigate} onFechar={onFechar} />
}

const Sidebar: FC<{
  diasRestantes: number | null
  onBloquear: () => void
  onRenovarComPix: () => void
  onAbrirCalculadora: () => void
  vendedor: SessaoVendedor | null
  modulos: ModulosCtx
}> = ({ diasRestantes, onBloquear, onRenovarComPix, onAbrirCalculadora, vendedor, modulos }) => (
  <nav data-tour="menu" className="w-56 bg-slate-900 text-white flex flex-col p-4 shrink-0">
    <div className="mb-4">
      <h1 className="text-lg font-bold text-white">FHVP Tech</h1>
      <p className="text-xs text-slate-400">Sistema de Gestão de Assistência Técnica</p>
    </div>

    {vendedor && <UserMenu vendedor={vendedor} onSair={onBloquear} />}

    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-4">
      {CATEGORIAS_SIDEBAR.map((cat) => {
        // Módulo desligado não vira item bloqueado com cadeado: ele simplesmente
        // não existe pra essa loja. Cadeado sugere "peça acesso"; ausência é o
        // recado certo.
        const itens = cat.itens.filter((i) => !i.requerModulo || modulos[i.requerModulo])
        if (itens.length === 0) return null
        return (
        <div key={cat.titulo}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-1">
            {cat.titulo}
          </p>
          <div className="flex flex-col gap-1">
            {itens.map(({ to, label, icon: Icon, somenteDono }) => {
              const bloqueado = somenteDono && vendedor?.papel !== 'dono'
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={bloqueado ? 'Restrito ao gerente' : undefined}
                  className={({ isActive }) =>
                    // A borda de 2px existe em TODOS os estados, transparente
                    // quando o item não está ativo. Se ela só aparecesse no
                    // ativo, o texto pularia 2px pro lado a cada troca de tela.
                    // `blue` aqui não é azul: cada app remapeia a escala no seu
                    // tailwind.config (petróleo na assistência, azul no varejo),
                    // então a mesma classe sai certa nos dois.
                    `anim-gatilho flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border-l-2 border-transparent ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-300 border-blue-300 font-medium'
                        : bloqueado
                          ? 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-400'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="anim-alvo-acena w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {bloqueado && <Lock className="w-3 h-3 shrink-0 text-amber-500/80" />}
                </NavLink>
              )
            })}
          </div>
        </div>
        )
      })}
    </div>

    <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
      {diasRestantes !== null && diasRestantes <= 3 && (
        <div className="bg-amber-500/15 border border-amber-500/30 rounded-lg p-2.5">
          <p className="text-amber-400 text-xs font-semibold">
            ⚠ Licença vence em {diasRestantes} dia{diasRestantes !== 1 ? 's' : ''}
          </p>
          <p className="text-amber-500/70 text-xs mt-1 leading-tight">
            Renove para evitar o bloqueio. Em caso de dúvidas, contate o suporte:
            {' '}
            <span className="font-semibold text-amber-300 whitespace-nowrap">(85) 9.2187-1975</span>
          </p>
        </div>
      )}
      {diasRestantes !== null && diasRestantes <= 7 && vendedor?.papel === 'dono' && (
        <button
          onClick={onRenovarComPix}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors"
        >
          <QrCode className="w-4 h-4" />
          Renovar com PIX
        </button>
      )}
      <button
        onClick={onAbrirCalculadora}
        title="Abrir a calculadora"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-700 hover:text-white transition-colors"
      >
        <Calculator className="w-4 h-4" />
        Calculadora
      </button>
      <a
        href={URL_SUPORTE_WHATSAPP}
        target="_blank"
        rel="noopener noreferrer"
        title="Falar com o suporte no WhatsApp"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        Suporte
      </a>
      <button
        onClick={onBloquear}
        title="Bloquear sistema (Ctrl+L)"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-700 hover:text-white transition-colors"
      >
        <Lock className="w-4 h-4" />
        Bloquear
      </button>
    </div>
  </nav>
)

export default App

import { createContext, FC, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { GuardaDoVoltar } from './web/GuardaDoVoltar'
import {
  Lock,
  LayoutDashboard,
  BarChart3,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Tags,
  Receipt,
  Settings,
  FileText,
  DatabaseBackup,
  MessageCircle,
  QrCode,
  Crown,
  BadgePercent,
  Calculator,
  ChevronDown,
  LogOut,
  Menu,
  LucideIcon
} from 'lucide-react'
import Fornecedores from './pages/Fornecedores'
import ContasPagar from './pages/ContasPagar'
import Comissoes from './pages/Comissoes'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Vendas from './pages/Vendas'
import Configuracoes from './pages/Configuracoes'
import Relatorios from './pages/Relatorios'
import TelaRestauracao from './pages/TelaRestauracao'
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

// A loja usa comissão? Governa a existência da aba no menu.
//
// Diferente das flags __FEAT_* (decididas ao gerar o instalador, valem pra
// edição inteira), isto é POR LOJA — e não tem interruptor próprio: quem liga é
// definir um percentual. `recarregar` existe para Configurações e o cadastro de
// vendedores avisarem assim que o percentual muda, sem exigir reabrir o app.
type ComissoesCtx = { ativo: boolean; recarregar: () => Promise<void> }
const ComissoesContext = createContext<ComissoesCtx>({
  ativo: false,
  recarregar: async () => {}
})
export const useComissoes = () => useContext(ComissoesContext)

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
  // Gaveta do menu. Só existe em tela estreita (abaixo de 1024px): num tablet
  // em pé, os 224px da barra lateral comeriam mais de um quarto da largura.
  const [menuAberto, setMenuAberto] = useState(false)
  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  // Caixa adicional que não conseguiu falar com o computador principal ao abrir.
  const [falhaCaixaPrincipal, setFalhaCaixaPrincipal] = useState<string | null>(null)
  const [tentativaCaixaPrincipal, setTentativaCaixaPrincipal] = useState(0)
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)
  const [mostrarPagamento, setMostrarPagamento] = useState(false)
  const [vendedor, setVendedor] = useState<SessaoVendedor | null>(null)
  const [comissoesAtivo, setComissoesAtivo] = useState(false)
  // Gerente adiou o cadastro de email de recuperação — esconde só nesta sessão.
  const [pulouEmailDono, setPulouEmailDono] = useState(false)
  // Onboarding (tutorial de primeira abertura): estado do banco + guia aberto.
  const [onboarding, setOnboarding] = useState<EstadoOnboarding | null>(null)
  const [guiaAberto, setGuiaAberto] = useState(false)
  const [calculadoraAberta, setCalculadoraAberta] = useState(false)
  const slidesGuia = useMemo(() => construirSlidesGuia(), [])
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

  // A aba de Comissões aparece só quando a loja definiu algum percentual.
  //
  // O canal exige gerente (folha de pagamento não é dado de vendedor), então só
  // faz sentido perguntar quando quem está logado é gerente. Para os demais a
  // resposta seria um erro — e a aba já estaria escondida pelo `somenteDono` de
  // qualquer forma.
  const recarregarComissoes = useCallback(async (papel?: string): Promise<void> => {
    if (papel !== 'dono') {
      setComissoesAtivo(false)
      return
    }
    const resp = await window.api.comissoes.configurado()
    setComissoesAtivo(resp.success ? resp.data : false)
  }, [])

  /**
   * A aba de Comissões acompanha a SESSÃO, sempre.
   *
   * ── O bug que este efeito consertou ───────────────────────────────────────
   * Antes, quem atualizava este estado era o efeito de licença/auth, que roda
   * uma vez quando o app abre. Só que ao ABRIR o app ainda não existe sessão —
   * ela vive na memória do processo principal e morre junto com o app. O
   * resultado: `papel` chegava indefinido, o estado ia para `false`, e o login
   * logo em seguida não mexia mais nele. A aba sumia a cada reabertura e só
   * voltava quando alguém mexia no percentual (que recarrega pelo contexto).
   *
   * Consertar chamando `recarregarComissoes` também no login funcionaria — e
   * seria a mesma armadilha esperando o próximo caminho que troca de usuário
   * (elevar privilégio, trocar de vendedor, logout). Aqui o estado é DERIVADO
   * do papel de quem está logado: qualquer caminho que mexa na sessão acerta a
   * aba de graça, sem ninguém precisar lembrar.
   */
  useEffect(() => {
    void recarregarComissoes(vendedor?.papel)
  }, [vendedor?.papel, recarregarComissoes])

  const ctxComissoes = useMemo(
    () => ({
      ativo: comissoesAtivo,
      recarregar: () => recarregarComissoes(vendedor?.papel)
    }),
    [comissoesAtivo, recarregarComissoes, vendedor?.papel]
  )

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
    const chave = `fhvp-tour-visto-vendedor-${vendedor.id}`
    if (localStorage.getItem(chave)) return
    localStorage.setItem(chave, '1')
    iniciarTour(false)
  }, [estadoAuth, vendedor, guiaAberto, iniciarTour])

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
        subtitulo="Sistema de Gestão de Varejo"
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
          subtitulo="Sistema de Gestão de Varejo"
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
      <ComissoesContext.Provider value={ctxComissoes}>
       <OnboardingContext.Provider value={{ abrirGuia }}>
        <NovidadesContext.Provider value={{ abrirNovidades }}>
        <TourContext.Provider value={{ abrirTour }}>
        <LockContext.Provider value={{ bloquear, autoLockMinutos, setAutoLockMinutos }}>
          <PdvModeContext.Provider value={{ ativo: pdvAtivo, setAtivo: setPdvAtivo }}>
           <CalculadoraContext.Provider
             value={{ aberta: calculadoraAberta, alternar: () => setCalculadoraAberta((v) => !v) }}
           >
            <MemoryRouter>
              {/*
                No navegador, o botão "voltar" do aparelho precisa andar dentro
                do sistema em vez de sair dele — ver web/GuardaDoVoltar.tsx.
                A constante é literal no build, então no aplicativo instalado
                este componente nem entra no pacote.
              */}
              {__ALVO__ === 'web' && (
                <GuardaDoVoltar pdvAtivo={pdvAtivo} setPdvAtivo={setPdvAtivo} />
              )}
              <div className="flex h-screen bg-background">
                {!pdvAtivo && (
                  <Sidebar
                    diasRestantes={diasRestantes}
                    onBloquear={bloquear}
                    onAbrirCalculadora={() => setCalculadoraAberta((v) => !v)}
                    onRenovarComPix={abrirPagamento}
                    vendedor={vendedor}
                    comissoesAtivo={comissoesAtivo}
                    aberta={menuAberto}
                    onFechar={() => setMenuAberto(false)}
                  />
                )}
                {/*
                  Véu por trás da gaveta: escurece o conteúdo e dá onde tocar
                  para fechar sem escolher nada. Só existe enquanto ela está
                  aberta, e some de vez em tela larga — onde a barra é fixa e
                  não há o que fechar.
                */}
                {!pdvAtivo && menuAberto && (
                  <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setMenuAberto(false)}
                    aria-label="Fechar menu"
                  />
                )}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Aparece inclusive com o PDV aberto, ao contrário dos
                      demais avisos: é justamente durante a venda que perder o
                      caixa principal precisa ficar visível. */}
                  <AvisoSemConexao />
                  {!pdvAtivo && <AlertaBackupFalhando />}
                  {/*
                    A barra de cima. Antes só existia para o gerente, por causa
                    do sino. Agora ela também carrega o botão que abre a gaveta
                    do menu em tela estreita.

                    O `lg:hidden` quando NÃO é gerente é o que preserva o
                    aplicativo instalado: sem ele, um vendedor numa tela larga
                    passaria a ver uma faixa vazia de 48px que nunca existiu.
                  */}
                  {!pdvAtivo && (
                    <div
                      className={`h-12 shrink-0 border-b bg-background flex items-center justify-between px-6 lg:justify-end ${
                        vendedor?.papel === 'dono' ? '' : 'lg:hidden'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setMenuAberto(true)}
                        aria-label="Abrir menu"
                        className="lg:hidden -ml-2 p-2 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Menu className="w-5 h-5" />
                      </button>
                      {vendedor?.papel === 'dono' && (
                        <span data-tour="sino">
                          <SinoNotificacoesHost onRenovarComPix={abrirPagamento} />
                        </span>
                      )}
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
                      {Dashboard ? (
                        <Route
                          path="/"
                          element={
                            <RotaSomenteDono titulo="Dashboard">
                              <Suspense fallback={<DashboardSkeleton />}>
                                <Dashboard />
                              </Suspense>
                            </RotaSomenteDono>
                          }
                        />
                      ) : (
                        <Route path="/" element={<Navigate to="/produtos" replace />} />
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
                      <Route
                        path="/comissoes"
                        element={
                          <RotaSomenteDono titulo="Comissões">
                            <Comissoes />
                          </RotaSomenteDono>
                        }
                      />
                      <Route path="/produtos" element={<Produtos />} />
                      <Route path="/clientes" element={<Clientes />} />
                      <Route path="/vendas" element={<Vendas />} />
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
           </CalculadoraContext.Provider>
          </PdvModeContext.Provider>
        </LockContext.Provider>
        </TourContext.Provider>
        </NovidadesContext.Provider>
       </OnboardingContext.Provider>
      </ComissoesContext.Provider>
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
  // A aba de Comissões só existe pra quem usa comissão. Quem liga o módulo é a
  // própria regra de negócio: definir um percentual (na loja ou em alguém) é o
  // ato de adotar a funcionalidade. Loja que não paga comissão nunca vê a aba.
  requerComissoes?: boolean
}
const CATEGORIAS_SIDEBAR: { titulo: string; itens: ItemSidebar[] }[] = [
  {
    titulo: 'Visão geral',
    itens: [
      ...(__FEAT_DASHBOARD__
        ? [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, somenteDono: true }]
        : []),
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, somenteDono: true }
    ]
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: '/produtos', label: 'Produtos', icon: Package },
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/fornecedores', label: 'Fornecedores', icon: Truck }
    ]
  },
  {
    titulo: 'Operação',
    itens: [
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
      {
        to: '/comissoes',
        label: 'Comissões',
        icon: BadgePercent,
        somenteDono: true,
        requerComissoes: true
      }
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
              'Vendedor'
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
  comissoesAtivo: boolean
  /** Só importa em tela estreita, onde ela é gaveta. */
  aberta: boolean
  onFechar: () => void
}> = ({
  diasRestantes,
  onBloquear,
  onRenovarComPix,
  onAbrirCalculadora,
  vendedor,
  comissoesAtivo,
  aberta,
  onFechar
}) => (
  // ── Fixa numa tela larga, gaveta numa estreita ─────────────────────────────
  // A partir de `lg` (1024px) ela é o que sempre foi: uma coluna ao lado do
  // conteúdo. Abaixo disso — tablet em pé, 800px — os 224px dela comeriam mais
  // de um quarto da largura útil, e as tabelas ficariam espremidas. Então ela
  // sai do fluxo e desliza por cima quando chamada.
  //
  // Repare que ela continua SEMPRE montada, mesmo fechada: desmontar perderia
  // o estado de rolagem do menu e faria o `data-tour` sumir no meio do tour
  // guiado.
  <nav
    data-tour="menu"
    className={`w-56 bg-slate-900 text-white flex flex-col p-4 shrink-0 z-40
      fixed inset-y-0 left-0 transition-transform duration-200
      ${aberta ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:translate-x-0`}
  >
    <div className="mb-4">
      <h1 className="text-lg font-bold text-white">FHVP Tech</h1>
      <p className="text-xs text-slate-400">Sistema de Gestão de Varejo</p>
    </div>

    {vendedor && <UserMenu vendedor={vendedor} onSair={onBloquear} />}

    {/*
      Escolher uma tela fecha a gaveta; abrir o menu do usuário ou a calculadora
      não. Por isso o fechamento está AQUI, na lista de telas, e não no <nav>
      inteiro — lá ele engoliria o clique que abre o menu do usuário, que fica
      logo acima.

      Em tela larga a gaveta não existe, e `onFechar` não faz nada.
    */}
    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-4" onClick={onFechar}>
      {CATEGORIAS_SIDEBAR.map((cat) => (
        <div key={cat.titulo}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-1">
            {cat.titulo}
          </p>
          <div className="flex flex-col gap-1">
            {cat.itens
              .filter((item) => !item.requerComissoes || comissoesAtivo)
              .map(({ to, label, icon: Icon, somenteDono }) => {
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
      ))}
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

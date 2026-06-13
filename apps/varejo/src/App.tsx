import { createContext, FC, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { MemoryRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  Lock,
  LayoutDashboard,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Tags,
  Settings,
  DatabaseBackup,
  MessageCircle,
  QrCode,
  Crown,
  ChevronDown,
  LogOut,
  LucideIcon
} from 'lucide-react'
import Fornecedores from './pages/Fornecedores'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Vendas from './pages/Vendas'
import Configuracoes from './pages/Configuracoes'
import TelaRestauracao from './pages/TelaRestauracao'
import LicencaBloqueada from '@fhvptech/core/ui/LicencaBloqueada'
import LoginSistema from './pages/LoginSistema'
import ModalCadastrarEmailDono from './components/ModalCadastrarEmailDono'
import IndicadorBackupAtivo from './components/backup/IndicadorBackupAtivo'
import AlertaBackupFalhando from './components/backup/AlertaBackupFalhando'
import DialogoBackupAoFechar from './components/backup/DialogoBackupAoFechar'
import ModalAtualizacaoDisponivel from './components/ModalAtualizacaoDisponivel'
import ModalPagamentoPix from '@fhvptech/core/ui/ModalPagamentoPix'
import ErrorBoundary from './components/ErrorBoundary'
import RotaSomenteDono from './components/RotaSomenteDono'
import { ToastProvider, useToast } from '@fhvptech/core/ui/toast'
import { useAutoLock } from './hooks/useAutoLock'

// Features opcionais carregadas sob demanda e gateadas por edição (build-time).
// Quando a flag é `false`, o `lazy(import())` vira `null` e o bundler remove o
// chunk e suas libs exclusivas do binário (ex.: recharts sai junto do Dashboard).
const Dashboard = __FEAT_DASHBOARD__ ? lazy(() => import('./pages/Dashboard')) : null
const EtiquetasA4 = __FEAT_ETIQUETAS__ ? lazy(() => import('./pages/EtiquetasA4')) : null
const ChatAssistente = __FEAT_CHATBOT__ ? lazy(() => import('./components/ChatAssistente')) : null

const FallbackCarregando: FC = () => (
  <div className="flex-1 flex items-center justify-center p-8">
    <p className="text-sm text-muted-foreground">Carregando…</p>
  </div>
)

type EstadoLicenca = 'verificando' | 'valida' | 'invalida'
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

// MemoryRouter é necessário no Electron: não existe servidor HTTP nem hash routing
const App: FC = () => {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [avisoLicenca, setAvisoLicenca] = useState<string | null>(null)
  const [pdvAtivo, setPdvAtivo] = useState(false)
  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)
  const [mostrarPagamento, setMostrarPagamento] = useState(false)
  const [vendedor, setVendedor] = useState<SessaoVendedor | null>(null)
  // Dono adiou o cadastro de email de recuperação — esconde só nesta sessão.
  const [pulouEmailDono, setPulouEmailDono] = useState(false)

  const validarLicenca = useCallback(async (): Promise<void> => {
    const resp = await window.api.licenca.validar()
    if (resp.success) {
      const status = resp.data
      setMensagemLicenca(status.mensagem)
      setEstadoLicenca(status.valida ? 'valida' : 'invalida')
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
      const respStatus = await window.api.auth.obterStatus()
      if (respStatus.success) {
        setAutoLockMinutos(respStatus.data.autoLockMinutos)
      }
      const sessao = await recarregarSessao()
      setEstadoAuth(sessao ? 'desbloqueado' : 'bloqueado')
    })()
  }, [estadoLicenca, recarregarSessao])

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

  // Auto-lock por inatividade — só roda quando desbloqueado e tempo > 0
  useAutoLock(estadoAuth === 'desbloqueado' ? autoLockMinutos : 0, bloquear)

  if (estadoLicenca === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando licença...</p>
      </div>
    )
  }

  if (estadoLicenca === 'invalida') {
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

  if (estadoAuth === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando acesso...</p>
      </div>
    )
  }

  return (
    <ToastProvider>
      <ToastInicial aviso={avisoLicenca} onMostrado={() => setAvisoLicenca(null)} />
      <SessaoContext.Provider
        value={{ vendedor, ehDono: vendedor?.papel === 'dono', recarregar: recarregarSessao }}
      >
        <LockContext.Provider value={{ bloquear, autoLockMinutos, setAutoLockMinutos }}>
          <PdvModeContext.Provider value={{ ativo: pdvAtivo, setAtivo: setPdvAtivo }}>
            <MemoryRouter>
              <div className="flex h-screen bg-background">
                {!pdvAtivo && (
                  <Sidebar
                    diasRestantes={diasRestantes}
                    onBloquear={bloquear}
                    onRenovarComPix={abrirPagamento}
                    vendedor={vendedor}
                  />
                )}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {!pdvAtivo && <AlertaBackupFalhando />}
                  <main className={`flex-1 overflow-auto ${pdvAtivo ? '' : 'pb-24'}`}>
                    <Routes>
                      {Dashboard ? (
                        <Route
                          path="/"
                          element={
                            <RotaSomenteDono titulo="Dashboard">
                              <Suspense fallback={<FallbackCarregando />}>
                                <Dashboard />
                              </Suspense>
                            </RotaSomenteDono>
                          }
                        />
                      ) : (
                        <Route path="/" element={<Navigate to="/produtos" replace />} />
                      )}
                      <Route path="/fornecedores" element={<Fornecedores />} />
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
          </PdvModeContext.Provider>
        </LockContext.Provider>
      </SessaoContext.Provider>
      {estadoAuth === 'bloqueado' && <LoginSistema onDesbloquear={aoLogar} />}
      {estadoAuth === 'desbloqueado' &&
        vendedor?.papel === 'dono' &&
        !vendedor.email &&
        !pulouEmailDono && (
          <ModalCadastrarEmailDono
            vendedorId={vendedor.id}
            onSalvo={() => {
              recarregarSessao()
            }}
            onPular={() => setPulouEmailDono(true)}
          />
        )}
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

type ItemSidebar = { to: string; label: string; icon: LucideIcon; somenteDono?: boolean }
const CATEGORIAS_SIDEBAR: { titulo: string; itens: ItemSidebar[] }[] = [
  ...(__FEAT_DASHBOARD__
    ? [
        {
          titulo: 'Visão geral',
          itens: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, somenteDono: true }]
        }
      ]
    : []),
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
    titulo: 'Sistema',
    itens: [
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
                <Crown className="w-3 h-3 text-amber-400" /> Dono
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

const Sidebar: FC<{
  diasRestantes: number | null
  onBloquear: () => void
  onRenovarComPix: () => void
  vendedor: SessaoVendedor | null
}> = ({ diasRestantes, onBloquear, onRenovarComPix, vendedor }) => (
  <nav className="w-56 bg-slate-900 text-white flex flex-col p-4 shrink-0">
    <div className="mb-4">
      <h1 className="text-lg font-bold text-white">FHVP Tech</h1>
      <p className="text-xs text-slate-400">Sistema de Gestão de Varejo</p>
    </div>

    {vendedor && <UserMenu vendedor={vendedor} onSair={onBloquear} />}

    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-4">
      {CATEGORIAS_SIDEBAR.map((cat) => (
        <div key={cat.titulo}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-1">
            {cat.titulo}
          </p>
          <div className="flex flex-col gap-1">
            {cat.itens.map(({ to, label, icon: Icon, somenteDono }) => {
              const bloqueado = somenteDono && vendedor?.papel !== 'dono'
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={bloqueado ? 'Restrito ao dono' : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : bloqueado
                          ? 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-400'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
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

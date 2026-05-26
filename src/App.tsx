import { createContext, FC, useCallback, useContext, useEffect, useState } from 'react'
import { MemoryRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Fornecedores from './pages/Fornecedores'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Vendas from './pages/Vendas'
import EtiquetasA4 from './pages/EtiquetasA4'
import Configuracoes from './pages/Configuracoes'
import TelaRestauracao from './pages/TelaRestauracao'
import LicencaBloqueada from './pages/LicencaBloqueada'
import LoginSistema from './pages/LoginSistema'
import IndicadorBackupAtivo from './components/backup/IndicadorBackupAtivo'
import AlertaBackupFalhando from './components/backup/AlertaBackupFalhando'
import DialogoBackupAoFechar from './components/backup/DialogoBackupAoFechar'
import ModalAtualizacaoDisponivel from './components/ModalAtualizacaoDisponivel'
import { ToastProvider } from './components/ui/toast'
import { useAutoLock } from './hooks/useAutoLock'

type EstadoLicenca = 'verificando' | 'valida' | 'invalida'
type EstadoAuth = 'verificando' | 'cadastro' | 'bloqueado' | 'desbloqueado'

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

// MemoryRouter é necessário no Electron: não existe servidor HTTP nem hash routing
const App: FC = () => {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [pdvAtivo, setPdvAtivo] = useState(false)
  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)

  useEffect(() => {
    window.api.licenca.validar().then((resp) => {
      if (resp.success) {
        const status = resp.data as { valida: boolean; mensagem: string; diasRestantes?: number }
        setMensagemLicenca(status.mensagem)
        setEstadoLicenca(status.valida ? 'valida' : 'invalida')
        if (status.valida && status.diasRestantes !== undefined) {
          setDiasRestantes(status.diasRestantes)
        }
      } else {
        setMensagemLicenca(resp.error)
        setEstadoLicenca('invalida')
      }
    })
  }, [])

  // Verifica status do PIN apenas depois da licença passar
  useEffect(() => {
    if (estadoLicenca !== 'valida') return
    window.api.auth.obterStatus().then((resp) => {
      if (!resp.success) {
        // Falha grave: se nem o status carrega, melhor não travar o usuário
        setEstadoAuth('desbloqueado')
        return
      }
      const { pinConfigurado, precisaValidarHoje, autoLockMinutos: m } = resp.data
      setAutoLockMinutos(m)
      if (!pinConfigurado) setEstadoAuth('cadastro')
      else if (precisaValidarHoje) setEstadoAuth('bloqueado')
      else setEstadoAuth('desbloqueado')
    })
  }, [estadoLicenca])

  const bloquear = useCallback(() => {
    setEstadoAuth((prev) => (prev === 'desbloqueado' ? 'bloqueado' : prev))
  }, [])

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
      <LicencaBloqueada
        mensagemInicial={mensagemLicenca}
        onAtivar={(dias) => { setEstadoLicenca('valida'); if (dias !== undefined) setDiasRestantes(dias) }}
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
      <LockContext.Provider value={{ bloquear, autoLockMinutos, setAutoLockMinutos }}>
        <PdvModeContext.Provider value={{ ativo: pdvAtivo, setAtivo: setPdvAtivo }}>
          <MemoryRouter>
            <div className="flex h-screen bg-background">
              {!pdvAtivo && <Sidebar diasRestantes={diasRestantes} onBloquear={bloquear} />}
              <div className="flex-1 flex flex-col overflow-hidden">
                {!pdvAtivo && <AlertaBackupFalhando />}
                <main className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/fornecedores" element={<Fornecedores />} />
                    <Route path="/produtos" element={<Produtos />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/vendas" element={<Vendas />} />
                    <Route path="/etiquetas" element={<EtiquetasA4 />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/restauracao" element={<TelaRestauracao />} />
                  </Routes>
                </main>
              </div>
            </div>
            <IndicadorBackupAtivo />
            <DialogoBackupAoFechar />
            <ModalAtualizacaoDisponivel />
          </MemoryRouter>
        </PdvModeContext.Provider>
      </LockContext.Provider>
      {(estadoAuth === 'bloqueado' || estadoAuth === 'cadastro') && (
        <LoginSistema
          modoCadastro={estadoAuth === 'cadastro'}
          onDesbloquear={() => setEstadoAuth('desbloqueado')}
        />
      )}
    </ToastProvider>
  )
}

const Sidebar: FC<{ diasRestantes: number | null; onBloquear: () => void }> = ({
  diasRestantes,
  onBloquear
}) => (
  <nav className="w-56 bg-slate-900 text-white flex flex-col gap-1 p-4 shrink-0">
    <div className="mb-6">
      <h1 className="text-lg font-bold text-white">GN Modas</h1>
      <p className="text-xs text-slate-400">Sistema de Gestão de Varejo</p>
    </div>

    {[
      { to: '/', label: 'Dashboard' },
      { to: '/produtos', label: 'Produtos' },
      { to: '/clientes', label: 'Clientes' },
      { to: '/fornecedores', label: 'Fornecedores' },
      { to: '/vendas', label: 'Vendas' },
      { to: '/etiquetas', label: 'Etiquetas A4' },
      { to: '/configuracoes', label: 'Configurações' },
      { to: '/restauracao', label: 'Restauração' }
    ].map(({ to, label }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `px-3 py-2 rounded text-sm transition-colors ${
            isActive
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`
        }
      >
        {label}
      </NavLink>
    ))}

    <div className="mt-auto pt-3 space-y-2">
      {diasRestantes !== null && diasRestantes <= 3 && (
        <div className="bg-amber-500/15 border border-amber-500/30 rounded-lg p-2.5">
          <p className="text-amber-400 text-xs font-semibold">
            ⚠ Licença vence em {diasRestantes} dia{diasRestantes !== 1 ? 's' : ''}
          </p>
          <p className="text-amber-500/70 text-xs mt-1 leading-tight">
            Após o vencimento o sistema será bloqueado. Entre em contato com o suporte:
            {' '}
            <span className="font-semibold text-amber-300 whitespace-nowrap">(85) 9.2187-1975</span>
          </p>
        </div>
      )}
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

const Placeholder: FC<{ titulo: string; etapa: number }> = ({ titulo, etapa }) => (
  <div className="p-8 flex items-center justify-center h-full">
    <div className="text-center text-muted-foreground">
      <p className="text-2xl font-semibold text-foreground mb-2">{titulo}</p>
      <p>Será implementado na etapa {etapa}.</p>
    </div>
  </div>
)

export default App

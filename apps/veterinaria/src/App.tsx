import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FC,
  type ReactNode
} from 'react'
import { MemoryRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  Lock,
  LogOut,
  Crown,
  ChevronDown,
  Settings,
  Package,
  ClipboardList,
  PawPrint,
  Stethoscope,
  MessageCircle,
  type LucideIcon
} from 'lucide-react'
import LicencaBloqueada from '@fhvptech/core/ui/LicencaBloqueada'
import ModalPagamentoPix from '@fhvptech/core/ui/ModalPagamentoPix'
import LoginSistema from '@fhvptech/core/ui/LoginSistema'
import { useAutoLock } from '@fhvptech/core/lib/useAutoLock'
import Configuracoes from './pages/Configuracoes'

type EstadoLicenca = 'verificando' | 'valida' | 'invalida'
type EstadoAuth = 'verificando' | 'bloqueado' | 'desbloqueado'

export type Sessao = {
  id: number
  nome: string
  ativo: number
  papel: 'dono' | 'funcionario'
  email: string | null
  tem_pin: number
}

// Quem está logado agora. ehDono é o atalho usado nas regras de permissão;
// recarregar permite atualizar após alterar email/PIN (usado na tela de Usuários).
type SessaoCtx = {
  sessao: Sessao | null
  ehDono: boolean
  recarregar: () => Promise<Sessao | null>
}
const SessaoContext = createContext<SessaoCtx>({
  sessao: null,
  ehDono: false,
  recarregar: async () => null
})
export const useSessao = () => useContext(SessaoContext)

// Expõe "bloquear agora" + o auto-lock pra qualquer página (Configurações usa
// pra deslogar após trocar PIN e pra ajustar o tempo de auto-lock).
type LockCtx = {
  bloquear: () => void
  autoLockMinutos: number
  setAutoLockMinutos: (m: number) => void
}
const LockContext = createContext<LockCtx>({
  bloquear: () => {},
  autoLockMinutos: 15,
  setAutoLockMinutos: () => {}
})
export const useLock = () => useContext(LockContext)

const URL_SUPORTE_WHATSAPP = `https://wa.me/5585921871975?text=${encodeURIComponent(
  `Olá, sou usuário do Sistema FHVP Tech Veterinária (versão ${__APP_VERSION__}) e preciso de suporte.`
)}`

// "Porteiro" da veterinária: valida licença e, em seguida, exige login. Ambos os
// motores (licença e auth) vêm do @fhvptech/core. Desbloqueado → casca com
// sidebar + rotas (cadastros, atendimentos e configurações entram conforme as
// telas forem criadas).
export default function App() {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  const [mostrarPagamento, setMostrarPagamento] = useState(false)

  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)
  const [sessao, setSessao] = useState<Sessao | null>(null)

  const validarLicenca = useCallback(async (): Promise<void> => {
    const resp = await window.api.licenca.validar()
    if (resp.success) {
      setMensagemLicenca(resp.data.mensagem)
      setEstadoLicenca(resp.data.valida ? 'valida' : 'invalida')
    } else {
      setMensagemLicenca(resp.error)
      setEstadoLicenca('invalida')
    }
  }, [])

  useEffect(() => {
    validarLicenca()
  }, [validarLicenca])

  const recarregarSessao = useCallback(async (): Promise<Sessao | null> => {
    const resp = await window.api.auth.sessaoAtual()
    const s = resp.success ? resp.data : null
    setSessao(s)
    return s
  }, [])

  // Depois que a licença passa, lê auto-lock + sessão pra decidir login/desbloqueio.
  useEffect(() => {
    if (estadoLicenca !== 'valida') return
    ;(async () => {
      const respStatus = await window.api.auth.obterStatus()
      if (respStatus.success) setAutoLockMinutos(respStatus.data.autoLockMinutos)
      const s = await recarregarSessao()
      setEstadoAuth(s ? 'desbloqueado' : 'bloqueado')
    })()
  }, [estadoLicenca, recarregarSessao])

  const bloquear = useCallback(() => {
    // logout é fire-and-forget — a UI já some e o resultado não bloqueia.
    window.api.auth.logout().catch(() => {})
    setSessao(null)
    setEstadoAuth((prev) => (prev === 'desbloqueado' ? 'bloqueado' : prev))
  }, [])

  const aoLogar = useCallback(async () => {
    await recarregarSessao()
    setEstadoAuth('desbloqueado')
  }, [recarregarSessao])

  // Atalho global Ctrl+L bloqueia o sistema imediatamente.
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

  // Auto-lock por inatividade — só roda quando desbloqueado e tempo > 0.
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
          subtitulo="Sistema de Gestão Veterinária"
          onAtivar={() => setEstadoLicenca('valida')}
          onRenovarComPix={() => setMostrarPagamento(true)}
        />
        <ModalPagamentoPix
          aberto={mostrarPagamento}
          onClose={() => setMostrarPagamento(false)}
          onLicencaRenovada={validarLicenca}
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

  if (estadoAuth === 'bloqueado') {
    return <LoginSistema onDesbloquear={aoLogar} />
  }

  return (
    <SessaoContext.Provider
      value={{ sessao, ehDono: sessao?.papel === 'dono', recarregar: recarregarSessao }}
    >
      <LockContext.Provider value={{ bloquear, autoLockMinutos, setAutoLockMinutos }}>
        <MemoryRouter>
          <div className="flex h-screen bg-background">
            <Sidebar sessao={sessao} onBloquear={bloquear} />
            <main className="flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/atendimentos" replace />} />
                <Route
                  path="/atendimentos"
                  element={
                    <EmConstrucao
                      titulo="Atendimentos"
                      descricao="O faturamento por atendimento (escolher o pet, lançar serviços e produtos, fechar a conta) entra aqui."
                    />
                  }
                />
                <Route
                  path="/tutores"
                  element={
                    <EmConstrucao
                      titulo="Tutores & Pets"
                      descricao="Cadastro de tutores e seus pets."
                    />
                  }
                />
                <Route
                  path="/servicos"
                  element={
                    <EmConstrucao
                      titulo="Serviços"
                      descricao="Catálogo de serviços (consulta, banho, cirurgia)."
                    />
                  }
                />
                <Route
                  path="/produtos"
                  element={
                    <EmConstrucao
                      titulo="Produtos"
                      descricao="Catálogo de produtos e medicamentos, com estoque."
                    />
                  }
                />
                <Route
                  path="/configuracoes"
                  element={
                    <RotaSomenteDono titulo="Configurações">
                      <Configuracoes />
                    </RotaSomenteDono>
                  }
                />
              </Routes>
            </main>
          </div>
          <ModalPagamentoPix
            aberto={mostrarPagamento}
            onClose={() => setMostrarPagamento(false)}
            onLicencaRenovada={validarLicenca}
          />
        </MemoryRouter>
      </LockContext.Provider>
    </SessaoContext.Provider>
  )
}

// ───── Sidebar ────────────────────────────────────────────────────────

type ItemSidebar = { to: string; label: string; icon: LucideIcon; somenteDono?: boolean }
const SECOES_SIDEBAR: { titulo: string; itens: ItemSidebar[] }[] = [
  {
    titulo: 'Operação',
    itens: [{ to: '/atendimentos', label: 'Atendimentos', icon: Stethoscope }]
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: '/tutores', label: 'Tutores & Pets', icon: PawPrint },
      { to: '/servicos', label: 'Serviços', icon: ClipboardList },
      { to: '/produtos', label: 'Produtos', icon: Package }
    ]
  },
  {
    titulo: 'Sistema',
    itens: [{ to: '/configuracoes', label: 'Configurações', icon: Settings, somenteDono: true }]
  }
]

const Sidebar: FC<{ sessao: Sessao | null; onBloquear: () => void }> = ({ sessao, onBloquear }) => (
  <nav className="w-56 bg-slate-900 text-white flex flex-col p-4 shrink-0">
    <div className="mb-4">
      <h1 className="text-lg font-bold text-white">FHVP Tech</h1>
      <p className="text-xs text-slate-400">Sistema de Gestão Veterinária</p>
    </div>

    {sessao && <UserMenu sessao={sessao} onSair={onBloquear} />}

    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-4">
      {SECOES_SIDEBAR.map((sec) => (
        <div key={sec.titulo}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-1">
            {sec.titulo}
          </p>
          <div className="flex flex-col gap-1">
            {sec.itens.map(({ to, label, icon: Icon, somenteDono }) => {
              const bloqueado = somenteDono && sessao?.papel !== 'dono'
              return (
                <NavLink
                  key={to}
                  to={to}
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

const UserMenu: FC<{ sessao: Sessao; onSair: () => void }> = ({ sessao, onSair }) => {
  const [aberto, setAberto] = useState(false)
  const inicial = sessao.nome.trim().slice(0, 1).toUpperCase() || '?'
  const ehDono = sessao.papel === 'dono'
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
          <p className="text-sm font-semibold text-white truncate" title={sessao.nome}>
            {sessao.nome}
          </p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            {ehDono ? (
              <>
                <Crown className="w-3 h-3 text-amber-400" /> Dono
              </>
            ) : (
              'Funcionário'
            )}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>
      {sessao.email && (
        <p className="text-[11px] text-slate-400 mt-1.5 truncate" title={sessao.email}>
          {sessao.email}
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

// ───── Helpers de página ──────────────────────────────────────────────

const RotaSomenteDono: FC<{ titulo: string; children: ReactNode }> = ({ titulo, children }) => {
  const { ehDono } = useSessao()
  if (ehDono) return <>{children}</>
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <Lock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Esta área é restrita ao dono da clínica. Peça para o dono entrar.
        </p>
      </div>
    </div>
  )
}

const EmConstrucao: FC<{ titulo: string; descricao: string }> = ({ titulo, descricao }) => (
  <div className="h-full flex items-center justify-center p-8">
    <div className="text-center max-w-md">
      <h2 className="text-2xl font-bold text-foreground">{titulo}</h2>
      <p className="text-sm text-muted-foreground mt-2">{descricao}</p>
      <p className="text-xs text-muted-foreground/70 mt-4">Em construção 🐾</p>
    </div>
  </div>
)

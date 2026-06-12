import { FC, useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Power,
  Crown,
  KeyRound,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useSessao } from '@/App'

type Vendedor = {
  id: number
  nome: string
  ativo: number
  papel: 'dono' | 'vendedor'
  email: string | null
  tem_pin: number
  vendas_count: number
}

type EdicaoState = {
  nome: string
  email: string
}

const sanitizarPin = (v: string) => v.replace(/\D/g, '').slice(0, 6)

const CadastroVendedores: FC = () => {
  const { vendedor: logado } = useSessao()
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edicao, setEdicao] = useState<EdicaoState>({ nome: '', email: '' })

  // Modal de redefinir PIN
  const [pinModalAberto, setPinModalAberto] = useState(false)
  const [pinAlvo, setPinAlvo] = useState<Vendedor | null>(null)
  const [pinNovo, setPinNovo] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erroPin, setErroPin] = useState('')
  const [salvandoPin, setSalvandoPin] = useState(false)

  const carregar = async () => {
    const resp = await window.api.vendedores.listar()
    if (resp.success) setVendedores(resp.data as Vendedor[])
  }

  useEffect(() => {
    carregar()
  }, [])

  const criar = async () => {
    setErro('')
    if (!novoNome.trim()) return
    const resp = await window.api.vendedores.criar({
      nome: novoNome.trim(),
      email: novoEmail.trim() || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovoNome('')
    setNovoEmail('')
    await carregar()
  }

  const iniciarEdicao = (v: Vendedor) => {
    setEditandoId(v.id)
    setEdicao({ nome: v.nome, email: v.email ?? '' })
    setErro('')
  }

  const cancelarEdicao = () => {
    setEditandoId(null)
    setEdicao({ nome: '', email: '' })
    setErro('')
  }

  const salvarEdicao = async (id: number) => {
    setErro('')
    if (!edicao.nome.trim()) return
    const resp = await window.api.vendedores.atualizar(id, {
      nome: edicao.nome.trim(),
      email: edicao.email.trim() || null
    })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    cancelarEdicao()
    await carregar()
  }

  const alternarAtivo = async (v: Vendedor) => {
    setErro('')
    const resp = await window.api.vendedores.alternarAtivo(v.id, v.ativo === 0)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
  }

  const alterarPapel = async (v: Vendedor) => {
    setErro('')
    const novoPapel: 'dono' | 'vendedor' = v.papel === 'dono' ? 'vendedor' : 'dono'
    const confirmacao =
      novoPapel === 'dono'
        ? `Promover "${v.nome}" a Dono? Ele terá acesso total ao sistema.`
        : `Rebaixar "${v.nome}" a Vendedor? Ele perderá acesso a relatórios e cadastros sensíveis.`
    if (!confirm(confirmacao)) return
    const resp = await window.api.vendedores.alterarPapel(v.id, novoPapel)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
  }

  const excluir = async (v: Vendedor) => {
    setErro('')
    if (v.vendas_count > 0) {
      setErro(
        `"${v.nome}" possui ${v.vendas_count} venda${v.vendas_count !== 1 ? 's' : ''} ` +
          `e não pode ser excluído. Use o botão de desativar para escondê-lo do PDV mantendo o histórico.`
      )
      return
    }
    if (!confirm(`Excluir o vendedor "${v.nome}"?`)) return
    const resp = await window.api.vendedores.deletar(v.id)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
  }

  const abrirRedefinirPin = (v: Vendedor) => {
    setPinAlvo(v)
    setPinNovo('')
    setPinConfirmacao('')
    setErroPin('')
    setPinModalAberto(true)
  }

  const confirmarRedefinirPin = async () => {
    if (!pinAlvo) return
    setErroPin('')
    if (!/^\d{4,6}$/.test(pinNovo)) {
      setErroPin('O PIN deve ter de 4 a 6 dígitos numéricos.')
      return
    }
    if (pinNovo !== pinConfirmacao) {
      setErroPin('A confirmação não confere com o PIN digitado.')
      return
    }
    setSalvandoPin(true)
    const resp = await window.api.vendedores.redefinirPin(pinAlvo.id, pinNovo)
    setSalvandoPin(false)
    if (!resp.success) {
      setErroPin(resp.error)
      return
    }
    setPinModalAberto(false)
    setPinAlvo(null)
    await carregar()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={novoNome}
            onChange={(e) => {
              setNovoNome(e.target.value)
              setErro('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criar()
            }}
            placeholder="Nome do vendedor"
            className="flex-1"
          />
          <Input
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criar()
            }}
            placeholder="Email (opcional)"
            type="email"
            className="flex-1"
          />
          <Button onClick={criar} size="icon" title="Adicionar vendedor">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vendedores novos são criados como "Vendedor" e precisam definir o próprio PIN no 1º acesso.
        </p>
      </div>

      {erro && (
        <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
      )}

      <div className="border rounded-lg max-h-96 overflow-y-auto">
        {vendedores.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Nenhum vendedor cadastrado.
          </p>
        ) : (
          <ul className="divide-y">
            {vendedores.map((v) => {
              const ehDono = v.papel === 'dono'
              const ehSessaoAtual = logado?.id === v.id
              const emEdicao = editandoId === v.id

              if (emEdicao) {
                return (
                  <li key={v.id} className="px-3 py-3 space-y-2 bg-blue-50/30">
                    <div className="flex gap-2">
                      <Input
                        value={edicao.nome}
                        onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarEdicao(v.id)
                          if (e.key === 'Escape') cancelarEdicao()
                        }}
                        autoFocus
                        className="h-8 flex-1"
                        placeholder="Nome"
                      />
                      <Input
                        value={edicao.email}
                        onChange={(e) => setEdicao({ ...edicao, email: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarEdicao(v.id)
                          if (e.key === 'Escape') cancelarEdicao()
                        }}
                        className="h-8 flex-1"
                        placeholder="Email"
                        type="email"
                      />
                      <button
                        onClick={() => salvarEdicao(v.id)}
                        className="text-green-600 hover:text-green-700 p-1"
                        title="Salvar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelarEdicao}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-2 px-3 py-2.5 ${v.ativo === 0 ? 'opacity-60' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${
                      ehDono ? 'bg-amber-500' : 'bg-slate-500'
                    }`}
                  >
                    {v.nome.trim().slice(0, 1).toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{v.nome}</span>
                      {ehDono && (
                        <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold uppercase rounded px-1.5 py-0.5">
                          <Crown className="w-3 h-3" /> Dono
                        </span>
                      )}
                      {v.ativo === 0 && (
                        <span className="text-[10px] text-muted-foreground italic">(inativo)</span>
                      )}
                      {ehSessaoAtual && (
                        <span className="text-[10px] text-blue-600 font-medium">· você</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{v.email || 'sem email'}</span>
                      <span>·</span>
                      <span>
                        {v.vendas_count} venda{v.vendas_count !== 1 ? 's' : ''}
                      </span>
                      {v.tem_pin === 0 && v.ativo === 1 && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          <AlertCircle className="w-3 h-3" /> sem PIN
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => abrirRedefinirPin(v)}
                      className="text-muted-foreground hover:text-blue-600 p-1.5"
                      title="Redefinir PIN"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => alterarPapel(v)}
                      className={`p-1.5 ${
                        ehDono
                          ? 'text-muted-foreground hover:text-slate-700'
                          : 'text-muted-foreground hover:text-amber-600'
                      }`}
                      title={ehDono ? 'Rebaixar a Vendedor' : 'Promover a Dono'}
                    >
                      {ehDono ? (
                        <ArrowDownCircle className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => alternarAtivo(v)}
                      className={`p-1.5 ${
                        v.ativo === 1
                          ? 'text-muted-foreground hover:text-foreground'
                          : 'text-amber-600 hover:text-amber-700'
                      }`}
                      title={v.ativo === 1 ? 'Desativar (some do PDV/login)' : 'Reativar'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => iniciarEdicao(v)}
                      className="text-muted-foreground hover:text-foreground p-1.5"
                      title="Editar nome/email"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excluir(v)}
                      className="text-destructive/70 hover:text-destructive p-1.5"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <Crown className="w-3 h-3 inline text-amber-500 mr-0.5" /> <b>Dono:</b> acesso total —
          relatórios, cadastros sensíveis, cancelamento de venda, descontos acima do teto.
        </p>
        <p>
          <span className="inline-block w-3 h-3 rounded-full bg-slate-500 mr-0.5 align-middle" />{' '}
          <b>Vendedor:</b> opera o PDV. Para ações restritas, o sistema pede o PIN de um dono.
        </p>
      </div>

      <Dialog open={pinModalAberto} onOpenChange={setPinModalAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir PIN — {pinAlvo?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">
              Define um novo PIN para este vendedor. Útil quando ele esquece o PIN. Avise o PIN
              definido — ele pode trocar pelo próprio depois, em Configurações.
            </p>
            <div>
              <Label className="text-xs mb-1 block">Novo PIN (4 a 6 dígitos)</Label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinNovo}
                onChange={(e) => setPinNovo(sanitizarPin(e.target.value))}
                placeholder="••••"
                autoFocus
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Confirmar PIN</Label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinConfirmacao}
                onChange={(e) => setPinConfirmacao(sanitizarPin(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmarRedefinirPin()
                }}
                placeholder="••••"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {erroPin && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erroPin}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinModalAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarRedefinirPin} disabled={salvandoPin}>
              {salvandoPin ? 'Salvando...' : 'Salvar PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CadastroVendedores

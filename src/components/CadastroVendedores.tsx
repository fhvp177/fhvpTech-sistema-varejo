import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Vendedor = {
  id: number
  nome: string
  ativo: number
  vendas_count: number
}

const CadastroVendedores: FC = () => {
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editandoNome, setEditandoNome] = useState('')

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
    const resp = await window.api.vendedores.criar(novoNome)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovoNome('')
    await carregar()
  }

  const iniciarEdicao = (v: Vendedor) => {
    setEditandoId(v.id)
    setEditandoNome(v.nome)
    setErro('')
  }

  const cancelarEdicao = () => {
    setEditandoId(null)
    setEditandoNome('')
    setErro('')
  }

  const salvarEdicao = async (id: number) => {
    setErro('')
    if (!editandoNome.trim()) return
    const resp = await window.api.vendedores.atualizar(id, editandoNome)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    cancelarEdicao()
    await carregar()
  }

  const alternarAtivo = async (v: Vendedor) => {
    const resp = await window.api.vendedores.alternarAtivo(v.id, v.ativo === 0)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    await carregar()
  }

  const excluir = async (v: Vendedor) => {
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

  return (
    <div className="space-y-3">
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
        />
        <Button onClick={criar} size="icon" title="Adicionar vendedor">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {erro && (
        <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
      )}

      <div className="border rounded-lg max-h-80 overflow-y-auto">
        {vendedores.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Nenhum vendedor cadastrado. Adicione pelo menos um para registrar vendas.
          </p>
        ) : (
          <ul className="divide-y">
            {vendedores.map((v) => (
              <li
                key={v.id}
                className={`flex items-center gap-2 px-3 py-2 ${v.ativo === 0 ? 'opacity-60' : ''}`}
              >
                {editandoId === v.id ? (
                  <>
                    <Input
                      value={editandoNome}
                      onChange={(e) => setEditandoNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') salvarEdicao(v.id)
                        if (e.key === 'Escape') cancelarEdicao()
                      }}
                      autoFocus
                      className="h-8 flex-1"
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
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">
                      {v.nome}
                      {v.ativo === 0 && (
                        <span className="ml-2 text-xs text-muted-foreground italic">(inativo)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.vendas_count} venda{v.vendas_count !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => alternarAtivo(v)}
                      className={`p-1 ${v.ativo === 1 ? 'text-muted-foreground hover:text-foreground' : 'text-amber-600 hover:text-amber-700'}`}
                      title={v.ativo === 1 ? 'Desativar (some do PDV)' : 'Reativar'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => iniciarEdicao(v)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Renomear"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excluir(v)}
                      className="text-destructive/70 hover:text-destructive p-1"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Vendedores com vendas registradas não podem ser excluídos — apenas desativados.
        Vendedores inativos somem do seletor do PDV mas continuam aparecendo no histórico.
      </p>
    </div>
  )
}

export default CadastroVendedores

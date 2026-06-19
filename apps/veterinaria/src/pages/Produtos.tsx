import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Power, AlertCircle } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'

const formatarReais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parsePreco = (v: string) => parseFloat(v.replace(',', '.'))

const Produtos: FC = () => {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [novoEstoque, setNovoEstoque] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edNome, setEdNome] = useState('')
  const [edPreco, setEdPreco] = useState('')
  const [edEstoque, setEdEstoque] = useState('')

  const carregar = async () => {
    const resp = await window.api.produtos.listar()
    if (resp.success) setProdutos(resp.data)
  }

  useEffect(() => {
    carregar()
  }, [])

  const criar = async () => {
    setErro('')
    if (!novoNome.trim()) return
    const preco = parsePreco(novoPreco || '0')
    const estoque = parseInt(novoEstoque || '0', 10)
    if (isNaN(preco) || preco < 0) {
      setErro('Informe um preço válido.')
      return
    }
    if (isNaN(estoque) || estoque < 0) {
      setErro('Informe um estoque válido (número inteiro).')
      return
    }
    const resp = await window.api.produtos.criar({ nome: novoNome.trim(), preco, estoque })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovoNome('')
    setNovoPreco('')
    setNovoEstoque('')
    await carregar()
  }

  const iniciarEdicao = (p: Produto) => {
    setEditandoId(p.id)
    setEdNome(p.nome)
    setEdPreco(String(p.preco))
    setEdEstoque(String(p.estoque))
    setErro('')
  }

  const salvarEdicao = async (id: number) => {
    setErro('')
    if (!edNome.trim()) return
    const preco = parsePreco(edPreco || '0')
    const estoque = parseInt(edEstoque || '0', 10)
    if (isNaN(preco) || preco < 0 || isNaN(estoque) || estoque < 0) {
      setErro('Preço e estoque precisam ser valores válidos.')
      return
    }
    const resp = await window.api.produtos.atualizar(id, { nome: edNome.trim(), preco, estoque })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setEditandoId(null)
    await carregar()
  }

  const alternarAtivo = async (p: Produto) => {
    const resp = await window.api.produtos.alternarAtivo(p.id, p.ativo === 0)
    if (!resp.success) setErro(resp.error)
    else await carregar()
  }

  const excluir = async (p: Produto) => {
    if (!confirm(`Excluir o produto "${p.nome}"?`)) return
    const resp = await window.api.produtos.deletar(p.id)
    if (!resp.success) setErro(resp.error)
    else await carregar()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        Catálogo de produtos e medicamentos, com estoque. A venda dá baixa no estoque.
      </p>

      <div className="flex gap-2 mb-2">
        <Input
          value={novoNome}
          onChange={(e) => {
            setNovoNome(e.target.value)
            setErro('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Nome do produto"
          className="flex-1"
        />
        <Input
          value={novoPreco}
          onChange={(e) => setNovoPreco(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Preço (R$)"
          inputMode="decimal"
          className="w-28"
        />
        <Input
          value={novoEstoque}
          onChange={(e) => setNovoEstoque(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Estoque"
          inputMode="numeric"
          className="w-24"
        />
        <Button onClick={criar} size="icon" title="Adicionar produto">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {erro && (
        <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5 mb-2">{erro}</p>
      )}

      <div className="border rounded-lg overflow-hidden">
        {produtos.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Nenhum produto cadastrado ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {produtos.map((p) =>
              editandoId === p.id ? (
                <li key={p.id} className="flex gap-2 px-3 py-2.5 bg-green-50/40">
                  <Input
                    value={edNome}
                    onChange={(e) => setEdNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarEdicao(p.id)
                      if (e.key === 'Escape') setEditandoId(null)
                    }}
                    autoFocus
                    className="h-8 flex-1"
                  />
                  <Input
                    value={edPreco}
                    onChange={(e) => setEdPreco(e.target.value)}
                    inputMode="decimal"
                    className="h-8 w-24"
                    title="Preço"
                  />
                  <Input
                    value={edEstoque}
                    onChange={(e) => setEdEstoque(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarEdicao(p.id)
                      if (e.key === 'Escape') setEditandoId(null)
                    }}
                    inputMode="numeric"
                    className="h-8 w-20"
                    title="Estoque"
                  />
                  <button
                    onClick={() => salvarEdicao(p.id)}
                    className="text-green-600 hover:text-green-700 p-1"
                    title="Salvar"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditandoId(null)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ) : (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${p.ativo === 0 ? 'opacity-60' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{p.nome}</span>
                    {p.ativo === 0 && (
                      <span className="ml-2 text-[10px] text-muted-foreground italic">(inativo)</span>
                    )}
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <span>
                        Estoque: <span className="tabular-nums">{p.estoque}</span>
                      </span>
                      {p.estoque <= 0 && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          <AlertCircle className="w-3 h-3" /> sem estoque
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatarReais(p.preco)}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => alternarAtivo(p)}
                      className={`p-1.5 ${
                        p.ativo === 1
                          ? 'text-muted-foreground hover:text-foreground'
                          : 'text-amber-600 hover:text-amber-700'
                      }`}
                      title={p.ativo === 1 ? 'Desativar' : 'Reativar'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => iniciarEdicao(p)}
                      className="text-muted-foreground hover:text-foreground p-1.5"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excluir(p)}
                      className="text-destructive/70 hover:text-destructive p-1.5"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

export default Produtos

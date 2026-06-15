import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Power } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'

const formatarReais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parsePreco = (v: string) => parseFloat(v.replace(',', '.'))

const Servicos: FC = () => {
  const [servicos, setServicos] = useState<Servico[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edNome, setEdNome] = useState('')
  const [edPreco, setEdPreco] = useState('')

  const carregar = async () => {
    const resp = await window.api.servicos.listar()
    if (resp.success) setServicos(resp.data)
  }

  useEffect(() => {
    carregar()
  }, [])

  const criar = async () => {
    setErro('')
    if (!novoNome.trim()) return
    const preco = parsePreco(novoPreco || '0')
    if (isNaN(preco) || preco < 0) {
      setErro('Informe um preço válido.')
      return
    }
    const resp = await window.api.servicos.criar({ nome: novoNome.trim(), preco })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setNovoNome('')
    setNovoPreco('')
    await carregar()
  }

  const iniciarEdicao = (s: Servico) => {
    setEditandoId(s.id)
    setEdNome(s.nome)
    setEdPreco(String(s.preco))
    setErro('')
  }

  const salvarEdicao = async (id: number) => {
    setErro('')
    if (!edNome.trim()) return
    const preco = parsePreco(edPreco || '0')
    if (isNaN(preco) || preco < 0) {
      setErro('Informe um preço válido.')
      return
    }
    const resp = await window.api.servicos.atualizar(id, { nome: edNome.trim(), preco })
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setEditandoId(null)
    await carregar()
  }

  const alternarAtivo = async (s: Servico) => {
    const resp = await window.api.servicos.alternarAtivo(s.id, s.ativo === 0)
    if (!resp.success) setErro(resp.error)
    else await carregar()
  }

  const excluir = async (s: Servico) => {
    if (!confirm(`Excluir o serviço "${s.nome}"?`)) return
    const resp = await window.api.servicos.deletar(s.id)
    if (!resp.success) setErro(resp.error)
    else await carregar()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground">Serviços</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        Catálogo de serviços da clínica (consulta, banho, cirurgia…). Usados no faturamento.
      </p>

      <div className="flex gap-2 mb-2">
        <Input
          value={novoNome}
          onChange={(e) => {
            setNovoNome(e.target.value)
            setErro('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Nome do serviço"
          className="flex-1"
        />
        <Input
          value={novoPreco}
          onChange={(e) => setNovoPreco(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criar()}
          placeholder="Preço (R$)"
          inputMode="decimal"
          className="w-32"
        />
        <Button onClick={criar} size="icon" title="Adicionar serviço">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {erro && (
        <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5 mb-2">{erro}</p>
      )}

      <div className="border rounded-lg overflow-hidden">
        {servicos.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Nenhum serviço cadastrado ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {servicos.map((s) =>
              editandoId === s.id ? (
                <li key={s.id} className="flex gap-2 px-3 py-2.5 bg-blue-50/30">
                  <Input
                    value={edNome}
                    onChange={(e) => setEdNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarEdicao(s.id)
                      if (e.key === 'Escape') setEditandoId(null)
                    }}
                    autoFocus
                    className="h-8 flex-1"
                  />
                  <Input
                    value={edPreco}
                    onChange={(e) => setEdPreco(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarEdicao(s.id)
                      if (e.key === 'Escape') setEditandoId(null)
                    }}
                    inputMode="decimal"
                    className="h-8 w-28"
                  />
                  <button
                    onClick={() => salvarEdicao(s.id)}
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
                  key={s.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${s.ativo === 0 ? 'opacity-60' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{s.nome}</span>
                    {s.ativo === 0 && (
                      <span className="ml-2 text-[10px] text-muted-foreground italic">(inativo)</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatarReais(s.preco)}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => alternarAtivo(s)}
                      className={`p-1.5 ${
                        s.ativo === 1
                          ? 'text-muted-foreground hover:text-foreground'
                          : 'text-amber-600 hover:text-amber-700'
                      }`}
                      title={s.ativo === 1 ? 'Desativar' : 'Reativar'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => iniciarEdicao(s)}
                      className="text-muted-foreground hover:text-foreground p-1.5"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excluir(s)}
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

export default Servicos

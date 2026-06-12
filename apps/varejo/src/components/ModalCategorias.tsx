import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'

type Categoria = { id: number; nome: string; produtos_count: number }

type Props = {
  aberto: boolean
  onFechar: () => void
  onMudancas: () => void
}

const ModalCategorias: FC<Props> = ({ aberto, onFechar, onMudancas }) => {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [novaNome, setNovaNome] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editandoNome, setEditandoNome] = useState('')

  const carregar = async () => {
    const resp = await window.api.categorias.listar()
    if (resp.success) setCategorias(resp.data)
  }

  useEffect(() => {
    if (aberto) {
      carregar()
      setNovaNome('')
      setErro('')
      setEditandoId(null)
    }
  }, [aberto])

  const criar = async () => {
    setErro('')
    if (!novaNome.trim()) return
    const resp = await window.api.categorias.criar(novaNome)
    if (!resp.success) { setErro(resp.error); return }
    setNovaNome('')
    await carregar()
    onMudancas()
  }

  const iniciarEdicao = (c: Categoria) => {
    setEditandoId(c.id)
    setEditandoNome(c.nome)
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
    const resp = await window.api.categorias.atualizar(id, editandoNome)
    if (!resp.success) { setErro(resp.error); return }
    cancelarEdicao()
    await carregar()
    onMudancas()
  }

  const excluir = async (c: Categoria) => {
    let mensagem = `Excluir a categoria "${c.nome}"?`
    if (c.produtos_count > 0) {
      mensagem =
        `A categoria "${c.nome}" está sendo usada por ${c.produtos_count} produto` +
        `${c.produtos_count !== 1 ? 's' : ''}.\n\n` +
        `Esses produtos vão ficar SEM categoria após a exclusão.\n\n` +
        `Deseja continuar?`
    }
    if (!confirm(mensagem)) return
    const resp = await window.api.categorias.deletar(c.id)
    if (!resp.success) { setErro(resp.error); return }
    await carregar()
    onMudancas()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar categorias</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={novaNome}
              onChange={(e) => { setNovaNome(e.target.value); setErro('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') criar() }}
              placeholder="Nova categoria"
            />
            <Button onClick={criar} size="icon" title="Adicionar">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {erro && (
            <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">
              {erro}
            </p>
          )}

          <div className="border rounded-lg max-h-80 overflow-y-auto">
            {categorias.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">
                Nenhuma categoria cadastrada.
              </p>
            ) : (
              <ul className="divide-y">
                {categorias.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                    {editandoId === c.id ? (
                      <>
                        <Input
                          value={editandoNome}
                          onChange={(e) => setEditandoNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarEdicao(c.id)
                            if (e.key === 'Escape') cancelarEdicao()
                          }}
                          autoFocus
                          className="h-8 flex-1"
                        />
                        <button
                          onClick={() => salvarEdicao(c.id)}
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
                        <span className="flex-1 text-sm">{c.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.produtos_count} produto{c.produtos_count !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => iniciarEdicao(c)}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Renomear"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => excluir(c)}
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
            Renomear uma categoria atualiza automaticamente todos os produtos vinculados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ModalCategorias

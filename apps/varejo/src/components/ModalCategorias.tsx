import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Ruler } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Input } from '@fhvptech/core/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'

type Categoria = { id: number; nome: string; produtos_count: number; usa_tamanhos: number }

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

  const alternarTamanhos = async (c: Categoria) => {
    setErro('')
    const resp = await window.api.categorias.definirTamanhos(c.id, !c.usa_tamanhos)
    if (!resp.success) { setErro(resp.error); return }
    await carregar()
    onMudancas()
  }

  const confirmar = useConfirm()

  const excluir = async (c: Categoria) => {
    let mensagem = `Excluir a categoria "${c.nome}"?`
    if (c.produtos_count > 0) {
      mensagem =
        `A categoria "${c.nome}" está sendo usada por ${c.produtos_count} produto` +
        `${c.produtos_count !== 1 ? 's' : ''}.\n\n` +
        `Esses produtos vão ficar SEM categoria após a exclusão.\n\n` +
        `Deseja continuar?`
    }
    if (
      !(await confirmar({
        titulo: 'Excluir categoria',
        mensagem,
        variante: 'destructive'
      }))
    )
      return
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
                        {/*
                          ⚠️ `min-w-0` + `truncate` é o que alinha a linha inteira, e
                          não é enfeite.

                          Sem eles, o nome tem `min-width: auto` e se recusa a
                          encolher: categoria de nome comprido EMPURRA o ícone, a
                          contagem e os dois botões para a direita, e cada linha
                          para num lugar diferente. Era o que se via na foto —
                          quatro réguas em quatro posições. Com `min-w-0` o nome
                          absorve a diferença e todo o resto vira uma coluna fixa.
                        */}
                        <span className="min-w-0 flex-1 truncate text-sm" title={c.nome}>
                          {c.nome}
                        </span>
                        <button
                          onClick={() => alternarTamanhos(c)}
                          aria-pressed={!!c.usa_tamanhos}
                          className={`shrink-0 p-1 ${
                            c.usa_tamanhos
                              ? 'text-primary'
                              : 'text-muted-foreground/40 hover:text-muted-foreground'
                          }`}
                          title={
                            c.usa_tamanhos
                              ? 'Tem grade de tamanhos (P/M/G/GG) — clique para desligar'
                              : 'Sem tamanhos — clique para ativar a grade (P/M/G/GG)'
                          }
                        >
                          <Ruler className="w-4 h-4" />
                        </button>
                        {/*
                          Largura fixa e alinhada à direita: sem isso "1 produto" e
                          "12 produtos" têm larguras diferentes e desalinham o lápis
                          e a lixeira. `whitespace-nowrap` impede o que aparecia na
                          foto — a contagem quebrando em duas linhas e entortando a
                          altura da linha inteira.
                        */}
                        <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                          {c.produtos_count} produto{c.produtos_count !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => iniciarEdicao(c)}
                          className="shrink-0 text-muted-foreground hover:text-foreground p-1"
                          title="Renomear"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => excluir(c)}
                          className="shrink-0 text-destructive/70 hover:text-destructive p-1"
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
            O ícone <Ruler className="inline w-3.5 h-3.5 -mt-0.5" /> liga a grade de tamanhos
            (P/M/G/GG) no cadastro dos produtos desta categoria.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ModalCategorias

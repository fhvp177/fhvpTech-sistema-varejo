import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Input } from '@fhvptech/core/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'

/**
 * Cadastro das categorias de conta a pagar.
 *
 * ── Irmão do `ModalCategorias` dos produtos, com uma diferença ──────────────
 * Mesma tela, mesmos gestos: criar, renomear, excluir. O que NÃO vem junto é a
 * grade de tamanhos — ela é assunto de produto de vestuário e não significa
 * nada numa despesa.
 *
 * ── Por que renomear aqui é seguro ──────────────────────────────────────────
 * A conta guarda o NOME da categoria, não um id. Renomear propaga para todas as
 * contas que a usam (ver `categoriasConta.ts`), então o relatório de despesas
 * por categoria continua com uma linha só — que é o ponto do cadastro existir.
 *
 * ⚠️ Excluir NÃO apaga conta nenhuma. As despesas continuam no livro e no
 * relatório do mês; elas só passam a contar em "Sem categoria". Isso precisa
 * estar escrito no aviso, porque "excluir" numa tela de contas assusta — e com
 * razão.
 */

type Props = {
  aberto: boolean
  onFechar: () => void
  onMudancas: () => void
}

const ModalCategoriasConta: FC<Props> = ({ aberto, onFechar, onMudancas }) => {
  const [categorias, setCategorias] = useState<CategoriaConta[]>([])
  const [novaNome, setNovaNome] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editandoNome, setEditandoNome] = useState('')
  const confirmar = useConfirm()

  const carregar = async (): Promise<void> => {
    const r = await window.api.categoriasConta.listar()
    if (r.success) setCategorias(r.data)
  }

  useEffect(() => {
    if (!aberto) return
    void carregar()
    setNovaNome('')
    setErro('')
    setEditandoId(null)
  }, [aberto])

  const criar = async (): Promise<void> => {
    setErro('')
    if (!novaNome.trim()) return
    const r = await window.api.categoriasConta.criar(novaNome)
    if (!r.success) {
      setErro(r.error)
      return
    }
    setNovaNome('')
    await carregar()
    onMudancas()
  }

  const salvarEdicao = async (id: number): Promise<void> => {
    setErro('')
    if (!editandoNome.trim()) return
    const r = await window.api.categoriasConta.atualizar(id, editandoNome)
    if (!r.success) {
      setErro(r.error)
      return
    }
    setEditandoId(null)
    setEditandoNome('')
    await carregar()
    onMudancas()
  }

  const excluir = async (c: CategoriaConta): Promise<void> => {
    let mensagem = `Excluir a categoria "${c.nome}"?`
    if (c.contas_count > 0) {
      mensagem =
        `A categoria "${c.nome}" está em ${c.contas_count} conta` +
        `${c.contas_count !== 1 ? 's' : ''}. ` +
        'As contas continuam registradas, com valor e data — elas só passam a ' +
        'aparecer como "Sem categoria" no relatório de despesas. Deseja continuar?'
    }
    if (!(await confirmar({ titulo: 'Excluir categoria', mensagem, variante: 'destructive' })))
      return
    const r = await window.api.categoriasConta.deletar(c.id)
    if (!r.success) {
      setErro(r.error)
      return
    }
    await carregar()
    onMudancas()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Categorias de contas</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground -mt-1">
            Como suas despesas são agrupadas no relatório do mês.
          </p>

          <div className="flex gap-2">
            <Input
              value={novaNome}
              onChange={(e) => {
                setNovaNome(e.target.value)
                setErro('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void criar()
              }}
              placeholder="Nova categoria"
            />
            <Button onClick={criar} size="icon" title="Adicionar">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {erro && (
            <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
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
                            if (e.key === 'Enter') void salvarEdicao(c.id)
                            if (e.key === 'Escape') setEditandoId(null)
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
                          onClick={() => setEditandoId(null)}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        {/*
                          ⚠️ `min-w-0` + `truncate` é o que alinha a linha inteira.
                          Sem eles um nome comprido empurra a contagem e os botões
                          para a direita, e cada linha para num lugar diferente —
                          foi o que aconteceu na tela irmã, a de produtos.
                        */}
                        <span className="min-w-0 flex-1 truncate text-sm" title={c.nome}>
                          {c.nome}
                        </span>
                        <span className="w-24 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                          {c.contas_count > 0
                            ? `${c.contas_count} conta${c.contas_count !== 1 ? 's' : ''}`
                            : ''}
                        </span>
                        <button
                          onClick={() => {
                            setEditandoId(c.id)
                            setEditandoNome(c.nome)
                            setErro('')
                          }}
                          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                          title="Renomear"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => excluir(c)}
                          className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ModalCategoriasConta

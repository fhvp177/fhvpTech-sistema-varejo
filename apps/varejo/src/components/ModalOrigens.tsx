import { FC, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Input } from '@fhvptech/core/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'

type Origem = { id: number; nome: string; clientes_count: number }

type Props = {
  aberto: boolean
  onFechar: () => void
  onMudancas: () => void
}

/**
 * Gerencia as origens de captação, no mesmo molde do modal de categorias.
 *
 * ── Por que aqui, e não em Configurações ────────────────────────────────────
 * Abre por um botão ao lado do próprio seletor, no cadastro do cliente. É onde
 * a falta aparece: quem descobre que "Indicação" não está na lista é quem está
 * cadastrando alguém indicado, e mandá-lo a outra tela significa abandonar o
 * formulário pela metade. Categorias de produto já funcionam assim.
 *
 * ⚠️ Renomear NÃO toca em cliente nenhum — o vínculo é por id, não pelo nome
 * copiado. É a diferença deliberada em relação às categorias, e o porquê está
 * na migration 044.
 */
const ModalOrigens: FC<Props> = ({ aberto, onFechar, onMudancas }) => {
  const [origens, setOrigens] = useState<Origem[]>([])
  const [novaNome, setNovaNome] = useState('')
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editandoNome, setEditandoNome] = useState('')

  const carregar = async () => {
    const resp = await window.api.origens.listar()
    if (resp.success) setOrigens(resp.data)
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
    const resp = await window.api.origens.criar(novaNome)
    if (!resp.success) { setErro(resp.error); return }
    setNovaNome('')
    await carregar()
    onMudancas()
  }

  const iniciarEdicao = (o: Origem) => {
    setEditandoId(o.id)
    setEditandoNome(o.nome)
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
    const resp = await window.api.origens.atualizar(id, editandoNome)
    if (!resp.success) { setErro(resp.error); return }
    cancelarEdicao()
    await carregar()
    onMudancas()
  }

  const confirmar = useConfirm()

  const excluir = async (o: Origem) => {
    /*
     * ⚠️ Diz quantos clientes perdem a origem ANTES de perguntar.
     *
     * Apagar aqui não apaga cliente nenhum, mas apaga a resposta de "de onde
     * veio essa gente" — e essa resposta não tem como ser reconstruída depois.
     * O número no aviso é o que faz a diferença entre apagar um rótulo de teste
     * e apagar meio ano de captação.
     */
    let mensagem = `Excluir a origem "${o.nome}"?`
    if (o.clientes_count > 0) {
      mensagem =
        `${o.clientes_count} cliente${o.clientes_count !== 1 ? 's' : ''} ` +
        `${o.clientes_count !== 1 ? 'vieram' : 'veio'} por "${o.nome}".\n\n` +
        `Eles continuam cadastrados, mas passam a ficar sem origem — e o ` +
        `relatório de captação deixa de contá-los neste canal.\n\n` +
        `Deseja continuar?`
    }
    if (
      !(await confirmar({
        titulo: 'Excluir origem',
        mensagem,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.origens.deletar(o.id)
    if (!resp.success) { setErro(resp.error); return }
    await carregar()
    onMudancas()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como o cliente chegou</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={novaNome}
              onChange={(e) => { setNovaNome(e.target.value); setErro('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') criar() }}
              placeholder="Ex.: Feira, Google, Panfleto"
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
            {origens.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">
                Nenhuma origem cadastrada.
              </p>
            ) : (
              <ul className="divide-y">
                {origens.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                    {editandoId === o.id ? (
                      <>
                        <Input
                          value={editandoNome}
                          onChange={(e) => setEditandoNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarEdicao(o.id)
                            if (e.key === 'Escape') cancelarEdicao()
                          }}
                          autoFocus
                          className="h-8 flex-1"
                        />
                        <button
                          onClick={() => salvarEdicao(o.id)}
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
                        <span className="flex-1 text-sm">{o.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.clientes_count} cliente{o.clientes_count !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => iniciarEdicao(o)}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Renomear"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => excluir(o)}
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
            Renomear uma origem não altera nenhum cliente: eles continuam ligados a ela.
            O relatório de captação, em Relatórios, cruza estas origens com o que cada
            grupo comprou.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ModalOrigens

import { FC, useEffect, useRef, useState } from 'react'
import { Search, Tag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export type ProdutoConsulta = {
  id: number
  codigo_barras: string
  nome: string
  preco: number
  estoque: number
}

type Props = {
  aberto: boolean
  onFechar: () => void
  produtos: ProdutoConsulta[]
}

const fmt = (valor: number): string =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Modal disparado por F2 no PDV: permite consultar o preço de um produto
// sem adicioná-lo ao carrinho. Útil quando o cliente pergunta "quanto custa?"
// e o vendedor não quer mexer no estado da venda em andamento.
const ConsultaPreco: FC<Props> = ({ aberto, onFechar, produtos }) => {
  const [termo, setTermo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setTermo('')
      // pequeno delay pra garantir foco depois do dialog abrir
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [aberto])

  const termoLimpo = termo.trim().toLowerCase()
  const filtrados = !termoLimpo
    ? []
    : produtos
        .filter(
          (p) =>
            p.nome.toLowerCase().includes(termoLimpo) ||
            p.codigo_barras.includes(termoLimpo)
        )
        .slice(0, 30)

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Consulta de preço <span className="text-xs font-normal text-muted-foreground ml-1">(F2)</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite o nome ou código de barras do produto..."
            className="pl-9 h-11"
          />
        </div>

        <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          {!termoLimpo ? (
            <p className="text-center py-10 text-sm text-muted-foreground">
              Digite acima para buscar um produto.
            </p>
          ) : filtrados.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">
              Nenhum produto encontrado para "{termo}".
            </p>
          ) : (
            <ul className="divide-y">
              {filtrados.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{p.nome}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.codigo_barras}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-primary leading-tight">{fmt(p.preco)}</p>
                    <p
                      className={`text-xs mt-0.5 ${
                        p.estoque === 0
                          ? 'text-destructive'
                          : p.estoque <= 5
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {p.estoque === 0 ? 'Sem estoque' : `${p.estoque} em estoque`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center -mt-1">
          Esta consulta não altera o carrinho. Pressione <kbd className="px-1.5 py-0.5 border rounded text-[10px] font-mono">ESC</kbd> para fechar.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export default ConsultaPreco

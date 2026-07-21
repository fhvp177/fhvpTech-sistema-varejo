import { FC, useCallback, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import { AlertTriangle, Check, Layers, Search } from 'lucide-react'

// Classificação fiscal dos produtos — NCM e companhia.
//
// Por que existe uma tela só pra isso: sem NCM o produto não sai em nota, e uma
// loja tem centenas de produtos. Preencher um a um seria cruel, então o caminho
// principal aqui é aplicar A MESMA classificação a um grupo inteiro de uma vez
// (por categoria ou por seleção) — que é como o lojista realmente trabalha:
// "todas as camisetas usam o mesmo NCM".
//
// O que a tela NÃO faz: adivinhar. NCM é decisão fiscal do contador; aqui só
// existe o meio de registrar o que ele disser. Um NCM chutado passa pela SEFAZ
// e vira problema do lojista numa fiscalização — não dá erro nenhum na hora.

const CLASSE_SELECT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

const UNIDADES = ['UN', 'PC', 'CX', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'PAR', 'DZ']

type Props = { aberta: boolean; onFechar: () => void; onMudou?: () => void }

const ClassificacaoFiscal: FC<Props> = ({ aberta, onFechar, onMudou }) => {
  const [lista, setLista] = useState<ProdutoClassificacao[]>([])
  const [categorias, setCategorias] = useState<Array<{ categoria: string | null; total: number }>>([])
  const [apenasPendentes, setApenasPendentes] = useState(true)
  const [busca, setBusca] = useState('')
  const [selecao, setSelecao] = useState<Set<number>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Valores a aplicar. Campo em branco = "não mexer neste".
  const [ncm, setNcm] = useState('')
  const [cfop, setCfop] = useState('')
  const [cst, setCst] = useState('')
  const [origem, setOrigem] = useState('')
  const [unidade, setUnidade] = useState('')

  const carregar = useCallback(async () => {
    const [rl, rc] = await Promise.all([
      window.api.fiscal.listarClassificacao({ apenasPendentes, busca }),
      window.api.fiscal.categoriasPendentes()
    ])
    if (rl.success) setLista(rl.data)
    if (rc.success) setCategorias(rc.data)
  }, [apenasPendentes, busca])

  useEffect(() => {
    if (aberta) carregar()
  }, [aberta, carregar])

  const alternar = (id: number) =>
    setSelecao((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const selecionarTodos = () =>
    setSelecao((s) => (s.size === lista.length ? new Set() : new Set(lista.map((p) => p.id))))

  const aplicar = async (alvo: { ids?: number[]; categoria?: string | null }) => {
    if (!ncm && !cfop && !cst && !origem && !unidade) {
      setFeedback('Preencha ao menos um campo para aplicar.')
      return
    }
    setSalvando(true)
    setFeedback(null)
    const r = await window.api.fiscal.aplicarEmLote({
      ...alvo,
      dados: { ncm, cfop, cst_csosn: cst, origem, unidade },
      // Aplicar por categoria nunca sobrescreve o que o contador já ajustou.
      somentePendentes: alvo.categoria !== undefined
    })
    setSalvando(false)
    if (!r.success) {
      setFeedback(r.error)
      return
    }
    setFeedback(
      r.data.atualizados === 0
        ? 'Nenhum produto foi alterado.'
        : `${r.data.atualizados} ${r.data.atualizados === 1 ? 'produto classificado' : 'produtos classificados'}.`
    )
    setSelecao(new Set())
    await carregar()
    onMudou?.()
  }

  const pendentes = lista.filter((p) => !p.ncm?.trim()).length

  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Classificação fiscal dos produtos</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            O <strong>NCM</strong> é o código que diz à Receita o que é cada produto.{' '}
            <strong>Quem informa é o seu contador</strong> — o sistema não adivinha, porque um
            código errado passa pela SEFAZ e só aparece numa fiscalização. Produtos que entraram
            por XML de fornecedor já vieram classificados.
          </p>
        </div>

        {/* Valores a aplicar */}
        <div className="rounded-md border p-3 space-y-3">
          <p className="text-sm font-medium">O que aplicar</p>
          <div className="grid grid-cols-5 gap-2">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="lncm">NCM</Label>
              <Input
                id="lncm"
                inputMode="numeric"
                maxLength={8}
                value={ncm}
                onChange={(e) => setNcm(soDigitos(e.target.value).slice(0, 8))}
                placeholder="8 dígitos"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcfop">CFOP</Label>
              <Input
                id="lcfop"
                inputMode="numeric"
                maxLength={4}
                value={cfop}
                onChange={(e) => setCfop(soDigitos(e.target.value).slice(0, 4))}
                placeholder="5102"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcst">CSOSN</Label>
              <Input
                id="lcst"
                inputMode="numeric"
                maxLength={4}
                value={cst}
                onChange={(e) => setCst(soDigitos(e.target.value).slice(0, 4))}
                placeholder="102"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lun">Unidade</Label>
              <select
                id="lun"
                className={CLASSE_SELECT}
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              >
                <option value="">—</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="lorig">Origem</Label>
            <select
              id="lorig"
              className={CLASSE_SELECT}
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
            >
              <option value="">— não alterar —</option>
              <option value="0">Nacional</option>
              <option value="1">Importado direto</option>
              <option value="2">Importado no mercado interno</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Campo em branco não é alterado nos produtos.
          </p>
        </div>

        {/* Atalho: aplicar a uma categoria inteira */}
        {categorias.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Aplicar a uma categoria inteira
            </p>
            <div className="flex flex-wrap gap-2">
              {categorias.map((c) => (
                <Button
                  key={c.categoria ?? '_sem_'}
                  variant="outline"
                  size="sm"
                  disabled={salvando}
                  onClick={() => aplicar({ categoria: c.categoria })}
                >
                  {c.categoria ?? 'Sem categoria'}
                  <span className="ml-1.5 text-xs text-muted-foreground">({c.total})</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Aplica só aos produtos da categoria que ainda estão sem NCM — nunca sobrescreve o
              que já foi classificado.
            </p>
          </div>
        )}

        {/* Lista */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto…"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={apenasPendentes}
                onChange={(e) => setApenasPendentes(e.target.checked)}
              />
              Só os que faltam
            </label>
          </div>

          <div className="border rounded-md max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="p-2 w-8">
                    <input
                      type="checkbox"
                      checked={lista.length > 0 && selecao.size === lista.length}
                      onChange={selecionarTodos}
                    />
                  </th>
                  <th className="p-2 text-left font-medium">Produto</th>
                  <th className="p-2 text-left font-medium w-28">Categoria</th>
                  <th className="p-2 text-left font-medium w-24">NCM</th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      {apenasPendentes
                        ? 'Nenhum produto pendente — todos já têm NCM.'
                        : 'Nenhum produto encontrado.'}
                    </td>
                  </tr>
                ) : (
                  lista.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selecao.has(p.id)}
                          onChange={() => alternar(p.id)}
                        />
                      </td>
                      <td className="p-2 truncate max-w-[260px]" title={p.nome}>
                        {p.nome}
                      </td>
                      <td className="p-2 text-muted-foreground truncate">{p.categoria ?? '—'}</td>
                      <td className="p-2">
                        {p.ncm?.trim() ? (
                          <span className="text-emerald-700 font-mono text-xs">{p.ncm}</span>
                        ) : (
                          <span className="text-amber-700 text-xs">falta</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selecao.size > 0
                ? `${selecao.size} selecionado${selecao.size > 1 ? 's' : ''}`
                : `${pendentes} sem NCM nesta lista`}
            </p>
            <Button
              onClick={() => aplicar({ ids: [...selecao] })}
              disabled={salvando || selecao.size === 0}
            >
              <Check className="w-4 h-4 mr-1.5" />
              Aplicar aos selecionados
            </Button>
          </div>
        </div>

        {feedback && (
          <p className="text-sm text-center text-muted-foreground">{feedback}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ClassificacaoFiscal

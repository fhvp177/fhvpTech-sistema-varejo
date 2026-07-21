import { FC, useEffect, useState } from 'react'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { ChevronDown } from 'lucide-react'

// Classificação fiscal de UM produto, dentro do cadastro dele.
//
// Convive com a tela de classificação em massa: lá o lojista resolve o estoque
// inteiro de uma vez (o caminho normal); aqui ele ajusta um item específico —
// tipicamente quando o contador aponta uma correção, ou ao cadastrar um produto
// novo que não se encaixa na regra da categoria.
//
// Fica RECOLHIDO por padrão: a maioria dos cadastros não mexe nisso, e abrir a
// tela de produto já cheia de campo fiscal assustaria quem só quer cadastrar
// uma camiseta.

const CLASSE_SELECT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

const UNIDADES = ['UN', 'PC', 'CX', 'KG', 'G', 'L', 'ML', 'M', 'M2', 'PAR', 'DZ']

type Props = {
  /** Produto em edição; null quando é cadastro novo (salva depois de criar). */
  produtoId: number | null
  valor: FiscalProduto
  onChange: (v: FiscalProduto) => void
}

const FiscalProdutoCampos: FC<Props> = ({ produtoId, valor, onChange }) => {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!produtoId) return
    let vivo = true
    window.api.fiscal.obterProduto(produtoId).then((r) => {
      if (vivo && r.success && r.data) onChange(r.data)
    })
    return () => {
      vivo = false
    }
    // Só ao trocar de produto — não a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])

  const alterar = <K extends keyof FiscalProduto>(campo: K, v: FiscalProduto[K]) =>
    onChange({ ...valor, [campo]: v })

  const temNcm = Boolean(valor.ncm?.trim())

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="text-sm font-medium flex items-center gap-2">
          Dados para nota fiscal
          {temNcm ? (
            <span className="text-xs font-normal text-emerald-700">NCM {valor.ncm}</span>
          ) : (
            <span className="text-xs font-normal text-amber-700">sem NCM</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="p-3 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Sem NCM o produto não sai em nota. <strong>Quem informa é o seu contador</strong> — o
            sistema não adivinha. Para classificar vários de uma vez, use a tela de Nota fiscal.
          </p>

          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="pncm">NCM</Label>
              <Input
                id="pncm"
                inputMode="numeric"
                maxLength={8}
                value={valor.ncm}
                onChange={(e) => alterar('ncm', soDigitos(e.target.value).slice(0, 8))}
                placeholder="8 dígitos"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pcfop">CFOP</Label>
              <Input
                id="pcfop"
                inputMode="numeric"
                maxLength={4}
                value={valor.cfop}
                onChange={(e) => alterar('cfop', soDigitos(e.target.value).slice(0, 4))}
                placeholder="padrão"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pcst">CSOSN</Label>
              <Input
                id="pcst"
                inputMode="numeric"
                maxLength={4}
                value={valor.cst_csosn}
                onChange={(e) => alterar('cst_csosn', soDigitos(e.target.value).slice(0, 4))}
                placeholder="102"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="porig">Origem</Label>
              <select
                id="porig"
                className={CLASSE_SELECT}
                value={valor.origem || '0'}
                onChange={(e) => alterar('origem', e.target.value)}
              >
                <option value="0">Nacional</option>
                <option value="1">Importado direto</option>
                <option value="2">Importado no mercado interno</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pun">Unidade</Label>
              <select
                id="pun"
                className={CLASSE_SELECT}
                value={valor.unidade || 'UN'}
                onChange={(e) => alterar('unidade', e.target.value)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FiscalProdutoCampos

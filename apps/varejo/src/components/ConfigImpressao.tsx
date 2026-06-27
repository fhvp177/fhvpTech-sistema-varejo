import { FC, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Label } from '@fhvptech/core/ui/label'

type Impressora = { name: string; displayName: string; isDefault: boolean }
type Pref = { printer: string; direto: boolean }
type Prefs = { cupom: Pref; documento: Pref }
type Categoria = 'cupom' | 'documento'

const CLASSE_SELECT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

const ConfigImpressao: FC = () => {
  const [impressoras, setImpressoras] = useState<Impressora[]>([])
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.impressao.listarImpressoras(),
      window.api.impressao.obterPreferencias()
    ]).then(([rImp, rPref]) => {
      if (rImp.success) setImpressoras(rImp.data)
      if (rPref.success) setPrefs(rPref.data)
    })
  }, [])

  const atualizar = async (cat: Categoria, patch: Partial<Pref>) => {
    if (!prefs) return
    const novo: Prefs = { ...prefs, [cat]: { ...prefs[cat], ...patch } }
    setPrefs(novo)
    await window.api.impressao.salvarPreferencias({ [cat]: novo[cat] })
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1500)
  }

  if (!prefs) {
    return <p className="text-sm text-muted-foreground">Carregando impressoras…</p>
  }
  if (impressoras.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma impressora instalada no Windows foi encontrada. Instale uma e reabra esta tela.
      </p>
    )
  }

  const bloco = (cat: Categoria, titulo: string, descricao: string) => {
    const pref = prefs[cat]
    // Valor mostrado: a impressora salva ou, se nenhuma, a padrão do Windows.
    const valor = pref.printer || (impressoras.find((i) => i.isDefault)?.name ?? impressoras[0].name)
    return (
      <div className="space-y-2">
        <Label className="font-medium">{titulo}</Label>
        <p className="text-xs text-muted-foreground -mt-1">{descricao}</p>
        <select
          value={valor}
          onChange={(e) => atualizar(cat, { printer: e.target.value })}
          className={CLASSE_SELECT}
        >
          {impressoras.map((i) => (
            <option key={i.name} value={i.name}>
              {i.displayName || i.name}
              {i.isDefault ? ' (padrão)' : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-0.5">
          <input
            type="checkbox"
            checked={pref.direto}
            // Ao ligar o direto, fixa a impressora mostrada como a preferida.
            onChange={(e) => atualizar(cat, { printer: valor, direto: e.target.checked })}
            className="w-4 h-4 rounded border-input accent-blue-600"
          />
          Imprimir direto, sem perguntar
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-md">
      {bloco(
        'cupom',
        'Cupom e comprovantes',
        'Recibos de venda e devolução — normalmente a impressora térmica.'
      )}
      {bloco(
        'documento',
        'Relatórios e etiquetas',
        'Relatórios de estoque/vendas e folhas de etiquetas A4.'
      )}
      <div className="h-4">
        {salvo && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" /> Salvo
          </span>
        )}
      </div>
    </div>
  )
}

export default ConfigImpressao

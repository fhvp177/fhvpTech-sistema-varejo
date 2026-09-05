import { FC, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'

type Impressora = { name: string; displayName: string; isDefault: boolean }
type Pref = { printer: string; direto: boolean }
type Prefs = { cupom: Pref; documento: Pref }
type Categoria = 'cupom' | 'documento'

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
  /*
   * Lista vazia quer dizer duas coisas MUITO diferentes, e a frase precisa
   * saber qual é:
   *
   *  • no app instalado, que não há impressora no Windows — e aí instalar uma
   *    resolve;
   *  • na web, que a página não enxerga impressora nenhuma, e não vai enxergar:
   *    quem conhece as impressoras é o sistema, e ele já mostra a lista dele na
   *    caixa de impressão. Não há nada a instalar nem a configurar.
   *
   * Mandar o lojista "instalar uma impressora e reabrir a tela" no celular
   * seria uma volta que nunca termina.
   */
  if (impressoras.length === 0) {
    return __ALVO__ === 'web' ? (
      <div className="text-sm text-muted-foreground space-y-2">
        <p>
          Por aqui a impressora é escolhida na hora de imprimir, na própria caixa de
          impressão do aparelho — ela já lista as impressoras disponíveis, e também
          oferece "Salvar como PDF".
        </p>
        <p>
          Nada a configurar aqui: esta seção só tem o que ajustar no aplicativo
          instalado no computador da loja.
        </p>
      </div>
    ) : (
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
        <Select
          value={valor}
          onChange={(v) => atualizar(cat, { printer: v })}
          opcoes={impressoras.map((i) => ({
            valor: i.name,
            rotulo: `${i.displayName || i.name}${i.isDefault ? ' (padrão)' : ''}`
          }))}
        />
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

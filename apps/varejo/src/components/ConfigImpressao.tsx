import { FC, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'

type Impressora = { name: string; displayName: string; isDefault: boolean }
type Pref = { printer: string; direto: boolean }
type Prefs = { cupom: Pref; documento: Pref; papelCaixa: PapelCaixa }
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

  const escolherPapelCaixa = async (papelCaixa: PapelCaixa) => {
    if (!prefs) return
    setPrefs({ ...prefs, papelCaixa })
    await window.api.impressao.salvarPreferencias({ papelCaixa })
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

      {/*
        ⚠️ Esta escolha muda o LAYOUT do papel, não só a impressora. Os dois
        comprovantes de caixa têm duas versões: uma de 68mm, para a bobina, e
        uma de folha. Mandar a de bobina para a folha sai como uma tira no meio
        da página, e a de folha para a bobina sai cortada.

        O padrão é a bobina porque a impressora que existe ao lado de um caixa
        é a térmica; a de folha costuma estar no escritório, ou não existir.
      */}
      <div className="space-y-2">
        <Label className="font-medium">Abertura e fechamento de caixa</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Em que papel saem os dois comprovantes do turno.
        </p>
        <div className="grid gap-1.5">
          {(
            [
              {
                valor: 'termica' as const,
                titulo: 'Impressora térmica (bobina 80mm)',
                descricao: 'O formato de cupom, igual ao da venda. É o padrão.'
              },
              {
                valor: 'a4' as const,
                titulo: 'Folha A4',
                descricao: 'Formato de relatório, para arquivar ou assinar.'
              }
            ]
          ).map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => void escolherPapelCaixa(op.valor)}
              aria-pressed={prefs.papelCaixa === op.valor}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                prefs.papelCaixa === op.valor
                  ? 'border-primary bg-primary/10'
                  : 'hover:bg-muted/50'
              }`}
            >
              <span className="block text-sm font-medium">{op.titulo}</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {op.descricao}
              </span>
            </button>
          ))}
        </div>
      </div>
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

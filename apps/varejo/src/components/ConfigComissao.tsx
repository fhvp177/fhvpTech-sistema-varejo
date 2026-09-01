import { FC, useCallback, useEffect, useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'
import CampoPercentual, {
  numeroParaPercentual,
  percentualParaNumero
} from '@/components/CampoPercentual'
import { useComissoes } from '@/App'

// Percentual padrão de comissão da loja.
//
// É aqui que o módulo nasce: enquanto o padrão for 0 e ninguém tiver percentual
// próprio, a aba "Comissões" não existe no menu. Definir um percentual É o ato
// de ligar — por isso o texto abaixo diz explicitamente o que vai acontecer,
// senão o gerente salva e não entende por que uma aba nova apareceu.

const ConfigComissao: FC = () => {
  const { showToast } = useToast()
  const { recarregar: recarregarComissoes } = useComissoes()
  const [valor, setValor] = useState('')
  const [salvo, setSalvo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const resp = await window.api.comissoes.obterPadrao()
    if (resp.success) {
      const texto = resp.data > 0 ? numeroParaPercentual(resp.data) : ''
      setValor(texto)
      setSalvo(texto)
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const salvar = async (): Promise<void> => {
    const pct = percentualParaNumero(valor) ?? 0
    setSalvando(true)
    const resp = await window.api.comissoes.definirPadrao(pct)
    setSalvando(false)
    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      return
    }
    setSalvo(valor)
    await recarregarComissoes()
    showToast({
      message:
        pct > 0
          ? 'Percentual salvo. A aba Comissões está em Financeiro.'
          : 'Percentual zerado — nenhuma comissão será calculada.',
      variant: 'success'
    })
  }

  const mudou = valor !== salvo

  return (
    <div className="border rounded-lg p-4 flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">
        <BadgePercent className="w-5 h-5" />
      </div>
      <div className="flex-1 space-y-3">
        <div>
          <p className="font-medium text-sm">Comissão dos vendedores</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Percentual sobre o valor da venda, já com o desconto abatido e sem o que foi
            devolvido. Venda cancelada não gera comissão.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="grid gap-1.5 w-36">
            <Label htmlFor="comissao-padrao">Percentual padrão</Label>
            <CampoPercentual
              id="comissao-padrao"
              valor={valor}
              onChange={setValor}
              disabled={carregando}
            />
          </div>
          <Button onClick={salvar} disabled={!mudou || salvando || carregando} size="sm">
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {salvo
            ? 'Vale para quem não tem percentual próprio. A aba Comissões fica em Financeiro, só para o gerente.'
            : 'Em branco ou zero: nenhuma comissão é calculada e a aba não aparece no menu. Defina um percentual para ligar.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Cada vendedor pode ter o seu percentual em <strong>Vendedores</strong>, logo abaixo.
          Mudar o percentual não altera as vendas já feitas: cada venda guarda o percentual que
          valia no dia, para que um mês já pago nunca mude de valor.
        </p>
      </div>
    </div>
  )
}

export default ConfigComissao

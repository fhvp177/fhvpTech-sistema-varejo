import { FC, useCallback, useEffect, useState } from 'react'
import { Interruptor } from '@fhvptech/core/ui/interruptor'
import { useToast } from '@fhvptech/core/ui/toast'

/**
 * Esta loja oferece venda parcelada?
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Pode tirar aqui esse parcelado" (12/09/2026). A loja que pediu vende com
 * sinal e saldo, nunca em carnê, e a opção extra só atrapalha quem opera o
 * balcão.
 *
 * ── ⚠️ Por que interruptor, e não remoção ───────────────────────────────────
 * Crediário parcelado é o meio de vida de boa parte do comércio pequeno.
 * Apagar a condição atenderia um lojista cobrando a conta de todos os outros.
 *
 * ── ⚠️ Desligar NÃO apaga o que já existe ───────────────────────────────────
 * As vendas parceladas em aberto continuam na lista, continuam recebendo baixa
 * de parcela e continuam podendo ser estornadas. Sumir com elas seria esconder
 * dívida de cliente do próprio lojista — a frase está na tela porque é a dúvida
 * que aparece na hora de virar a chave.
 */

const ConfigParcelamento: FC<{ onMudou?: (permite: boolean) => void }> = ({ onMudou }) => {
  const { showToast } = useToast()
  const [permite, setPermite] = useState(true)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const r = await window.api.vendas.permiteParcelamento()
    if (r.success) {
      setPermite(r.data as boolean)
      onMudou?.(r.data as boolean)
    }
    setCarregando(false)
    // `onMudou` de propósito fora das dependências: o pai costuma passar uma
    // função nova a cada render, e incluí-la aqui recarregaria em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const alternar = async (valor: boolean): Promise<void> => {
    const r = await window.api.vendas.definirPermissaoParcelamento(valor)
    if (!r.success) {
      showToast({ message: r.error, variant: 'destructive' })
      return
    }
    setPermite(valor)
    onMudou?.(valor)
    showToast({
      message: valor
        ? 'O parcelamento volta a aparecer no caixa.'
        : 'O caixa deixa de oferecer parcelamento. As vendas parceladas que já existem continuam normais.',
      variant: 'success'
    })
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Oferecer venda parcelada</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Ligado, o caixa oferece a condição &quot;Parcelado&quot;, que divide o valor em
            parcelas com vencimentos mensais. Desligado, ficam só &quot;À vista&quot; e
            &quot;A prazo&quot;. As vendas parceladas que já existem continuam como estão, e
            você segue recebendo as parcelas delas normalmente.
          </p>
        </div>
        <Interruptor
          ligado={permite}
          onAlternar={alternar}
          desabilitado={carregando}
          rotulo="Oferecer venda parcelada"
        />
      </div>
    </div>
  )
}

export default ConfigParcelamento

import { FC, useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useToast } from '@fhvptech/core/ui/toast'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { useModulos } from '@/App'

// Módulos opcionais desta loja.
//
// Diferente das flags __FEAT_* (decididas ao gerar o instalador, valem pra
// edição inteira), o que está aqui é POR LOJA e pode ser ligado no próprio app.
// O porquê dessa escolha está no ModulosContext, em App.tsx.

const ConfigModulos: FC = () => {
  const { emprestimos, recarregar } = useModulos()
  const { showToast } = useToast()
  const confirmar = useConfirm()
  const [salvando, setSalvando] = useState(false)

  const alternarEmprestimos = async (): Promise<void> => {
    const ligando = !emprestimos

    // Desligar não apaga nada — mas quem clica precisa saber disso, senão hesita
    // achando que vai perder o histórico.
    if (!ligando) {
      const ok = await confirmar({
        titulo: 'Desligar Empréstimos?',
        mensagem:
          'A aba some do menu. Nenhum empréstimo é apagado — voltando a ligar, tudo reaparece como estava.',
        rotuloConfirmar: 'Desligar',
        rotuloCancelar: 'Manter ligado'
      })
      if (!ok) return
    }

    setSalvando(true)
    const resp = await window.api.emprestimos.definirModulo(ligando)
    setSalvando(false)

    if (!resp.success) {
      showToast({ message: resp.error, variant: 'destructive' })
      return
    }
    await recarregar()
    showToast({
      message: ligando ? 'Empréstimos ligado.' : 'Empréstimos desligado.',
      variant: 'success'
    })
  }

  return (
    <div className="border rounded-lg p-4 flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">
        <HandCoins className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-sm">Empréstimos</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Controle dos valores emprestados a clientes: quanto há a receber, quem está em atraso
          e o extrato de cada um. Não integra o faturamento nem o estoque.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {emprestimos
            ? 'Ligado — a aba aparece em Financeiro, só para o gerente.'
            : 'Desligado — a aba não aparece no menu.'}
        </p>
      </div>
      <Button
        variant={emprestimos ? 'outline' : 'default'}
        size="sm"
        onClick={alternarEmprestimos}
        disabled={salvando}
      >
        {emprestimos ? 'Desligar' : 'Ligar'}
      </Button>
    </div>
  )
}

export default ConfigModulos

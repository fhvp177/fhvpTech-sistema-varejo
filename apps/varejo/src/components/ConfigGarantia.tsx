import { FC, useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'

/**
 * O prazo de garantia padrão da loja.
 *
 * ── ⚠️ Mudar aqui NÃO mexe em quem já comprou ───────────────────────────────
 * O prazo é congelado no item da venda no instante da compra (migration 051).
 * Baixar este número encurta a garantia das vendas NOVAS, e só delas: quem
 * comprou ontem continua com o prazo que estava valendo ontem.
 *
 * Isso está escrito na tela, e não só no código, porque é exatamente a dúvida
 * que aparece na hora de mexer neste campo. Sem a frase, o lojista hesita ou,
 * pior, muda achando que está mudando o passado.
 *
 * ── Por que 90 dias é o padrão ──────────────────────────────────────────────
 * É o prazo legal do Código de Defesa do Consumidor para produto durável. A
 * loja pode prometer mais; menos que isso não vale contra o cliente, e o texto
 * do campo diz isso sem dar a entender que é conselho jurídico.
 */

const ConfigGarantia: FC<{ onSalvo?: (dias: number) => void }> = ({ onSalvo }) => {
  const { showToast } = useToast()
  const [valor, setValor] = useState('')
  const [salvo, setSalvo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const r = await window.api.garantias.prazoPadrao()
    if (r.success) {
      const texto = String(r.data)
      setValor(texto)
      setSalvo(texto)
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const salvar = async (): Promise<void> => {
    const dias = Number(valor)
    if (!Number.isInteger(dias) || dias < 0 || dias > 3650) {
      setErro('Informe um número inteiro de dias, de 0 a 3650.')
      return
    }
    setErro('')
    setSalvando(true)
    const r = await window.api.garantias.definirPrazoPadrao(dias)
    setSalvando(false)
    if (!r.success) {
      showToast({ message: r.error, variant: 'destructive' })
      return
    }
    setSalvo(valor)
    onSalvo?.(dias)
    showToast({
      message:
        dias > 0
          ? `Novo prazo salvo: ${dias} dias. Vale para as vendas daqui pra frente.`
          : 'Prazo zerado. As vendas novas sairão sem garantia.',
      variant: 'success'
    })
  }

  const mudou = valor !== salvo

  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <div className="mt-0.5 text-muted-foreground">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-3">
        <div>
          <p className="text-sm font-medium">Prazo padrão de garantia</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quantos dias a loja responde por um produto vendido. Vale para todo produto que não
            tenha um prazo próprio no cadastro. O padrão é 90 dias, que é o prazo previsto em lei
            para produto durável.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="grid w-36 gap-1.5">
            <Label htmlFor="garantia-padrao">Dias</Label>
            <Input
              id="garantia-padrao"
              type="number"
              min="0"
              max="3650"
              step="1"
              value={valor}
              disabled={carregando}
              onChange={(e) => {
                setValor(e.target.value)
                setErro('')
              }}
            />
          </div>
          <Button onClick={() => void salvar()} disabled={!mudou || salvando || carregando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {/*
          ⚠️ A frase mais importante deste bloco. Sem ela, a dúvida "isso vai
          encurtar a garantia de quem já comprou?" fica sem resposta bem na hora
          de decidir.
        */}
        <p className="rounded-md bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
          Mudar este número não mexe em nada que já foi vendido. Cada venda guarda o prazo que
          estava valendo no dia da compra, então quem comprou antes continua com a garantia que
          recebeu.
        </p>
      </div>
    </div>
  )
}

export default ConfigGarantia

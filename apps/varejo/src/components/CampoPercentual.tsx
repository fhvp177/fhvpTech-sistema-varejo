import { FC } from 'react'
import { IMaskInput } from 'react-imask'

/**
 * Campo de percentual (0 a 100, duas casas, vírgula decimal).
 *
 * Existe como componente próprio, e não como `<Input>` solto em cada tela, pelo
 * mesmo motivo dos campos de documento: percentual TEM forma. Um input cru
 * aceitaria "abc", "-5" e "300" sem reclamar, e o erro só apareceria na folha de
 * pagamento do fim do mês, já convertido em dinheiro pago a mais.
 *
 * A máscara segura a digitação; o backend valida de novo em `validarPct` — a
 * tela pode ser contornada, o canal não.
 *
 * `valor`/`onChange` trafegam como STRING porque é isso que o campo edita: o
 * meio da digitação ("3," antes do segundo dígito) não é um número válido, e
 * converter cedo demais faria o cursor pular enquanto a pessoa digita.
 */
const CampoPercentual: FC<{
  id: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
}> = ({ id, valor, onChange, placeholder = '0,00', disabled, className, autoFocus }) => (
  <div className="relative">
    <IMaskInput
      id={id}
      mask={Number}
      scale={2}
      radix=","
      mapToRadix={['.']}
      min={0}
      max={100}
      value={valor}
      onAccept={(v: string) => onChange(v)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="decimal"
      className={
        'flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-right ' +
        'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none ' +
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
        'disabled:cursor-not-allowed disabled:opacity-50 ' +
        (className ?? '')
      }
    />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
      %
    </span>
  </div>
)

/** '3,5' → 3.5 · '' → null (que significa "usa o padrão da loja"). */
export const percentualParaNumero = (v: string): number | null => {
  const limpo = v.trim().replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** 3.5 → '3,5' · null → '' */
export const numeroParaPercentual = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n).replace('.', ',')

export default CampoPercentual

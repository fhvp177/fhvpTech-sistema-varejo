/**
 * As máscaras dos campos com forma conhecida.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 * A regra da casa é "campo com formato TEM máscara", e ela já foi cobrada três
 * vezes. Na terceira, em 06/09, o que faltou não foi CPF nem telefone — foram
 * DINHEIRO, AGÊNCIA e CONTA, que o guarda automático não conhecia. O campo de
 * saldo aceitava letra.
 *
 * Concentrar aqui serve para duas coisas: a máscara nasce igual em toda tela, e
 * existe um lugar único para o teste apontar.
 *
 * ── ⚠️ Dinheiro não é `type="number"` ───────────────────────────────────────
 * O campo numérico do navegador aceita ponto e vírgula conforme o idioma da
 * máquina, mostra setinhas que ninguém quer, e no celular abre um teclado sem
 * vírgula. Aqui o valor é texto com máscara brasileira, e `paraNumero` faz a
 * conversão num lugar só.
 */

/** Classe visual dos campos mascarados — a mesma do `<Input>` do core. */
export const CLASSE_CAMPO =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/**
 * Dinheiro em reais: milhar com ponto, centavos com vírgula, nunca negativo.
 *
 * `scale: 2` trava em dois decimais e `padFractionalZeros` completa o "50" para
 * "50,00" ao sair do campo — sem isso, "1,5" viraria um real e cinquenta
 * centavos para o sistema e "um e cinco" para quem digitou.
 */
export const CLASSE_DINHEIRO = {
  mask: Number,
  scale: 2,
  thousandsSeparator: '.',
  radix: ',',
  mapToRadix: ['.'],
  padFractionalZeros: true,
  normalizeZeros: true,
  min: 0,
  max: 99999999,
  placeholder: '0,00',
  className: `num ${CLASSE_CAMPO}`,
  inputMode: 'decimal' as const
}

/** Agência: só dígitos, até 6. Banco nenhum usa letra. */
export const CLASSE_AGENCIA = {
  mask: '000000',
  placeholder: '0000',
  className: `num ${CLASSE_CAMPO}`,
  inputMode: 'numeric' as const
}

/**
 * Conta corrente: dígitos e um dígito verificador depois do hífen.
 *
 * ⚠️ `lazy` deixa o hífen aparecer só quando ele for digitado — conta sem
 * dígito verificador existe, e mostrar "‑" num campo vazio sugere um formato
 * obrigatório que não é.
 */
export const CLASSE_CONTA = {
  mask: '0000000000[-0]',
  lazy: true,
  placeholder: '00000-0',
  className: `num ${CLASSE_CAMPO}`,
  inputMode: 'numeric' as const
}

/** Quantidade inteira (posições a pular, unidades). */
export const CLASSE_INTEIRO = {
  mask: Number,
  scale: 0,
  min: 0,
  max: 999999,
  placeholder: '0',
  className: `num ${CLASSE_CAMPO}`,
  inputMode: 'numeric' as const
}

/**
 * Texto mascarado em reais → número.
 *
 * ⚠️ A ordem importa: tira o ponto do milhar ANTES de trocar a vírgula por
 * ponto. Invertido, "1.234,56" viraria 1.234 — mil vezes menos, e o erro passa
 * despercebido porque o número continua parecendo válido.
 */
export function paraNumero(texto: string | null | undefined): number {
  if (texto == null) return 0
  const limpo = String(texto).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = parseFloat(limpo)
  return Number.isFinite(n) ? n : 0
}

/** Número → texto no formato que a máscara entende (sem "R$"). */
export function paraMascara(valor: number | null | undefined): string {
  if (valor == null) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

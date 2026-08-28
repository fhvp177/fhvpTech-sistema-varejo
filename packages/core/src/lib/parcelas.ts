/**
 * A divisão de um total em parcelas mensais.
 *
 * ── Por que isto mora no core, e não junto do banco ─────────────────────────
 * Duas pessoas precisam desta conta ao mesmo tempo, dos dois lados da ponte:
 *
 *   • a TELA, para mostrar a prévia do carnê antes de o gerente confirmar;
 *   • o BANCO, para gravar as parcelas que serão cobradas.
 *
 * Se cada lado tivesse a sua cópia, bastaria um ajuste num deles para o papel
 * que o cliente leva pra casa deixar de bater com o saldo do sistema — e a
 * divergência só apareceria meses depois, na hora de quitar, sem ninguém saber
 * quem está certo. Com uma função só, prever e gravar são literalmente o mesmo
 * cálculo.
 *
 * (É a mesma lição que o `calcularAcordo` já tinha ensinado: o número que a
 * pessoa vê tem que ser o número que fica.)
 */

export type ParcelaCalculada = {
  numero: number
  valor: number
  vencimento: string
}

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/
const centavos = (v: number): number => +v.toFixed(2)

/**
 * Divide `total` em `numParcelas` mensais, a primeira vencendo em
 * `primeiroVencimento` (ISO `YYYY-MM-DD`).
 *
 * ── A sobra dos centavos vai na PRIMEIRA parcela ────────────────────────────
 * R$ 100 em 3 não fecha: 33,33 × 3 = 99,99. Alguém tem que pagar o centavo.
 * Ele vai na primeira (33,34) e não na última, por um motivo prático: o cliente
 * confere o carnê na hora de fechar o acordo, com o vendedor na frente — e ali
 * uma diferença de um centavo se explica em dois segundos. Na última parcela ele
 * a descobriria sozinho, meses depois, na hora de quitar, e a conversa seria bem
 * pior. A soma das parcelas é exatamente o total (há teste).
 *
 * ── Dia 31 em mês de 30 ─────────────────────────────────────────────────────
 * Cai no último dia do mês, nunca vaza para o mês seguinte. Deixar vazar
 * embaralharia a ordem do carnê: a parcela 2 venceria depois da 3.
 */
export function montarParcelas(
  total: number,
  numParcelas: number,
  primeiroVencimento: string
): ParcelaCalculada[] {
  if (!Number.isInteger(numParcelas) || numParcelas < 2) {
    throw new Error('O carnê precisa de pelo menos 2 parcelas.')
  }
  if (!EH_DATA.test(primeiroVencimento)) {
    throw new Error('Data de vencimento da primeira parcela inválida.')
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('O total do carnê deve ser maior que zero.')
  }

  const base = Math.floor((total * 100) / numParcelas) / 100
  const sobra = centavos(total - base * numParcelas)

  const [ano, mes, dia] = primeiroVencimento.split('-').map(Number)
  const parcelas: ParcelaCalculada[] = []
  for (let i = 0; i < numParcelas; i++) {
    const alvo = new Date(ano, mes - 1 + i, 1)
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
    alvo.setDate(Math.min(dia, ultimoDia))
    const iso = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(
      alvo.getDate()
    ).padStart(2, '0')}`
    parcelas.push({ numero: i + 1, valor: i === 0 ? centavos(base + sobra) : base, vencimento: iso })
  }
  return parcelas
}

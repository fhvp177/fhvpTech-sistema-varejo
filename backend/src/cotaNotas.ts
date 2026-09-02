/**
 * Cota mensal de notas fiscais por loja.
 *
 * ── O que este módulo decide, e o que ele NÃO decide ─────────────────────────
 * Ele responde três coisas sobre uma loja num mês: quantas notas ela emitiu,
 * quantas passaram do combinado, e se a próxima pode sair. Não decide preço, não
 * cobra e não sabe o que é revendedor.
 *
 * ── Por que o teto NÃO bloqueia por padrão ───────────────────────────────────
 * A tentação é fazer "estourou, parou". Seria errado aqui, e o motivo é
 * comercial, não técnico: o preço da mensalidade é NEGOCIADO caso a caso — há
 * loja em R$90, outra em R$100, outra em R$150. Nesse mundo, 100 notas não é uma
 * trava, é o ponto onde a conversa sobre reajuste começa. Uma loja que cresceu e
 * passou a emitir 130 notas é um cliente BOM; travar a emissão dela numa
 * terça-feira à tarde, sem aviso, transforma boa notícia em suporte de urgência
 * — e o dono da loja não tem como saber que existia um limite.
 *
 * Então o padrão é MEDIR: a cota conta, marca o excedente e aparece no painel da
 * FHVP. Quem decide o que fazer com o número é gente.
 *
 * O bloqueio existe (`bloquearAcimaDoTeto`), desligado, para o caso em que a
 * conversa já aconteceu e não resolveu — ou para abuso. É a diferença entre uma
 * régua e uma cancela: a régua serve todo dia, a cancela serve uma vez.
 *
 * ── No atacado o excedente é dinheiro ────────────────────────────────────────
 * Cliente de revendedor no plano Pro vem com 50 notas no preço de atacado e
 * R$0,50 por nota acima. `excedentes` é justamente a base dessa conta — por isso
 * ele é calculado mesmo quando não há bloqueio nenhum.
 */

/** Cota incluída no plano, por padrão, quando a loja não tem teto próprio. */
export const COTA_PADRAO_VAREJO = 100

/** Cota incluída no preço de atacado do plano Pro (decidido 2026-09-01). */
export const COTA_PADRAO_ATACADO_PRO = 50

/** Preço por nota acima da cota, em centavos. */
export const PRECO_CENTAVOS_NOTA_EXCEDENTE = 50

export type SituacaoCota = {
  /** Notas transmitidas no mês. */
  emitidas: number
  /** Cota combinada. `null` = loja sem cota definida — conta, não compara. */
  teto: number | null
  /** Quanto ainda cabe na cota. `null` quando não há cota. Nunca negativo. */
  restantes: number | null
  /** Quantas passaram da cota. Zero quando não há cota ou não estourou. */
  excedentes: number
  /** A próxima nota pode ser emitida? */
  podeEmitir: boolean
  /** Preenchido só quando `podeEmitir` é falso — texto para quem chamou. */
  motivo?: string
}

/**
 * Avalia a cota de uma loja num mês.
 *
 * `teto` ausente/nulo significa "esta loja não tem cota combinada" — que é
 * diferente de zero ("esta loja não pode emitir nada"). Os dois estados existem
 * de propósito: colapsá-los faria toda loja sem cota cadastrada parar de emitir
 * no dia em que o campo fosse criado.
 */
export function avaliarCota(
  emitidas: number,
  teto?: number | null,
  bloquearAcimaDoTeto = false
): SituacaoCota {
  const seguras = Number.isFinite(emitidas) && emitidas > 0 ? Math.floor(emitidas) : 0

  if (teto === null || teto === undefined) {
    return { emitidas: seguras, teto: null, restantes: null, excedentes: 0, podeEmitir: true }
  }

  const cota = Math.max(0, Math.floor(teto))
  const excedentes = Math.max(0, seguras - cota)
  const restantes = Math.max(0, cota - seguras)

  if (bloquearAcimaDoTeto && seguras >= cota) {
    return {
      emitidas: seguras,
      teto: cota,
      restantes,
      excedentes,
      podeEmitir: false,
      motivo:
        `Esta loja já emitiu ${seguras} de ${cota} notas combinadas para o mês. ` +
        'Fale com o suporte para liberar o restante.'
    }
  }

  return { emitidas: seguras, teto: cota, restantes, excedentes, podeEmitir: true }
}

/**
 * Quanto cobrar pelas notas que passaram da cota, em centavos.
 *
 * Fica aqui, e não na rota de cobrança, porque é a mesma regra nos dois lados:
 * o excedente do lojista direto e o do cliente de revendedor usam o mesmo preço
 * por nota. Se um dia divergirem, o parâmetro já existe.
 */
export function valorExcedenteCentavos(
  excedentes: number,
  precoCentavosPorNota = PRECO_CENTAVOS_NOTA_EXCEDENTE
): number {
  if (!Number.isFinite(excedentes) || excedentes <= 0) return 0
  return Math.floor(excedentes) * Math.max(0, Math.floor(precoCentavosPorNota))
}

/**
 * A cota que vale para uma loja, quando ela não tem teto próprio gravado.
 *
 * Cliente de revendedor no Pro herda a cota de atacado (50); todo o resto herda
 * a de varejo (100). Loja no Básico não emite nota — o plano não tem o módulo —,
 * então não recebe cota nenhuma e a contagem dela fica só como registro.
 */
export function cotaPadrao(opcoes: {
  plano?: 'basico' | 'pro'
  ehDeRevendedor: boolean
}): number | null {
  if (opcoes.plano === 'basico') return null
  if (opcoes.ehDeRevendedor) return COTA_PADRAO_ATACADO_PRO
  return COTA_PADRAO_VAREJO
}

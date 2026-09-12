/**
 * A aritmética do calendário do seletor de data.
 *
 * ── Por que existe, em vez de usar o campo de data do navegador ─────────────
 * O `<input type="date">` desenha o calendário no idioma do NAVEGADOR, não no
 * da página. Num Chrome em inglês, a loja inteira em português abre um
 * calendário com "September", "Su Mo Tu We" e a data escrita como mm/dd/aaaa.
 * O `lang` da página não muda isso, e não existe atributo que mude.
 *
 * Foi visto em 11/09/2026, na loja aberta no navegador, e nas palavras do dono:
 * "dependendo do usuário, isso é um impeditivo muito grande". É a mesma família
 * de decisão do `<select>` nativo, que a casa já proibiu pelo mesmo motivo:
 * componente que o navegador desenha sai fora do idioma e fora do visual.
 *
 * ── Por que a conta fica AQUI, longe do React ───────────────────────────────
 * Calendário é o tipo de coisa que erra em fevereiro, na virada do ano e no
 * horário de verão, e nenhum desses casos aparece clicando na tela em setembro.
 * Separada, a conta é testada nos três.
 *
 * ── ⚠️ Tudo ancorado em UTC, e o motivo é estreito ──────────────────────────
 * Aqui só interessa o DIA do calendário, nunca a hora. A armadilha desta casa
 * (já vista no cupom e na garantia) é ler a data SEM fuso e somar
 * milissegundos: `Date.parse('2026-09-11')` seguido de `+ n * 86400000` mistura
 * meia-noite UTC com meia-noite local e devolve o dia errado por algumas horas
 * de diferença.
 *
 * Por isso a leitura carimba o `Z` e a volta passa por `toISOString`: a conta
 * inteira acontece num fuso só, e não há onde o deslocamento entrar.
 *
 * ⚠️ E o que NÃO é o problema, para ninguém "consertar" o que está certo:
 * `new Date(ano, mes, dia + n)` é seguro, porque o construtor normaliza por
 * campos de calendário, não somando tempo. Horário de verão não quebra aquela
 * forma. A escolha aqui é por uma conta só, sem dois jeitos convivendo.
 */

export const MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

/** Cabeçalho da grade. Começa no domingo, como o calendário de parede daqui. */
export const DIAS_DA_SEMANA_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Nome de cada dia, para quem navega por leitor de tela. */
export const DIAS_DA_SEMANA_LONGOS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'
]

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function ehDataIso(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && DIA_ISO.test(valor)
}

const emDias = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86400000

const paraIso = (dias: number): string =>
  new Date(dias * 86400000).toISOString().slice(0, 10)

/** Quantos dias tem o mês. Fevereiro e bissexto inclusos. */
export function diasDoMes(ano: number, mes: number): number {
  // Dia 0 do mês SEGUINTE é o último dia deste.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Hoje, como 'YYYY-MM-DD', no calendário de quem está olhando a tela. */
export function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** '2026-09-11' vira '11/09/2026'. Devolve o que entrou se não for data. */
export function formatarDataBR(iso: string | null | undefined): string {
  if (!ehDataIso(iso)) return iso ?? ''
  const [a, m, d] = (iso as string).split('-')
  return `${d}/${m}/${a}`
}

export type CelulaCalendario = {
  /** 'YYYY-MM-DD'. */
  iso: string
  dia: number
  /** False nos dias que vieram do mês vizinho para completar a grade. */
  doMes: boolean
}

/**
 * As 42 casas da grade de um mês: seis semanas de domingo a sábado.
 *
 * ⚠️ São sempre 42, mesmo quando o mês cabe em cinco semanas. Grade que muda de
 * altura faz a caixa inteira pular ao trocar de mês, e o botão que a pessoa ia
 * clicar sai de baixo do dedo.
 *
 * As casas do começo e do fim vêm dos meses vizinhos, marcadas com
 * `doMes: false`. Deixá-las em branco economizaria código e tiraria informação:
 * quem procura "a última segunda de agosto" olhando setembro ia ver um buraco.
 */
export function gradeDoMes(ano: number, mes: number): CelulaCalendario[] {
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`
  const prefixoDoMes = primeiro.slice(0, 7)
  // 0 = domingo, que é onde a grade começa.
  const diaDaSemanaDoPrimeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay()
  const inicioDaGrade = emDias(primeiro) - diaDaSemanaDoPrimeiro

  return Array.from({ length: 42 }, (_, i) => {
    const iso = paraIso(inicioDaGrade + i)
    return {
      iso,
      dia: Number(iso.slice(8, 10)),
      doMes: iso.slice(0, 7) === prefixoDoMes
    }
  })
}

/** Mês anterior e seguinte de 'YYYY-MM', sem estourar dezembro nem janeiro. */
export function mesVizinho(ano: number, mes: number, passo: 1 | -1): { ano: number; mes: number } {
  const bruto = mes + passo
  if (bruto < 1) return { ano: ano - 1, mes: 12 }
  if (bruto > 12) return { ano: ano + 1, mes: 1 }
  return { ano, mes: bruto }
}

/**
 * O dia pode ser escolhido?
 *
 * ⚠️ Compara TEXTO, não data. 'YYYY-MM-DD' ordena igual ao calendário quando
 * comparado como texto, e assim não entra objeto `Date` nenhum na conta — que é
 * onde o fuso costuma entrar sem ser convidado.
 */
export function dentroDoIntervalo(
  iso: string,
  min?: string | null,
  max?: string | null
): boolean {
  if (ehDataIso(min) && iso < (min as string)) return false
  if (ehDataIso(max) && iso > (max as string)) return false
  return true
}

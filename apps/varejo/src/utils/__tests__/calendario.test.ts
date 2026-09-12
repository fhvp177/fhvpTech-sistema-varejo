/**
 * A aritmética do calendário em português.
 *
 * ── Por que testar isto, e não só clicar na tela ────────────────────────────
 * Calendário erra em lugares que não aparecem clicando num mês qualquer:
 * fevereiro, o bissexto, a virada do ano, e o mês que começa no domingo.
 *
 * ⚠️ O teste da grade CONTÍNUA (sem pular nem repetir dia) é o que prende a
 * família inteira de erro de data: qualquer conta que embarale fuso, mês ou
 * bissexto aparece como um buraco ou uma repetição na sequência de 42 dias.
 * Ele não depende do fuso da máquina que roda o teste, e é por isso que vale.
 */
import { describe, it, expect } from 'vitest'
import {
  DIAS_DA_SEMANA_CURTOS,
  dentroDoIntervalo,
  diasDoMes,
  ehDataIso,
  formatarDataBR,
  gradeDoMes,
  mesVizinho
} from '../calendario'

describe('diasDoMes', () => {
  it('acerta os meses de 30, 31 e fevereiro', () => {
    expect(diasDoMes(2026, 1)).toBe(31)
    expect(diasDoMes(2026, 4)).toBe(30)
    expect(diasDoMes(2026, 12)).toBe(31)
  })

  it('acerta fevereiro comum e bissexto', () => {
    expect(diasDoMes(2026, 2)).toBe(28)
    expect(diasDoMes(2024, 2)).toBe(29)
    // 2100 não é bissexto (divisível por 100 e não por 400).
    expect(diasDoMes(2100, 2)).toBe(28)
    expect(diasDoMes(2000, 2)).toBe(29)
  })
})

describe('gradeDoMes', () => {
  it('★ tem sempre 42 casas, mesmo quando o mês cabe em cinco semanas', () => {
    /*
     * Grade que muda de altura faz a caixa pular ao trocar de mês, e o botão
     * que a pessoa ia clicar sai de baixo do dedo.
     */
    for (const [ano, mes] of [[2026, 2], [2026, 9], [2024, 2], [2026, 8]]) {
      expect(gradeDoMes(ano, mes), `${ano}-${mes}`).toHaveLength(42)
    }
  })

  it('começa no domingo da semana do dia 1', () => {
    // 01/09/2026 é uma terça-feira: a grade abre com domingo 30/08.
    const g = gradeDoMes(2026, 9)
    expect(g[0].iso).toBe('2026-08-30')
    expect(g[0].doMes).toBe(false)
    expect(g[2].iso).toBe('2026-09-01')
    expect(g[2].doMes).toBe(true)
  })

  it('o mês que começa no domingo não ganha semana vazia na frente', () => {
    // 01/02/2026 é domingo.
    const g = gradeDoMes(2026, 2)
    expect(g[0].iso).toBe('2026-02-01')
    expect(g[0].doMes).toBe(true)
  })

  it('marca como fora do mês os dias que vieram dos vizinhos', () => {
    const g = gradeDoMes(2026, 9)
    const doMes = g.filter((c) => c.doMes)
    expect(doMes).toHaveLength(30)
    expect(doMes[0].iso).toBe('2026-09-01')
    expect(doMes[29].iso).toBe('2026-09-30')
  })

  it('★ a grade é contínua, sem pular nem repetir dia', () => {
    /*
     * O teste mais valioso do arquivo. Data errada quase nunca aparece como
     * erro: aparece como um dia repetido ou faltando no meio da grade, e daí
     * pra frente todas as colunas saem trocadas. Aqui isso vira asserção.
     */
    for (const [ano, mes] of [[2026, 1], [2026, 2], [2026, 10], [2026, 11], [2024, 2]]) {
      const g = gradeDoMes(ano, mes)
      const unicos = new Set(g.map((c) => c.iso))
      expect(unicos.size, `${ano}-${mes} repetiu dia`).toBe(42)
      for (let i = 1; i < g.length; i++) {
        const anterior = Date.parse(`${g[i - 1].iso}T00:00:00Z`)
        const atual = Date.parse(`${g[i].iso}T00:00:00Z`)
        expect(atual - anterior, `${ano}-${mes} pulou entre ${g[i - 1].iso} e ${g[i].iso}`).toBe(
          86400000
        )
      }
    }
  })

  it('atravessa a virada do ano', () => {
    const dez = gradeDoMes(2026, 12)
    expect(dez.some((c) => c.iso.startsWith('2027-01'))).toBe(true)
    const jan = gradeDoMes(2027, 1)
    expect(jan.some((c) => c.iso.startsWith('2026-12'))).toBe(true)
  })

  it('cada linha da grade tem sete dias, começando no domingo', () => {
    const g = gradeDoMes(2026, 9)
    expect(DIAS_DA_SEMANA_CURTOS).toHaveLength(7)
    for (let linha = 0; linha < 6; linha++) {
      const primeiroDaLinha = g[linha * 7]
      expect(new Date(`${primeiroDaLinha.iso}T00:00:00Z`).getUTCDay()).toBe(0)
    }
  })
})

describe('mesVizinho', () => {
  it('anda um mês para os dois lados', () => {
    expect(mesVizinho(2026, 5, 1)).toEqual({ ano: 2026, mes: 6 })
    expect(mesVizinho(2026, 5, -1)).toEqual({ ano: 2026, mes: 4 })
  })

  it('vira o ano em dezembro e em janeiro', () => {
    expect(mesVizinho(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 })
    expect(mesVizinho(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 })
  })
})

describe('formatarDataBR', () => {
  it('escreve dia/mês/ano, que é como se lê aqui', () => {
    // O campo do navegador em inglês escreve 09/11/2026 para esta mesma data.
    expect(formatarDataBR('2026-09-11')).toBe('11/09/2026')
  })

  it('não inventa nada com entrada vazia ou estranha', () => {
    expect(formatarDataBR('')).toBe('')
    expect(formatarDataBR(null)).toBe('')
    expect(formatarDataBR('ontem')).toBe('ontem')
  })
})

describe('dentroDoIntervalo', () => {
  it('respeita o mínimo e o máximo, incluindo as pontas', () => {
    expect(dentroDoIntervalo('2026-09-11', '2026-09-01', '2026-09-30')).toBe(true)
    expect(dentroDoIntervalo('2026-09-01', '2026-09-01', '2026-09-30')).toBe(true)
    expect(dentroDoIntervalo('2026-09-30', '2026-09-01', '2026-09-30')).toBe(true)
    expect(dentroDoIntervalo('2026-08-31', '2026-09-01', null)).toBe(false)
    expect(dentroDoIntervalo('2026-10-01', null, '2026-09-30')).toBe(false)
  })

  it('sem limite, tudo passa', () => {
    expect(dentroDoIntervalo('1999-01-01')).toBe(true)
    expect(dentroDoIntervalo('2099-01-01', '', '')).toBe(true)
  })

  it('★ compara texto, e o texto ordena igual ao calendário', () => {
    // Com objeto Date na conta, o fuso entra sem ser convidado. Aqui não entra.
    expect(dentroDoIntervalo('2026-01-02', '2026-01-10', null)).toBe(false)
    expect(dentroDoIntervalo('2026-10-02', '2026-02-10', null)).toBe(true)
  })
})

describe('ehDataIso', () => {
  it('aceita só o formato do sistema', () => {
    expect(ehDataIso('2026-09-11')).toBe(true)
    expect(ehDataIso('11/09/2026')).toBe(false)
    expect(ehDataIso('')).toBe(false)
    expect(ehDataIso(null)).toBe(false)
    expect(ehDataIso(undefined)).toBe(false)
  })
})

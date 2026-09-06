import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lancarMovimento } from './financeiro'

/**
 * Turno de caixa e o fechamento às cegas.
 *
 * ── ⚠️ O que faz o fechamento ser ÀS CEGAS de verdade ───────────────────────
 * Não existe, em lugar nenhum deste arquivo, uma função que devolva o valor
 * esperado de um turno ABERTO. O esperado só é calculado dentro de `fechar`,
 * depois de a contagem já ter chegado, e é gravado junto com ela.
 *
 * Isso é de propósito e é a diferença entre um controle e um teatro. Se a tela
 * pudesse perguntar "quanto deveria ter na gaveta?", bastaria alguém chamar
 * essa consulta antes de digitar — e aí não se conta, se confere: o número bate
 * sempre e a quebra nunca aparece. Às cegas não é promessa da interface, é o
 * backend não ter como responder cedo demais.
 *
 * ── O que fica congelado ────────────────────────────────────────────────────
 * `valor_esperado` é gravado no fechamento e nunca recalculado. Um estorno
 * lançado semanas depois mudaria a conta e faria um turno já conferido
 * "descobrir" uma diferença que ninguém viu na época. O relatório de ontem tem
 * que continuar dizendo o que dizia ontem.
 *
 * ── Imutabilidade ───────────────────────────────────────────────────────────
 * Turno confirmado não se edita nem se reabre. Correção é lançamento novo.
 */

export type Turno = {
  id: number
  conta_id: number
  conta_nome: string
  aberto_por: number
  aberto_por_nome: string | null
  aberto_em: string
  fundo_troco: number
  fechado_por: number | null
  fechado_por_nome: string | null
  fechado_em: string | null
  confirmado_por: number | null
  confirmado_por_nome: string | null
  confirmado_em: string | null
  justificativa: string | null
  fora_de_hora: number
}

export type Contagem = {
  forma: string
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

export type TurnoFechado = {
  turno: Turno
  contagens: Contagem[]
  diferenca_dinheiro: number
}

const arred = (v: number): number => +v.toFixed(2)

const SELECT_TURNO = `
  SELECT t.*, c.nome AS conta_nome,
         va.nome AS aberto_por_nome,
         vf.nome AS fechado_por_nome,
         vc.nome AS confirmado_por_nome
    FROM turnos_caixa t
    JOIN contas_financeiras c ON c.id = t.conta_id
    LEFT JOIN vendedores va ON va.id = t.aberto_por
    LEFT JOIN vendedores vf ON vf.id = t.fechado_por
    LEFT JOIN vendedores vc ON vc.id = t.confirmado_por`

/** O turno aberto agora, se houver. Um por vez em toda a loja. */
export function turnoAberto(): Turno | null {
  const db = obterBancoDeDados()
  return (db.prepare(`${SELECT_TURNO} WHERE t.fechado_em IS NULL LIMIT 1`).get() as Turno) ?? null
}

export function abrirTurno(contaId: number, vendedorId: number, fundoTroco: number): { id: number } {
  const db = obterBancoDeDados()
  return db.transaction(() => {
    /*
     * ⚠️ Um turno por vez. Com dois abertos, `lancarMovimento` escolheria um
     * pela ordem da consulta e metade das vendas cairia no turno errado — e o
     * erro só apareceria no fechamento, sem pista de onde veio.
     */
    const jaAberto = db
      .prepare('SELECT id FROM turnos_caixa WHERE fechado_em IS NULL LIMIT 1')
      .get() as { id: number } | undefined
    if (jaAberto) {
      throw new Error('Já existe um caixa aberto. Feche o turno atual antes de abrir outro.')
    }

    const r = db
      .prepare(
        `INSERT INTO turnos_caixa (conta_id, aberto_por, aberto_em, fundo_troco)
         VALUES (?, ?, datetime('now','localtime'), ?)`
      )
      .run(contaId, vendedorId, arred(fundoTroco))
    return { id: Number(r.lastInsertRowid) }
  })()
}

/**
 * Fecha o turno com a contagem que veio da gaveta.
 *
 * O esperado é calculado AQUI, depois de a contagem chegar. Ver o cabeçalho.
 *
 * `fundo_troco` entra no esperado do dinheiro porque ele está fisicamente na
 * gaveta e vai ser contado junto — não somá-lo faria toda abertura de caixa
 * parecer uma sobra do tamanho do troco.
 */
export function fecharTurno(
  turnoId: number,
  vendedorId: number,
  contagens: Array<{ forma: string; valor_contado: number }>,
  foraDeHora = false
): TurnoFechado {
  const db = obterBancoDeDados()
  return db.transaction(() => {
    const t = db.prepare('SELECT * FROM turnos_caixa WHERE id = ?').get(turnoId) as
      | { id: number; fechado_em: string | null; fundo_troco: number }
      | undefined
    if (!t) throw new Error('Turno não encontrado.')
    if (t.fechado_em) throw new Error('Este turno já foi fechado.')

    const porForma = db
      .prepare(
        `SELECT COALESCE(forma_pagamento, 'dinheiro') AS forma, SUM(valor) AS total
           FROM movimentos_financeiros
          WHERE turno_id = ?
          GROUP BY COALESCE(forma_pagamento, 'dinheiro')`
      )
      .all(turnoId) as Array<{ forma: string; total: number }>

    const esperados = new Map<string, number>()
    for (const l of porForma) esperados.set(l.forma, arred(l.total))
    esperados.set('dinheiro', arred((esperados.get('dinheiro') ?? 0) + t.fundo_troco))

    /*
     * Toda forma que teve movimento entra na conferência, mesmo que o operador
     * não a tenha contado: forma esquecida sairia da lista e a diferença dela
     * desapareceria sem ninguém ver. Não contada vale zero, e a diferença
     * aparece inteira.
     */
    const formas = new Set<string>([...esperados.keys(), ...contagens.map((c) => c.forma)])
    const contadas = new Map(contagens.map((c) => [c.forma, arred(c.valor_contado)]))

    const inserir = db.prepare(
      `INSERT INTO contagens_turno (turno_id, forma, valor_contado, valor_esperado)
       VALUES (?, ?, ?, ?)`
    )
    const resultado: Contagem[] = []
    for (const forma of formas) {
      const esperado = esperados.get(forma) ?? 0
      const contado = contadas.get(forma) ?? 0
      inserir.run(turnoId, forma, contado, esperado)
      resultado.push({
        forma,
        valor_contado: contado,
        valor_esperado: esperado,
        diferenca: arred(contado - esperado)
      })
    }

    db.prepare(
      `UPDATE turnos_caixa
          SET fechado_por = ?, fechado_em = datetime('now','localtime'), fora_de_hora = ?
        WHERE id = ?`
    ).run(vendedorId, foraDeHora ? 1 : 0, turnoId)

    const dinheiro = resultado.find((c) => c.forma === 'dinheiro')
    return {
      turno: db.prepare(`${SELECT_TURNO} WHERE t.id = ?`).get(turnoId) as Turno,
      contagens: resultado.sort((a, b) => (a.forma === 'dinheiro' ? -1 : a.forma.localeCompare(b.forma))),
      diferenca_dinheiro: dinheiro?.diferenca ?? 0
    }
  })()
}

/**
 * O gerente aceita a diferença, e o turno vira pedra.
 *
 * ⚠️ Confirmar significa ACEITAR, não "eu vi". Se faltaram R$ 50, alguém
 * assumiu esses R$ 50 — é isso que o PIN registra.
 */
export function confirmarTurno(turnoId: number, gerenteId: number, justificativa: string | null): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const t = db.prepare('SELECT fechado_em, confirmado_em FROM turnos_caixa WHERE id = ?').get(turnoId) as
      | { fechado_em: string | null; confirmado_em: string | null }
      | undefined
    if (!t) throw new Error('Turno não encontrado.')
    if (!t.fechado_em) throw new Error('Este turno ainda não foi fechado.')
    if (t.confirmado_em) throw new Error('Este turno já foi confirmado e não pode ser alterado.')

    db.prepare(
      `UPDATE turnos_caixa
          SET confirmado_por = ?, confirmado_em = datetime('now','localtime'), justificativa = ?
        WHERE id = ?`
    ).run(gerenteId, justificativa, turnoId)
  })()
}

export function listarTurnos(limite = 60): Turno[] {
  return obterBancoDeDados()
    .prepare(`${SELECT_TURNO} ORDER BY t.id DESC LIMIT ?`)
    .all(limite) as Turno[]
}

export function contagensDoTurno(turnoId: number): Contagem[] {
  const linhas = obterBancoDeDados()
    .prepare('SELECT forma, valor_contado, valor_esperado FROM contagens_turno WHERE turno_id = ?')
    .all(turnoId) as Array<{ forma: string; valor_contado: number; valor_esperado: number }>
  return linhas.map((l) => ({ ...l, diferenca: arred(l.valor_contado - l.valor_esperado) }))
}

/**
 * Sangria (dinheiro sai da gaveta) e suprimento (dinheiro entra).
 *
 * Levam `forma_pagamento: 'dinheiro'` porque é disso que se trata — sem isso
 * cairiam no balde do "sem forma" e a conferência da gaveta ficaria errada
 * exatamente pelo valor da sangria.
 */
export function sangria(contaId: number, vendedorId: number, valor: number, descricao: string): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    lancarMovimento(db, {
      conta_id: contaId,
      valor: -Math.abs(arred(valor)),
      tipo: 'sangria',
      descricao,
      forma_pagamento: 'dinheiro',
      vendedor_id: vendedorId
    })
  })()
}

export function suprimento(contaId: number, vendedorId: number, valor: number, descricao: string): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    lancarMovimento(db, {
      conta_id: contaId,
      valor: Math.abs(arred(valor)),
      tipo: 'suprimento',
      descricao,
      forma_pagamento: 'dinheiro',
      vendedor_id: vendedorId
    })
  })()
}

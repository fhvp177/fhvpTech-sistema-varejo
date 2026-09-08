import type Database from 'better-sqlite3'

/**
 * Turno de caixa, com fechamento às cegas.
 *
 * ── O que é fechar às cegas ─────────────────────────────────────────────────
 * Quem operou conta o dinheiro e digita quanto contou SEM VER quanto o sistema
 * esperava. Só depois de enviar é que a diferença aparece.
 *
 * Se a pessoa vê o esperado antes, ela não conta: ela confere. E quando falta,
 * a tentação de "achar" a nota que falta é enorme — o número bate sempre e o
 * controle nunca acusa nada. Às cegas, a quebra aparece.
 *
 * ⚠️ Por isso o esperado é calculado no FECHAMENTO, aqui no banco, e não numa
 * consulta que a tela poderia chamar antes. Fechar às cegas não é promessa da
 * interface: é o backend não ter como responder essa pergunta cedo demais.
 *
 * ── O que fica congelado ────────────────────────────────────────────────────
 * `valor_esperado` é gravado em `contagens_turno` no momento do fechamento. Não
 * é recalculado depois. Um estorno lançado semanas mais tarde mudaria a conta e
 * faria um turno já conferido "descobrir" uma diferença que ninguém viu na
 * época — o relatório de ontem tem que continuar dizendo o que dizia ontem.
 *
 * ── Imutabilidade ───────────────────────────────────────────────────────────
 * Turno com `confirmado_em` preenchido não se edita nem se reabre. Correção é
 * lançamento novo, num turno novo, com a origem apontando para o antigo. É o
 * mesmo princípio de um livro contábil: não se apaga linha, escreve-se outra.
 *
 * ── Quem faz o quê (decidido com o dono em 2026-09-06) ──────────────────────
 * Conta quem operou; um GERENTE confirma com o PIN. E o PIN significa "aceito
 * esta diferença", não "eu vi" — se faltaram R$ 50, alguém assumiu.
 *
 * ⚠️ Honestidade sobre o alcance: numa loja onde o dono é o próprio operador,
 * isto é disciplina, não auditoria — ele confere o próprio caixa. O controle de
 * verdade só aparece quando existe vendedor. Vale para os dois casos, e não
 * adianta fingir que o primeiro é fiscalização.
 */
export function aplicar040TurnosCaixa(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS turnos_caixa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conta_id INTEGER NOT NULL REFERENCES contas_financeiras(id),
        aberto_por INTEGER NOT NULL,
        aberto_em TEXT NOT NULL,
        fundo_troco REAL NOT NULL DEFAULT 0,
        fechado_por INTEGER,
        fechado_em TEXT,
        confirmado_por INTEGER,
        confirmado_em TEXT,
        justificativa TEXT,
        fora_de_hora INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS contagens_turno (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER NOT NULL REFERENCES turnos_caixa(id),
        forma TEXT NOT NULL,
        valor_contado REAL NOT NULL,
        valor_esperado REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_turno_aberto
        ON turnos_caixa(conta_id, fechado_em);
      CREATE INDEX IF NOT EXISTS idx_contagem_turno
        ON contagens_turno(turno_id);
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('040_turnos_caixa')
  })()
}

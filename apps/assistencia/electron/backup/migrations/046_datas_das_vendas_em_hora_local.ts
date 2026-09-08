import type Database from 'better-sqlite3'

/**
 * Converte para hora da loja as datas de venda que foram gravadas em UTC.
 *
 * Portada do varejo com o mesmo nome de propósito: é a mesma correção, na mesma
 * coluna, e um banco que já passou por ela não pode passar de novo (deslocaria
 * tudo outra vez).
 *
 * ── O que está sendo consertado ─────────────────────────────────────────────
 * `vendas.data` usava o default `CURRENT_TIMESTAMP`, que no SQLite é UTC —
 * sempre, em qualquer fuso da máquina. No Brasil isso deixou toda venda três
 * horas adiante do relógio da bancada, e as feitas depois das 21h no dia
 * seguinte.
 *
 * A partir da versão que traz esta migration, `criarVenda` grava a data
 * explicitamente em hora local. Esta migration acerta o que já estava gravado,
 * para que o histórico não fique metade num fuso e metade no outro.
 *
 * ── Por que não dá para deixar como está ────────────────────────────────────
 * Na assistência a mistura aparece dentro de um fluxo só: `ordens_servico`
 * sempre gravou `criada_em` em hora local, e a venda que nasce da entrega da OS
 * ficava três horas adiante dela. A OS aberta e entregue às 22h de um sábado
 * aparecia no sábado na tela de Ordens e no domingo no faturamento.
 *
 * ── ⚠️ O RISCO, e ele é real ────────────────────────────────────────────────
 * Esta migration roda em TODA oficina, inclusive nas que tiveram histórico
 * importado de outro sistema. Se aquelas vendas entraram com a data já em hora
 * local, elas serão deslocadas três horas para trás sem precisar.
 *
 * O estrago aí é pequeno e foi pesado antes de decidir: muda só o horário. A
 * DATA só muda em venda registrada entre meia-noite e 3h, que praticamente não
 * existe numa oficina. Contra isso está um histórico permanentemente
 * inconsistente em todas as lojas — e a escolha foi assumir o deslocamento
 * pequeno no histórico importado.
 *
 * ⚠️ Não há como distinguir uma linha da outra: as duas são só um texto de data
 * na mesma coluna, sem marca de origem. Foi por isso que a decisão precisou ser
 * tomada por quem conhece as lojas, e não deduzida aqui.
 *
 * ── Segurança ───────────────────────────────────────────────────────────────
 * O sistema já grava uma cópia completa do banco antes de aplicar migrations
 * ("cópia guardada: .../pre-update/..."), então há para onde voltar.
 *
 * Roda uma vez só: `_migrations` guarda o nome, e o registro viaja dentro do
 * backup. Restaurar um backup posterior não reaplica; restaurar um anterior
 * reaplica, o que é o certo, porque aquela cópia ainda está em UTC.
 *
 * ⚠️ SÓ `vendas.data`. `data_vencimento` fica fora de propósito: é uma data
 * escolhida por alguém no formulário, não um carimbo do relógio, e não tem hora
 * para converter. `clientes.data_cadastro` e `produtos.data_cadastro` também
 * ficam: alimentam métricas de mês, onde três horas não mudam leitura nenhuma,
 * e mexer neles seria correr o mesmo risco sem o mesmo ganho. E `ordens_servico`
 * não entra porque nunca esteve errada — sempre gravou em hora local.
 */
export function aplicar046DatasDasVendasEmHoraLocal(db: Database.Database): void {
  db.transaction(() => {
    /*
     * `datetime(data,'localtime')` lê o valor como UTC e devolve no fuso do
     * sistema. É a conversão exata que faltou na gravação.
     *
     * Na assistência isso roda sempre no Windows do lojista, onde o fuso vem do
     * sistema e está certo. (No varejo houve o caso da loja hospedada, cujo
     * contêiner subia sem `TZ` e fazia o "local" ser o próprio UTC.)
     */
    const r = db.prepare("UPDATE vendas SET data = datetime(data, 'localtime')").run()

    // Fica registrado quantas linhas se moveram: se alguém precisar entender um
    // relatório antigo depois, o número está aqui e não numa memória de alguém.
    db.prepare(
      `INSERT OR REPLACE INTO config (chave, valor)
       VALUES ('correcao_fuso_vendas', ?)`
    ).run(
      JSON.stringify({
        em: new Date().toISOString(),
        linhas: r.changes
      })
    )

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '046_datas_das_vendas_em_hora_local'
    )
  })()
}

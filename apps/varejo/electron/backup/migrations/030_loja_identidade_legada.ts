import type Database from 'better-sqlite3'

// Identidade da loja no cupom: até aqui, quem não tivesse preenchido "Dados da
// loja" pela tela recebia os dados da PRIMEIRA loja do sistema (GN Modas)
// chumbados no código — solução da época em que ela era a única instalação.
// Com outras lojas entrando, isso vazava a identidade dela pro cupom dos
// outros (e a tela abria pré-preenchida com o endereço dela, convidando o novo
// dono a salvar sem perceber).
//
// O fallback morreu em ipc/loja.ts (agora é neutro: campos em branco até o
// dono preencher, e o checklist de boas-vindas já cobra isso). Pra não mudar o
// cupom de quem LEGITIMAMENTE imprimia esses dados, esta migration grava os
// valores legados na config — mas só em banco que já existia ANTES de a
// identidade virar configurável (2026-06-15). Naquela data havia uma única
// instalação no mundo: a própria GN Modas.
//
// Instalação nova não se qualifica (todas as migrations carimbadas hoje) e
// nasce em branco — inclusive banco importado de outro sistema, que carimba as
// migrations de uma vez só na importação. `cliente_id` entra como segundo
// critério porque é o identificador da licença dela; num banco novo ele nem
// existe ainda neste ponto do boot (o BackupManager semeia depois).
const CORTE_WHITE_LABEL = '2026-06-15'
const CLIENTE_PRIMEIRA_LOJA = 'GNMODAS001'

const IDENTIDADE_LEGADA: Array<[string, string]> = [
  ['loja_nome', 'GN MODAS'],
  ['loja_razao_social', 'Razão Social Ltda. — ME'],
  ['loja_cnpj', '00.000.000/0001-00'],
  ['loja_endereco', 'Praça Claudemiro Lopes Bezerra - Mercado Central'],
  ['loja_cidade', 'Pacoti'],
  ['loja_uf', 'CE'],
  ['loja_cep', '62770-000'],
  ['loja_telefone', ''],
  ['loja_logo', ''],
  ['loja_exibir_logo', '0']
]

export function aplicar030LojaIdentidadeLegada(db: Database.Database): void {
  db.transaction(() => {
    const ler = (chave: string): string =>
      (db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as
        | { valor: string }
        | undefined)?.valor ?? ''

    // Quem já preencheu a própria identidade não é tocado em hipótese alguma.
    if (ler('loja_configurada') !== '1') {
      const primeiraMigration =
        (db.prepare('SELECT MIN(data_aplicacao) AS d FROM _migrations').get() as
          | { d: string | null }
          | undefined)?.d ?? ''
      const bancoAnteriorAoRecurso =
        primeiraMigration !== '' && primeiraMigration < CORTE_WHITE_LABEL

      if (bancoAnteriorAoRecurso || ler('cliente_id') === CLIENTE_PRIMEIRA_LOJA) {
        const gravar = db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)')
        for (const [chave, valor] of IDENTIDADE_LEGADA) gravar.run(chave, valor)
        gravar.run('loja_configurada', '1')
      }
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '030_loja_identidade_legada'
    )
  })()
}

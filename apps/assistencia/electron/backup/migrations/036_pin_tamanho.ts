import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Quantos dígitos tem o PIN de cada pessoa — para a tela de login confirmar
// sozinha, sem exigir Enter, como faz o Windows.
//
// ── Por que precisou de uma coluna ───────────────────────────────────────────
// O PIN aqui tem de 4 a 6 dígitos, escolhidos por quem cadastra (ver
// `electron/auth.ts`). Sem saber o tamanho de UM usuário específico, a tela não
// tem como saber se "1325" é um PIN completo ou o começo de um de 6 dígitos.
// Confirmar no 4º dígito arrancaria uma tentativa errada de quem tem 6 — e,
// com o bloqueio de 5 tentativas, essa pessoa ficaria travada para fora do
// sistema sem entender o motivo.
//
// ── O que exatamente fica gravado, e o que isso custa ────────────────────────
// Só o NÚMERO de dígitos (4, 5 ou 6). Nunca o PIN, nunca parte dele.
//
// Isso reduz o espaço de busca de um atacante OFFLINE — quem tem o arquivo do
// banco passa a saber que precisa tentar só 10 mil combinações em vez de ~1,11
// milhão. A troca foi aceita conscientemente: quem chegou no arquivo do banco
// já tem o hash do PIN e todos os dados da loja, e um PIN numérico de 4 dígitos
// nunca foi a defesa contra esse cenário. O PIN existe contra quem senta no
// balcão — e contra esse a defesa é o bloqueio por tentativas, que não muda.
//
// ── Nasce NULO de propósito ──────────────────────────────────────────────────
// Não dá para deduzir o tamanho de um PIN a partir do hash (é justamente o que
// um hash impede), e chutar deixaria a tela confirmando cedo. Então:
// instalação existente começa sem tamanho e segue pedindo Enter; o valor é
// aprendido no primeiro login bem-sucedido e nas trocas de PIN daí em diante.
export function aplicar036PinTamanho(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendedores', 'pin_tamanho', 'INTEGER')

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('036_pin_tamanho')
  })()
}

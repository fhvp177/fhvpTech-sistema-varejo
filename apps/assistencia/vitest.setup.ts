/**
 * Os segredos de build, para os testes conseguirem importar o módulo de licença.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * `packages/core/src/electron/licenca.ts` lê `__CHAVE_HMAC__`, `__CHAVE_AES__` e
 * `__SALT_AES__` no topo do arquivo. Em produção quem põe esses valores lá é o
 * `define` do electron-vite, no build. Num teste eles não existem, e o arquivo
 * nem chegava a ser IMPORTADO: era por isso que o caminho que decide se a loja
 * abre não tinha teste nenhum do lado do app.
 *
 * ⚠️ Não dá para resolver com `define` no vitest.config.ts: a substituição é
 * textual e acerta também as linhas `declare const __CHAVE_HMAC__: string`,
 * que viram `declare const 'valor': string` e quebram o parser. Como global,
 * a declaração de tipo continua intacta e o valor aparece em tempo de execução.
 *
 * ⚠️ Os valores são de MENTIRA, de propósito. Teste que precisasse do segredo
 * de verdade só rodaria na máquina certa, e este repositório é público. O que
 * se prova nos testes é o COMPORTAMENTO (assina, confere, recusa adulterada),
 * que não depende de qual é o segredo.
 */
const global = globalThis as Record<string, unknown>

global.__CHAVE_HMAC__ = 'hmac-de-teste-nao-e-o-de-producao'
global.__CHAVE_AES__ = 'aes-de-teste-nao-e-o-de-producao'
global.__SALT_AES__ = 'sal-de-teste'

// As flags de edição: nos testes tudo ligado, para o código ser exercitado
// inteiro. Quem prova que o Básico não leva o que não deve é o
// `empacotamento.test.ts`, olhando o build de verdade.
global.__FEAT_MULTICAIXA__ = true
global.__FEAT_PAGAMENTO__ = true

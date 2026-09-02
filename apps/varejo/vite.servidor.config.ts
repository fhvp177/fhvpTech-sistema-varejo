/**
 * Build do SERVIDOR — o mesmo sistema, atendendo pelo navegador.
 *
 * É irmão do bloco `main` do `electron.vite.config.ts`, e pelo mesmo motivo:
 * `@fhvptech/core` é consumido por fonte (`.ts`), então precisa ser embutido —
 * externalizá-lo faria o runtime tentar `require()` num arquivo TypeScript.
 *
 * ── Os segredos NÃO entram no pacote ─────────────────────────────────────────
 * A validação de licença usa três chaves que ficam fora do código-fonte (o
 * repositório é público). O aplicativo instalado precisa carregá-las dentro de
 * si, porque valida a licença na máquina do lojista, sem servidor a quem
 * perguntar.
 *
 * Aqui é o contrário: quem roda o servidor somos nós, e o ambiente é nosso. As
 * constantes são trocadas por LEITURAS de variável de ambiente, resolvidas na
 * hora da execução. O ganho é concreto — a imagem do contêiner deixa de conter
 * segredo, e trocar uma chave passa a ser um comando, não um build novo.
 *
 * O `define` do Vite é substituição de texto: `__CHAVE_HMAC__` vira
 * literalmente `process.env.CHAVE_HMAC` no arquivo gerado. Faltando a variável,
 * o valor é `undefined` e a licença nunca validaria — por isso o servidor
 * confere as três no boot e se recusa a subir sem elas.
 */
import { isAbsolute, resolve } from 'path'
import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import { FEATURES_POR_EDICAO } from './edicoes'

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

const EDICAO = process.env.EDICAO ?? 'pro'
const FEATURES = FEATURES_POR_EDICAO[EDICAO]
if (!FEATURES) {
  throw new Error(
    `[vite.servidor.config] EDICAO desconhecida: "${EDICAO}". ` +
      `Use uma de: ${Object.keys(FEATURES_POR_EDICAO).join(', ')}.`
  )
}

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist-servidor'),
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, 'servidor/index.ts'),
      output: { entryFileNames: 'servidor.mjs', format: 'esm' },
      // Caminho — relativo ou absoluto — é código nosso e entra no pacote.
      // Nome solto é pacote do npm e fica de fora, carregado do node_modules
      // em tempo de execução; o better-sqlite3 depende disso, porque é binário
      // nativo e não há como embuti-lo num arquivo JavaScript.
      //
      // O `isAbsolute` não é detalhe: no Windows o próprio arquivo de entrada
      // chega aqui como `C:\...`, que não começa com barra. Sem ele, o Rollup
      // trata a entrada como externa e recusa o build inteiro.
      external: (id) => {
        if (id.startsWith('@fhvptech/core')) return false
        return !id.startsWith('.') && !isAbsolute(id)
      }
    }
  },
  define: {
    // Leituras de ambiente, não literais — ver o cabeçalho.
    __CHAVE_HMAC__: 'process.env.CHAVE_HMAC',
    __CHAVE_AES__: 'process.env.CHAVE_AES',
    __SALT_AES__: 'process.env.SALT_AES',
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __EDICAO__: JSON.stringify(EDICAO),
    // O servidor não tem segundo caixa nem maquininha: as duas saem do bundle
    // por eliminação de código morto, em vez de ficarem escondidas.
    __FEAT_MULTICAIXA__: JSON.stringify(false),
    __FEAT_PAGAMENTO__: JSON.stringify(false),
    __FEAT_NFE__: JSON.stringify(FEATURES.nfe)
  }
})

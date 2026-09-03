/**
 * Build da interface para o NAVEGADOR.
 *
 * Mesmas telas do app instalado, servidas por um endereço em vez de uma janela.
 * Existe para o lojista que só tem tablet — não há Windows onde instalar.
 *
 * ── Por que é um arquivo separado, e não um modo do outro ────────────────────
 * O `electron.vite.config.ts` produz TRÊS bundles (principal, preload,
 * renderer) e, para montar o principal, exige os segredos de licença do `.env`.
 * O navegador não recebe nenhum dos dois primeiros e não deve nem chegar perto
 * dos segredos — eles são do servidor. Reaproveitar aquele arquivo obrigaria a
 * carregar tudo isso para descartar em seguida.
 *
 * ── O que TEM que ficar igual ao outro ───────────────────────────────────────
 * As constantes de `define`. Elas viram literais no bundle, e o código conta com
 * elas existindo: uma flag ausente não dá erro de compilação, dá `undefined` no
 * meio de um `if` — a funcionalidade some da tela sem nenhum aviso. Há teste
 * garantindo que as duas listas continuem idênticas
 * (`__tests__/definesDoWeb.test.ts`).
 */
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, renameSync } from 'fs'
import { FEATURES_POR_EDICAO } from './edicoes'

/**
 * O arquivo de entrada se chama `index.web.html` (para não disputar com o
 * `index.html` do app instalado), mas o navegador tem que receber `index.html`
 * — é o nome que todo servidor entrega quando alguém pede a raiz.
 */
function renomearParaIndex(saida: string): { name: string; closeBundle(): void } {
  return {
    name: 'fhvp-renomeia-index',
    closeBundle() {
      const de = resolve(saida, 'index.web.html')
      if (existsSync(de)) renameSync(de, resolve(saida, 'index.html'))
    }
  }
}

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

const SAIDA = resolve(__dirname, 'dist-web')

const EDICAO = process.env.EDICAO ?? 'pro'
const FEATURES = FEATURES_POR_EDICAO[EDICAO]
if (!FEATURES) {
  throw new Error(
    `[vite.web.config] EDICAO desconhecida: "${EDICAO}". ` +
      `Use uma de: ${Object.keys(FEATURES_POR_EDICAO).join(', ')}.`
  )
}

export default defineConfig({
  root: resolve(__dirname, '.'),
  /**
   * O que está em `public-web/` é copiado para a raiz do `dist-web` sem passar
   * pelo empacotador — sem hash no nome, sem transformação.
   *
   * ── Por que o nome NÃO pode levar hash ─────────────────────────────────────
   * `favicon.ico` é pedido pelo navegador sozinho, nesse endereço exato, mesmo
   * sem nenhuma tag na página. Um `favicon-a1b2c3.ico`, como o empacotador
   * faria, nunca seria encontrado por esse pedido automático.
   *
   * ── Por que uma pasta própria, e não a `public/` padrão ────────────────────
   * A `public/` padrão fica dentro do `root`, que os DOIS builds compartilham.
   * Usá-la despejaria o favicon também no pacote do aplicativo instalado, onde
   * ele não serve para nada — a janela do Electron tira o ícone do
   * `electron-builder`, por outro caminho.
   *
   * Os arquivos são os MESMOS do ícone do app (`resources/`), copiados de
   * propósito: a aba do navegador e o atalho no Windows mostram a mesma marca.
   */
  publicDir: resolve(__dirname, 'public-web'),
  // Caminhos relativos no HTML gerado: assim o mesmo build serve tanto a raiz
  // de um domínio quanto um subcaminho, sem recompilar.
  base: './',
  build: {
    outDir: SAIDA,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.web.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __ALVO__: JSON.stringify('web'),
    __EDICAO__: JSON.stringify(EDICAO),
    __FEAT_DASHBOARD__: JSON.stringify(FEATURES.dashboard),
    __FEAT_CHATBOT__: JSON.stringify(FEATURES.chatbot),
    __FEAT_ETIQUETAS__: JSON.stringify(FEATURES.etiquetas),
    __FEAT_TEF__: JSON.stringify(FEATURES.tef),
    __FEAT_NFE__: JSON.stringify(FEATURES.nfe),
    __FEAT_PAGAMENTO__: JSON.stringify(FEATURES.pagamento),
    __FEAT_MULTICAIXA__: JSON.stringify(FEATURES.multicaixa)
  },
  plugins: [react(), renomearParaIndex(SAIDA)]
})

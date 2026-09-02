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
import { readFileSync } from 'fs'
import { FEATURES_POR_EDICAO } from './edicoes'

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

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
  // Caminhos relativos no HTML gerado: assim o mesmo build serve tanto a raiz
  // de um domínio quanto um subcaminho, sem recompilar.
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
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
    __EDICAO__: JSON.stringify(EDICAO),
    __FEAT_DASHBOARD__: JSON.stringify(FEATURES.dashboard),
    __FEAT_CHATBOT__: JSON.stringify(FEATURES.chatbot),
    __FEAT_ETIQUETAS__: JSON.stringify(FEATURES.etiquetas),
    __FEAT_TEF__: JSON.stringify(FEATURES.tef),
    __FEAT_NFE__: JSON.stringify(FEATURES.nfe),
    __FEAT_PAGAMENTO__: JSON.stringify(FEATURES.pagamento),
    __FEAT_MULTICAIXA__: JSON.stringify(FEATURES.multicaixa)
  },
  plugins: [react()]
})

import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

// Config enxuta da casca. Ainda SEM os segredos de licença (lerSegredosLicenca):
// a licença entra quando for movida pro core (próximo passo). Aí esta config
// ganha o bloco `define` com as chaves, igual ao varejo.
export default defineConfig({
  main: {
    // @fhvptech/core é consumido por fonte (.ts) — bundlar, não externalizar.
    plugins: [externalizeDepsPlugin({ exclude: ['@fhvptech/core'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '.'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    plugins: [react()]
  }
})

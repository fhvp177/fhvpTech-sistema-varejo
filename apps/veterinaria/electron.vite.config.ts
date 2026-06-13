import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

// Segredos de licença injetados no bundle do main em build-time (via `define`),
// lidos do .env local (não versionado). MESMAS chaves do varejo — é o mesmo
// backend que assina as licenças dos dois nichos. Falha alto se faltar alguma.
function lerSegredosLicenca(): Record<string, string> {
  const doArquivo: Record<string, string> = {}
  const arquivoEnv = resolve(__dirname, '.env')
  if (existsSync(arquivoEnv)) {
    for (const linha of readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) doArquivo[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  const nomes = ['CHAVE_HMAC', 'CHAVE_AES', 'SALT_AES']
  const out: Record<string, string> = {}
  for (const nome of nomes) {
    const valor = process.env[nome] ?? doArquivo[nome]
    if (!valor) {
      throw new Error(
        `[electron.vite.config] Segredo de licenca ausente: ${nome}. ` +
          `Defina em .env (mesmas chaves do varejo) ou como variavel de ambiente.`
      )
    }
    out[nome] = valor
  }
  return out
}

const SEGREDOS = lerSegredosLicenca()

export default defineConfig({
  main: {
    // @fhvptech/core é consumido por fonte (.ts) — bundlar, não externalizar.
    plugins: [externalizeDepsPlugin({ exclude: ['@fhvptech/core'] })],
    define: {
      __CHAVE_HMAC__: JSON.stringify(SEGREDOS.CHAVE_HMAC),
      __CHAVE_AES__: JSON.stringify(SEGREDOS.CHAVE_AES),
      __SALT_AES__: JSON.stringify(SEGREDOS.SALT_AES)
    },
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

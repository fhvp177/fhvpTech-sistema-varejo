import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'

const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

// Segredos de licença injetados no bundle do main em build-time (via `define`),
// lidos do .env local (não versionado) ou de variáveis de ambiente. Ficam FORA
// do código-fonte porque o repo é público. Falha alto se faltar algum — melhor
// quebrar aqui do que gerar um app que valida licença com chave `undefined`.
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
          `Defina em .env (veja .env.example) ou como variavel de ambiente antes de rodar dev/build.`
      )
    }
    out[nome] = valor
  }
  return out
}

const SEGREDOS = lerSegredosLicenca()

// Edição do build — controla quais features entram no bundle. As flags viram
// constantes literais (`define`), então o bundler faz dead-code elimination das
// features desligadas: o código E suas libs exclusivas somem do binário daquela
// edição (não ficam só escondidos). Cada edição é gerada com a env EDICAO.
//
// Planos comerciais (definidos 2026-07-17): 'basico' = tudo que o sistema tem
// hoje; 'pro' = basico + nota fiscal (nfe) + TEF. NF-e e TEF ainda não foram
// construídos — as flags só reservam o lugar, e o Pro nasce idêntico ao Básico.
// Default 'pro' = tudo ligado (dev e build padrão, sem regressão).
type Features = Record<'dashboard' | 'chatbot' | 'etiquetas' | 'tef' | 'nfe', boolean>
const FEATURES_POR_EDICAO: Record<string, Features> = {
  basico: { dashboard: true, chatbot: true, etiquetas: true, tef: false, nfe: false },
  pro: { dashboard: true, chatbot: true, etiquetas: true, tef: true, nfe: true }
}
const EDICAO = process.env.EDICAO ?? 'pro'
const FEATURES = FEATURES_POR_EDICAO[EDICAO]
if (!FEATURES) {
  throw new Error(
    `[electron.vite.config] EDICAO desconhecida: "${EDICAO}". ` +
      `Use uma de: ${Object.keys(FEATURES_POR_EDICAO).join(', ')}.`
  )
}

export default defineConfig({
  main: {
    // @fhvptech/core é consumido por fonte (.ts) — precisa ser bundlado, não
    // externalizado, senão o runtime tentaria require() num .ts. Os demais
    // node_modules seguem externalizados normalmente.
    plugins: [externalizeDepsPlugin({ exclude: ['@fhvptech/core'] })],
    define: {
      __CHAVE_HMAC__: JSON.stringify(SEGREDOS.CHAVE_HMAC),
      __CHAVE_AES__: JSON.stringify(SEGREDOS.CHAVE_AES),
      __SALT_AES__: JSON.stringify(SEGREDOS.SALT_AES)
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '.'),
    build: {
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
      __FEAT_NFE__: JSON.stringify(FEATURES.nfe)
    },
    plugins: [react()]
  }
})

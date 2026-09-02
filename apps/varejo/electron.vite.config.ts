import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { FEATURES_POR_EDICAO } from './edicoes'

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

// A tabela de edições mora em ./edicoes.ts — o build do navegador
// (vite.web.config.ts) consome a MESMA, e duplicá-la faria uma edição nova
// entrar num build e faltar no outro.
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
      __SALT_AES__: JSON.stringify(SEGREDOS.SALT_AES),
      // O multicaixa precisa da flag também no processo principal: é lá que o
      // servidor sobe e que o boot decide se esta máquina é um caixa adicional.
      // Sem isso, o Básico ainda carregaria o mecanismo, só sem a tela.
      __FEAT_MULTICAIXA__: JSON.stringify(FEATURES.multicaixa),
      // Também no principal: com ela desligada, os canais de pagamento nem
      // chegam a ser registrados — não basta esconder o botão, o caminho todo
      // tem que não existir enquanto a obra não acaba.
      __FEAT_PAGAMENTO__: JSON.stringify(FEATURES.pagamento),
      // A edição também no principal, para o atualizador saber sozinho em qual
      // canal ele deve procurar versão nova — ver electron/atualizador.ts.
      __EDICAO__: JSON.stringify(EDICAO)
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
      __ALVO__: JSON.stringify('desktop'),
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
  }
})

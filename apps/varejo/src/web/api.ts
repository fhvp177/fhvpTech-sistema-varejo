/**
 * O `window.api` do navegador.
 *
 * No aplicativo instalado, quem monta esse objeto é o `preload.ts`: 159 métodos
 * escritos um a um, cada um chamando `ipcRenderer.invoke` no canal certo. As
 * telas usam `window.api.produtos.listar()` e não sabem o que existe embaixo.
 *
 * Aqui embaixo passa a existir uma requisição HTTP. **As telas não mudam** —
 * são as mesmas 224 chamadas, no mesmo objeto, com a mesma promessa de volta.
 *
 * ── Por que um Proxy, e não as 159 linhas de novo ────────────────────────────
 * Reescrever o preload aqui daria dois arquivos para manter em sincronia, e o
 * modo de falha seria cruel: método novo funcionando no app instalado e
 * "não é uma função" no tablet — em produção, na mão do lojista.
 *
 * Só que a tradução é uma regra, não uma lista: `api.grupo.metodo(a, b)` vira
 * o canal `grupo:metodo` com argumentos `[a, b]`. Vale para 158 dos 159. Um
 * Proxy aplica a regra a qualquer nome, inclusive aos que ainda não existem, e
 * a exceção que sobra cabe no mapa abaixo.
 *
 * O teste `__tests__/apiWebCobrePreload.test.ts` lê o preload e confere método
 * por método que esta regra reproduz o canal certo — é o que garante que os
 * dois lados não se afastem.
 */

import { IMPRESSAO_NO_NAVEGADOR } from './impressao'

/** Formato de resposta de todo handler, igual ao do app instalado. */
type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

/**
 * Onde o servidor da loja atende. Relativo de propósito: assim a mesma página
 * serve tanto na raiz de um domínio quanto num subcaminho, sem recompilar.
 */
const ENDERECO_RPC = 'rpc'

/**
 * Onde o nome do método NÃO é o nome do canal.
 *
 * Um caso só, e por acaso histórico: o canal nasceu com hífen. Não vale
 * inventar uma regra de conversão para uma ocorrência — o mapa explícito diz a
 * verdade e o teste cobra que ele continue completo.
 */
export const EXCECOES: Record<string, string> = {
  'categorias.definirTamanhos': 'categorias:definir-tamanhos'
}

/**
 * Assinaturas de evento do app instalado (`onX(callback)` devolvendo a função
 * que cancela). Todas as quatro são de mecanismo de desktop:
 *
 * - `atualizacao.onEvento` — instalar versão nova; no navegador basta recarregar
 * - `backup.onNotificacao` / `backup.onCarregando` — backup roda no servidor
 * - `multicaixa.onConexao` — não existe segundo caixa aqui; a web já é vários
 *
 * Ficam como assinatura que nunca dispara: a tela continua podendo se inscrever
 * e cancelar sem saber onde está rodando. Retornar `undefined` no lugar
 * quebraria o `useEffect` que chama a função de cancelamento na saída.
 */
export const EVENTOS_SEM_FONTE = new Set([
  'atualizacao.onEvento',
  'backup.onNotificacao',
  'backup.onCarregando',
  'multicaixa.onConexao'
])

/** `grupo.metodo` → nome do canal. */
export function canalDe(grupo: string, metodo: string): string {
  return EXCECOES[`${grupo}.${metodo}`] ?? `${grupo}:${metodo}`
}

/**
 * Manda a chamada ao servidor e devolve o que o handler devolveu.
 *
 * Segue o mesmo protocolo do segundo caixa (`{ canal, args }` vai,
 * `{ ok, valor }` ou `{ ok, erro }` volta), porque ele já resolve o ponto
 * delicado: um handler tem dois jeitos de falhar, e os dois precisam chegar na
 * tela como chegariam no app instalado. Devolver `{ success: false, error }` é
 * um valor normal e viaja como resultado; lançar exceção volta como `ok:false`
 * e é relançado aqui.
 */
async function chamar(canal: string, args: unknown[]): Promise<unknown> {
  let resposta: Response
  try {
    resposta = await fetch(ENDERECO_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // O cookie de sessão vai junto — é ele que diz qual vendedor está nesta
      // aba. Sem isto, cada chamada chegaria como se fosse de um desconhecido.
      credentials: 'same-origin',
      body: JSON.stringify({ canal, args })
    })
  } catch {
    // Rede caída é o erro mais provável num tablet, e precisa de uma frase que
    // o lojista entenda — não "Failed to fetch".
    throw new Error('Sem conexão com o servidor da loja. Verifique a internet e tente de novo.')
  }

  if (resposta.status === 401) {
    throw new Error('Sua sessão expirou. Entre de novo para continuar.')
  }

  let corpo: { ok?: boolean; valor?: unknown; erro?: string }
  try {
    corpo = await resposta.json()
  } catch {
    throw new Error(`O servidor da loja respondeu de forma inesperada (${resposta.status}).`)
  }

  if (corpo.ok) return corpo.valor
  throw new Error(corpo.erro ?? 'O servidor da loja encontrou um erro ao processar o pedido.')
}

/** Um grupo (`api.produtos`), montado sob demanda. */
function grupoProxy(grupo: string): Record<string, unknown> {
  const cache = new Map<string, unknown>()

  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, prop) {
      if (typeof prop !== 'string') return undefined
      const guardado = cache.get(prop)
      if (guardado) return guardado

      const caminho = `${grupo}.${prop}`
      const fn = EVENTOS_SEM_FONTE.has(caminho)
        ? // Inscrição que nunca dispara — devolve o cancelador mesmo assim.
          () => () => {}
        : // Impressão é do aparelho, não da loja: a impressora está no balcão
          // junto do tablet, e o servidor está em São Paulo. Estes poucos
          // métodos nunca saem daqui — ver web/impressao.ts.
          (grupo === 'impressao' ? IMPRESSAO_NO_NAVEGADOR[prop] : undefined) ??
          ((...args: unknown[]): Promise<RespostaIPC> =>
            chamar(canalDe(grupo, prop), args) as Promise<RespostaIPC>)

      cache.set(prop, fn)
      return fn
    },
    // Sem isto, um `'listar' in api.produtos` diria falso e algum código
    // defensivo poderia concluir que o método não existe.
    has() {
      return true
    }
  })
}

/** O objeto inteiro (`api`), com os grupos montados sob demanda. */
export function criarApiWeb(): Record<string, unknown> {
  const cache = new Map<string, unknown>()

  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, prop) {
      if (typeof prop !== 'string') return undefined
      // React e ferramentas perguntam por estes ao inspecionar objetos; um
      // Proxy que devolve função para tudo faria o valor parecer uma promessa
      // ("thenable") e travaria qualquer `await` que o encostasse.
      if (prop === 'then' || prop === 'toJSON' || prop === '$$typeof') return undefined

      const guardado = cache.get(prop)
      if (guardado) return guardado
      const g = grupoProxy(prop)
      cache.set(prop, g)
      return g
    },
    has() {
      return true
    }
  })
}

/**
 * Instala o `window.api`. Chamado antes de o React montar — a primeira tela já
 * pergunta a licença e a sessão, e um `window.api` ausente naquele instante
 * viraria tela branca sem mensagem.
 */
export function instalarApiWeb(): void {
  ;(window as unknown as { api: unknown }).api = criarApiWeb()
}

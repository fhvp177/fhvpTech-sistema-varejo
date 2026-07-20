// Cliente da ACBr API — o provedor fiscal que emite NFC-e/NF-e/NFS-e por nós.
//
// Vive no backend, nunca no Electron, porque aqui ficam as credenciais da conta
// e (na ACBr) os certificados A1 dos clientes. Mesmo princípio do RESEND_API_KEY.
//
// ── As duas armadilhas que este arquivo existe pra evitar ─────────────────────
//
// 1. O endpoint de token aceita 4 pedidos por HORA. O token, porém, vale 30
//    DIAS — eles esperam ~1 pedido por mês. Quem pede um token por requisição
//    quebra na quinta venda da hora. Guardar em memória também não basta: cada
//    deploy reinicia a máquina do Fly e zera a memória, então uma tarde com
//    cinco deploys deixaria o backend de castigo. Por isso o token mora no
//    SQLite do volume — ver `acbr_token` em db.ts.
//
// 2. O token vem carimbado com a audiência do host que o emitiu. Um token de
//    sandbox usado contra produção devolve 401 "Audience [aud] claim", que não
//    parece problema de ambiente. Por isso o cache é POR AMBIENTE.

import {
  apagarTokenAcbr,
  gravarTokenAcbr,
  obterTokenAcbr,
  registrarTentativaToken
} from './db.ts'

const URL_TOKEN = 'https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token'

// Escopos que a credencial concede. Pedimos todos que temos; a API recorta pelo
// que a credencial realmente permite.
const ESCOPOS = 'empresa nfce nfe conta cep debug'

// Renova com folga em vez de esperar vencer. Se a renovação falhar no dia do
// vencimento, a loja fica sem emitir; com 2 dias de antecedência sobra margem
// pra tentar de novo nas horas seguintes.
const DIAS_RENOVACAO_ANTECIPADA = 2

// A ACBr permite 4/hora. Paramos em 3 pra sempre sobrar uma tentativa de
// emergência caso algo dê muito errado e alguém precise agir na mão.
const MAX_PEDIDOS_TOKEN_HORA = 3

export type CodigoErroAcbr =
  | 'sem_credito' // 402 — acabaram os créditos pré-pagos da conta
  | 'limite' // 429 — excesso de requisições
  | 'validacao' // 400 — payload recusado (dado fiscal errado)
  | 'auth' // 401/403 — credencial inválida ou sem escopo
  | 'nao_encontrado' // 404
  | 'indisponivel' // 5xx, timeout, rede
  | 'config' // erro nosso: env faltando

export class ErroAcbr extends Error {
  constructor(
    readonly codigo: CodigoErroAcbr,
    mensagem: string,
    readonly status?: number,
    readonly detalhe?: unknown,
    // Quando a API diz em quantos segundos podemos tentar de novo (429).
    readonly tentarEmSegundos?: number
  ) {
    super(mensagem)
    this.name = 'ErroAcbr'
  }
}

function config() {
  const clientId = process.env.ACBR_CLIENT_ID
  const clientSecret = process.env.ACBR_CLIENT_SECRET
  // Sem default: apontar pra produção por engano emitiria nota fiscal DE
  // VERDADE e gastaria crédito. Melhor quebrar na largada.
  const base = process.env.ACBR_API_BASE
  if (!clientId || !clientSecret || !base) {
    throw new ErroAcbr(
      'config',
      'Integração fiscal não configurada (ACBR_CLIENT_ID, ACBR_CLIENT_SECRET e ACBR_API_BASE).'
    )
  }
  return { clientId, clientSecret, base: base.replace(/\/+$/, '') }
}

export function ambienteFiscalPadrao(): 'homologacao' | 'producao' {
  // O host decide: sandbox só existe pra homologação.
  return config().base.includes('hom.acbr') ? 'homologacao' : 'producao'
}

function venceEm(expiraEm: string, agora: Date): number {
  return (new Date(expiraEm).getTime() - agora.getTime()) / 86_400_000
}

// Busca token novo no servidor de autenticação. Separado do cache pra ser
// substituível em teste.
export async function buscarTokenRemoto(
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number; scope: string }> {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: ESCOPOS
  })

  let r: Response
  try {
    r = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo
    })
  } catch (e) {
    throw new ErroAcbr('indisponivel', `Falha ao contatar a ACBr: ${(e as Error).message}`)
  }

  const texto = await r.text()
  if (!r.ok) {
    if (r.status === 429) {
      const espera = Number(r.headers.get('retry-after')) || 3600
      throw new ErroAcbr(
        'limite',
        'Limite de pedidos de token atingido (4 por hora).',
        429,
        texto.slice(0, 300),
        espera
      )
    }
    throw new ErroAcbr(
      'auth',
      'Credenciais da ACBr recusadas.',
      r.status,
      texto.slice(0, 300)
    )
  }

  return JSON.parse(texto)
}

// Token válido, do cache ou novo. `forcar` ignora o cache (usado quando a API
// devolve 401 com um token que, pelo relógio, ainda valeria).
export async function obterToken(forcar = false): Promise<string> {
  const { clientId, clientSecret, base } = config()
  const agora = new Date()

  if (!forcar) {
    const guardado = obterTokenAcbr(base)
    if (guardado && venceEm(guardado.expira_em, agora) > DIAS_RENOVACAO_ANTECIPADA) {
      return guardado.access_token
    }
  }

  // Trava local: recusa antes de levar 429, e o erro diz o que fazer.
  const tentativa = registrarTentativaToken(base, MAX_PEDIDOS_TOKEN_HORA)
  if (!tentativa.permitido) {
    // Token ainda utilizável mesmo que perto de vencer é melhor que nada:
    // continuar emitindo com ele é preferível a parar a loja.
    const guardado = obterTokenAcbr(base)
    if (guardado && venceEm(guardado.expira_em, agora) > 0) return guardado.access_token
    throw new ErroAcbr(
      'limite',
      'Muitos pedidos de token nesta hora. Tente novamente na próxima hora.',
      429
    )
  }

  const novo = await buscarTokenRemoto(clientId, clientSecret)
  gravarTokenAcbr(base, {
    access_token: novo.access_token,
    escopos: novo.scope ?? ESCOPOS,
    obtido_em: agora.toISOString(),
    expira_em: new Date(agora.getTime() + novo.expires_in * 1000).toISOString()
  })
  return novo.access_token
}

type OpcoesChamada = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  corpo?: unknown
  // Resposta binária (PDF do DANFE, comandos ESC/POS).
  binario?: boolean
}

function traduzirErro(status: number, texto: string, retryAfter: string | null): ErroAcbr {
  let detalhe: unknown = texto.slice(0, 500)
  let mensagem = texto.slice(0, 200)
  try {
    const j = JSON.parse(texto)
    detalhe = j
    mensagem = j?.error?.message ?? mensagem
  } catch {
    // resposta não-JSON: fica o texto cru mesmo
  }

  if (status === 402) {
    return new ErroAcbr(
      'sem_credito',
      'Os créditos da ACBr acabaram. Recarregue para voltar a emitir.',
      status,
      detalhe
    )
  }
  if (status === 429) {
    return new ErroAcbr(
      'limite',
      'Muitas requisições à ACBr. Aguarde alguns instantes.',
      status,
      detalhe,
      Number(retryAfter) || undefined
    )
  }
  if (status === 400 || status === 422) {
    return new ErroAcbr('validacao', mensagem || 'Dados recusados pela ACBr.', status, detalhe)
  }
  if (status === 404) {
    return new ErroAcbr('nao_encontrado', 'Recurso não encontrado na ACBr.', status, detalhe)
  }
  if (status === 401 || status === 403) {
    return new ErroAcbr('auth', 'Acesso negado pela ACBr.', status, detalhe)
  }
  return new ErroAcbr('indisponivel', `ACBr indisponível (HTTP ${status}).`, status, detalhe)
}

// Chamada autenticada à ACBr. Renova o token uma vez em caso de 401 — cobre
// credencial rotacionada no console sem precisar de deploy.
export async function chamarAcbr<T = unknown>(
  rota: string,
  opcoes: OpcoesChamada = {}
): Promise<T> {
  const { base } = config()
  const { metodo = 'GET', corpo, binario = false } = opcoes

  const executar = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await fetch(`${base}${rota}`, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
      })
    } catch (e) {
      throw new ErroAcbr('indisponivel', `Falha de rede ao chamar a ACBr: ${(e as Error).message}`)
    }
  }

  let resposta = await executar(await obterToken())

  if (resposta.status === 401) {
    // Token guardado não vale mais (credencial trocada/revogada). Descarta e
    // tenta uma vez com um novo antes de desistir.
    apagarTokenAcbr(base)
    resposta = await executar(await obterToken(true))
  }

  if (!resposta.ok) {
    throw traduzirErro(resposta.status, await resposta.text(), resposta.headers.get('retry-after'))
  }

  if (binario) return (await resposta.arrayBuffer()) as T
  const texto = await resposta.text()
  return (texto ? JSON.parse(texto) : null) as T
}

// ─── Consultas de conta ───────────────────────────────────────────────────────

export type CotaPrePago = {
  percentual_disponivel: number
  creditos_disponiveis: number
  ultima_atualizacao: string
}

export function consultarCreditos(): Promise<CotaPrePago> {
  return chamarAcbr<CotaPrePago>('/conta/cotas/prepago')
}

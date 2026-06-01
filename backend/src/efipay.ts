// Cliente real da API PIX do EfiPay.
// Autenticação:
//   - mTLS: cert + private key apresentados em todo request (vem do .p12
//     baixado no painel da EfiPay, convertido pra PEM e injetado via env)
//   - OAuth2 client_credentials por cima do mTLS pra pegar Bearer token
//
// Mantém EXATAMENTE a mesma interface que o mock-efipay (criarCobrancaPIX
// e consultarCobrancaPIX) — quem importa não precisa saber se está usando
// mock ou real.
//
// Documentação: https://dev.efipay.com.br/docs/api-pix/

import { Agent } from 'undici'

export type CobrancaPIX = {
  txid: string
  qrcode: string // payload "copia e cola"
  qrcodeBase64: string // imagem PNG base64 (sem o "data:image/png;base64," prefix)
  expiraEm: string // ISO
}

// Endpoints diferentes por ambiente.
const URLS = {
  homologacao: 'https://pix-h.api.efipay.com.br',
  producao: 'https://pix.api.efipay.com.br'
} as const

type Ambiente = keyof typeof URLS

function obrigatoria(chave: string): string {
  const v = process.env[chave]
  if (!v) throw new Error(`env ${chave} obrigatória pra usar EfiPay real`)
  return v
}

const ambiente: Ambiente =
  process.env.EFI_AMBIENTE === 'producao' ? 'producao' : 'homologacao'
const baseUrl = URLS[ambiente]
const clientId = obrigatoria('EFI_CLIENT_ID')
const clientSecret = obrigatoria('EFI_CLIENT_SECRET')
const chavePix = obrigatoria('EFI_CHAVE_PIX')

// Dispatcher do undici com mTLS configurado. Reutilizado em todos os requests
// pra evitar overhead de TLS handshake a cada chamada.
const dispatcher = new Agent({
  connect: {
    cert: obrigatoria('EFI_CERT_PEM'),
    key: obrigatoria('EFI_KEY_PEM')
  }
})

// Cache do Bearer token. EfiPay devolve `expires_in` em segundos (1h padrão).
// Renovamos quando faltar menos de 30s pra expirar.
type TokenCache = { accessToken: string; expiraEmMs: number }
let tokenCache: TokenCache | null = null

async function obterToken(): Promise<string> {
  if (tokenCache && tokenCache.expiraEmMs > Date.now() + 30_000) {
    return tokenCache.accessToken
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const r = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    // @ts-expect-error — fetch global aceita dispatcher do undici em runtime
    dispatcher
  })
  if (!r.ok) {
    throw new Error(`EfiPay oauth falhou ${r.status}: ${await r.text()}`)
  }
  const j = (await r.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    accessToken: j.access_token,
    expiraEmMs: Date.now() + j.expires_in * 1000
  }
  return j.access_token
}

// Cria cobrança imediata. EfiPay gera o txid automaticamente quando usamos
// POST (vs PUT com txid fixo). Devolve uma location com o QR Code.
type RespostaCob = {
  txid: string
  location: { id: number; location: string }
  calendario: { expiracao: number; criacao: string }
  pixCopiaECola?: string
}

type RespostaQrcode = {
  qrcode: string
  imagemQrcode: string // "data:image/png;base64,..."
  linkVisualizacao: string
}

export async function criarCobrancaPIX(
  valorCentavos: number,
  diasExpiracao = 1
): Promise<CobrancaPIX> {
  const token = await obterToken()
  const expiracaoSegundos = diasExpiracao * 86_400
  const valor = (valorCentavos / 100).toFixed(2)

  const corpo = {
    calendario: { expiracao: expiracaoSegundos },
    valor: { original: valor },
    chave: chavePix,
    solicitacaoPagador: 'Renovação licença Sistema FHVP Tech'
  }

  const r = await fetch(`${baseUrl}/v2/cob`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(corpo),
    // @ts-expect-error
    dispatcher
  })
  if (!r.ok) {
    throw new Error(`EfiPay criar cob falhou ${r.status}: ${await r.text()}`)
  }
  const cob = (await r.json()) as RespostaCob

  // pixCopiaECola pode vir embedded; se não, busca pela location.
  let qrcode = cob.pixCopiaECola ?? ''
  let qrcodeBase64 = ''

  const rQr = await fetch(`${baseUrl}/v2/loc/${cob.location.id}/qrcode`, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-expect-error
    dispatcher
  })
  if (rQr.ok) {
    const qr = (await rQr.json()) as RespostaQrcode
    qrcode = qr.qrcode || qrcode
    qrcodeBase64 = qr.imagemQrcode.replace(/^data:image\/png;base64,/, '')
  }

  const criacao = new Date(cob.calendario.criacao)
  const expiraEm = new Date(
    criacao.getTime() + cob.calendario.expiracao * 1000
  ).toISOString()

  return {
    txid: cob.txid,
    qrcode,
    qrcodeBase64,
    expiraEm
  }
}

// Consulta o status de uma cobrança. Útil pra polling como fallback do
// webhook (ex: webhook não chegou por algum motivo).
type RespostaConsulta = {
  txid: string
  status: 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
}

export async function consultarCobrancaPIX(
  txid: string
): Promise<{ paga: boolean; expirada: boolean }> {
  const token = await obterToken()
  const r = await fetch(`${baseUrl}/v2/cob/${txid}`, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-expect-error
    dispatcher
  })
  if (!r.ok) {
    throw new Error(`EfiPay consultar cob falhou ${r.status}: ${await r.text()}`)
  }
  const j = (await r.json()) as RespostaConsulta
  return {
    paga: j.status === 'CONCLUIDA',
    expirada:
      j.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' ||
      j.status === 'REMOVIDA_PELO_PSP'
  }
}

// Configura o webhook na EfiPay apontando pra `webhookUrl`. A query string
// `ignorar-payload=true` faz a EfiPay pular o teste de mTLS no momento do
// registro — útil porque nosso Fly app não recebe mTLS, só envia. Operação
// idempotente: pode rodar de novo pra sobrescrever a URL existente.
export async function configurarWebhook(webhookUrl: string): Promise<void> {
  const token = await obterToken()
  const url = `${baseUrl}/v2/webhook/${encodeURIComponent(chavePix)}?ignorar-payload=true`
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ webhookUrl }),
    // @ts-expect-error
    dispatcher
  })
  if (!r.ok) {
    throw new Error(`EfiPay PUT webhook falhou ${r.status}: ${await r.text()}`)
  }
}

// Consulta a configuração atual de webhook (útil pra debug e pra confirmar
// que ficou apontando pra URL certa após o PUT).
export async function obterWebhookConfigurado(): Promise<{ webhookUrl: string; criacao: string } | null> {
  const token = await obterToken()
  const r = await fetch(`${baseUrl}/v2/webhook/${encodeURIComponent(chavePix)}`, {
    headers: { Authorization: `Bearer ${token}` },
    // @ts-expect-error
    dispatcher
  })
  if (r.status === 404) return null
  if (!r.ok) {
    throw new Error(`EfiPay GET webhook falhou ${r.status}: ${await r.text()}`)
  }
  return (await r.json()) as { webhookUrl: string; criacao: string }
}

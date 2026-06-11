// Backend de licenciamento + pagamento PIX do Sistema FHVP Tech.
// Roda em Node.js com Hono + @hono/node-server, hospedado no Fly.io.
//
// Fluxo simplificado:
//   1. (admin) POST /admin/cliente cria um cliente novo e gera a 1ª chave.
//   2. App pede POST /cobranca → backend cria PIX (mock) e devolve QR + txid.
//   3. App polla GET /cobranca/:txid até o pagamento cair.
//   4. EfiPay chama POST /webhook/efi quando confirma — backend gera nova
//      chave assinada e marca cobrança como paga.
//   5. App pega a chave do GET /cobranca/:txid e ativa localmente.
//
// Enquanto não temos EfiPay real, POST /admin/marcar-pago simula o webhook
// pra destravar testes end-to-end.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import type { Cliente, Cobranca, Config } from './tipos.ts'
import { proxyChat, type ChatRequest } from './chat.ts'
import {
  obterCliente,
  gravarCliente,
  obterCobranca,
  gravarCobranca,
  registrarPerguntaChat,
  registrarEnvioRecuperacao
} from './db.ts'
import { enviarCodigoRecuperacao } from './email.ts'
import {
  calcularExpiracao,
  somarDiasNaExpiracao,
  gerarChaveLicenca
} from './licenca.ts'
function obrigatoria(chave: string): string {
  const v = process.env[chave]
  if (!v) throw new Error(`env ${chave} obrigatória`)
  return v
}

const config: Config = {
  CHAVE_HMAC: obrigatoria('CHAVE_HMAC'),
  ADMIN_TOKEN: obrigatoria('ADMIN_TOKEN')
}

// Toggle entre mock e EfiPay real baseado em ter ou não credenciais.
// Em dev local sem EfiPay configurado, usa o mock. Em produção, real.
const usaMock = !process.env.EFI_CLIENT_ID
const { criarCobrancaPIX } = usaMock
  ? await import('./mock-efipay.ts')
  : await import('./efipay.ts')
console.log(`PIX provider: ${usaMock ? 'mock' : 'EfiPay (' + (process.env.EFI_AMBIENTE ?? 'homologacao') + ')'}`)

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => c.text('FHVP Tech — licenca API ok'))

// ───── Admin ─────────────────────────────────────────────────────────
// Protege rotas /admin/* com Bearer token (vem do env ADMIN_TOKEN).
app.use('/admin/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (token !== config.ADMIN_TOKEN) {
    return c.json({ erro: 'não autorizado' }, 401)
  }
  await next()
})

// Cria um cliente novo e devolve a 1ª chave (válida por `diasIniciais`).
// Aceita opcionalmente `valorCentavosRenovacao` pra fixar preço por cliente
// — quando definido, sobrescreve o que o app manda em POST /cobranca.
app.post('/admin/cliente', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    nome: string
    contato?: string
    diasIniciais?: number
    valorCentavosRenovacao?: number
  }>()
  if (!body.clienteId || !body.nome) {
    return c.json({ erro: 'clienteId e nome são obrigatórios' }, 400)
  }
  if (obterCliente(body.clienteId)) {
    return c.json({ erro: 'clienteId já existe' }, 409)
  }

  const dias = body.diasIniciais ?? 30
  const expiracao = calcularExpiracao(dias)
  const chave = await gerarChaveLicenca(config.CHAVE_HMAC, body.clienteId, expiracao)

  const cliente: Cliente = {
    clienteId: body.clienteId,
    nome: body.nome,
    contato: body.contato,
    criadoEm: new Date().toISOString(),
    validadeAtual: expiracao,
    ultimoPagamentoEm: new Date().toISOString(),
    valorCentavosRenovacao: body.valorCentavosRenovacao
  }
  gravarCliente(cliente)

  return c.json({ cliente, chave })
})

// Atualiza o preço de renovação de um cliente existente. Manda
// `valorCentavos: null` (ou omite) pra remover o preço fixo e voltar ao default.
app.post('/admin/cliente/:clienteId/preco', async (c) => {
  const clienteId = c.req.param('clienteId')
  const body = await c.req.json<{ valorCentavos?: number | null }>()
  const cliente = obterCliente(clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const novoValor =
    typeof body.valorCentavos === 'number' && body.valorCentavos > 0
      ? body.valorCentavos
      : undefined
  const atualizado: Cliente = { ...cliente, valorCentavosRenovacao: novoValor }
  gravarCliente(atualizado)
  return c.json({ ok: true, cliente: atualizado })
})

// Atalho de dev: simula o webhook do EfiPay marcando uma cobrança como paga.
app.post('/admin/marcar-pago', async (c) => {
  const { txid } = await c.req.json<{ txid: string }>()
  if (!txid) return c.json({ erro: 'txid obrigatório' }, 400)
  const resultado = await confirmarPagamento(txid)
  if (!resultado.ok) return c.json({ erro: resultado.mensagem }, 400)
  return c.json({ ok: true, chave: resultado.chave, cobranca: resultado.cobranca })
})

// ───── Chatbot (proxy autenticado pra Claude API) ─────────────────────
// Licença válida até o fim do dia de validadeAtual (AAAA-MM-DD).
function licencaAtiva(cliente: Cliente): boolean {
  if (!cliente.validadeAtual) return false
  const exp = new Date(cliente.validadeAtual + 'T23:59:59Z')
  return !isNaN(exp.getTime()) && exp.getTime() >= Date.now()
}

// Limite diário de PERGUNTAS ao assistente por cliente. Guarda contra abuso /
// custo descontrolado na API. Conta perguntas, não rodadas de tool — o app
// envia novaPergunta:true só na 1ª chamada de cada pergunta.
const LIMITE_PERGUNTAS_DIA = 150

// O app monta system+tools+messages (executa as tools no SQLite local) e manda
// pra cá só pra adicionar a API key e chamar a Anthropic. Ver chat.ts.
app.post('/chat', async (c) => {
  const body = await c.req.json<
    {
      clienteId: string
      novaPergunta?: boolean
    } & ChatRequest
  >()
  if (!body.clienteId) return c.json({ erro: 'clienteId obrigatório' }, 400)

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)
  if (!licencaAtiva(cliente)) return c.json({ erro: 'licença inativa' }, 403)

  // Só conta no limite as chamadas de pergunta nova (não as rodadas de tool).
  // Default = conta, a menos que o app diga explicitamente que é continuação.
  if (body.novaPergunta !== false) {
    const uso = registrarPerguntaChat(body.clienteId, LIMITE_PERGUNTAS_DIA)
    if (!uso.permitido) {
      return c.json(
        {
          erro:
            `Você já usou suas ${LIMITE_PERGUNTAS_DIA} perguntas de hoje ao assistente. ` +
            `O limite reseta amanhã. Quer aproveitar mais? Fale com o suporte sobre um upgrade do plano — ` +
            `pelo botão "Suporte" na barra lateral ou no WhatsApp (85) 9.2187-1975.`
        },
        429
      )
    }
  }

  const r = await proxyChat({
    system: body.system,
    tools: body.tools,
    messages: body.messages,
    max_tokens: body.max_tokens
  })
  if (!r.ok) return c.json({ erro: r.erro }, r.status as 400)
  return c.json(r.message)
})

// ───── Recuperação de acesso (envia código de PIN por email) ──────────
// O app gera o código de 6 dígitos, guarda o HASH localmente e manda o código
// pra cá só pra enviar por email. Este endpoint NÃO guarda nem valida o código
// (isso é local, no app) — é um relay fino, gateado por licença + rate-limit.
const LIMITE_RECUPERACAO_HORA = 3
const MINUTOS_VALIDADE_CODIGO = 15

app.post('/recuperacao/enviar', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    para: string
    codigo: string
    nome?: string
  }>()

  if (!body.clienteId || !body.para || !body.codigo) {
    return c.json({ erro: 'clienteId, para e codigo são obrigatórios' }, 400)
  }

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)
  if (!licencaAtiva(cliente)) return c.json({ erro: 'licença inativa' }, 403)

  const email = body.para.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ erro: 'email inválido' }, 400)
  }
  // O corpo do email só aceita um código de 6 dígitos — trava o endpoint como
  // canal de texto arbitrário (anti-abuso) além do escape de HTML no nome.
  if (!/^\d{6}$/.test(body.codigo)) {
    return c.json({ erro: 'codigo deve ter 6 dígitos' }, 400)
  }

  const uso = registrarEnvioRecuperacao(email, LIMITE_RECUPERACAO_HORA)
  if (!uso.permitido) {
    return c.json(
      { erro: 'Muitas solicitações. Aguarde alguns minutos antes de pedir um novo código.' },
      429
    )
  }

  const r = await enviarCodigoRecuperacao({
    para: email,
    codigo: body.codigo,
    nome: body.nome,
    minutosValidade: MINUTOS_VALIDADE_CODIGO
  })
  if (!r.ok) return c.json({ erro: r.erro }, r.status as 400)
  return c.json({ ok: true })
})

// ───── App ───────────────────────────────────────────────────────────
app.post('/cobranca', async (c) => {
  const body = await c.req.json<{
    clienteId: string
    diasContratados?: number
    valorCentavos?: number
  }>()
  if (!body.clienteId) return c.json({ erro: 'clienteId obrigatório' }, 400)

  const cliente = obterCliente(body.clienteId)
  if (!cliente) return c.json({ erro: 'cliente não encontrado' }, 404)

  const diasContratados = body.diasContratados ?? 30
  // Preço fixo do cliente (cadastrado por admin) sobrescreve o que o app
  // manda. Permite cobrar valores diferentes por cliente sem release do app.
  const valorCentavos =
    cliente.valorCentavosRenovacao ?? body.valorCentavos ?? 8000

  const pix = await criarCobrancaPIX(valorCentavos)
  const cobranca: Cobranca = {
    txid: pix.txid,
    clienteId: cliente.clienteId,
    valorCentavos,
    diasContratados,
    status: 'pendente',
    qrcode: pix.qrcode,
    qrcodeBase64: pix.qrcodeBase64,
    criadaEm: new Date().toISOString(),
    expiraEm: pix.expiraEm
  }
  gravarCobranca(cobranca)
  return c.json(cobranca)
})

app.get('/cobranca/:txid', async (c) => {
  const txid = c.req.param('txid')
  const cobranca = obterCobranca(txid)
  if (!cobranca) return c.json({ erro: 'cobrança não encontrada' }, 404)

  // Se ainda pendente em modo EfiPay real, consulta status atual na API.
  // Mais simples que webhook (não precisa mTLS de recebimento no nosso backend),
  // e o frontend já está pollando aqui mesmo a cada poucos segundos.
  if (cobranca.status === 'pendente' && !usaMock) {
    try {
      const efi = await import('./efipay.ts')
      const status = await efi.consultarCobrancaPIX(txid)
      if (status.paga) {
        const r = await confirmarPagamento(txid)
        if (r.ok) return c.json(r.cobranca)
      }
    } catch (e) {
      // Falha de rede com EfiPay não bloqueia a resposta — frontend tenta de novo
      // no próximo poll. Mantém o status local atual.
      console.error('Falha ao consultar EfiPay:', (e as Error).message)
    }
  }

  return c.json(cobranca)
})

// Webhook que o EfiPay vai chamar quando o pagamento cair.
// Payload real do EfiPay: { pix: [ { txid, endToEndId, valor, ... } ] }
app.post('/webhook/efi', async (c) => {
  const body = await c.req.json<{ pix?: Array<{ txid: string }> }>()
  const eventos = body.pix ?? []
  const resultados: Array<{ txid: string; ok: boolean; erro?: string }> = []
  for (const evt of eventos) {
    const r = await confirmarPagamento(evt.txid)
    resultados.push({ txid: evt.txid, ok: r.ok, erro: r.ok ? undefined : r.mensagem })
  }
  return c.json({ recebidos: resultados.length, resultados })
})

// ───── Lógica compartilhada ─────────────────────────────────────────
// Idempotente: se a cobrança já estava paga, só devolve a chave existente.
type ResultadoPagamento =
  | { ok: true; cobranca: Cobranca; chave: string }
  | { ok: false; mensagem: string }

async function confirmarPagamento(txid: string): Promise<ResultadoPagamento> {
  const cobranca = obterCobranca(txid)
  if (!cobranca) return { ok: false, mensagem: 'cobrança não encontrada' }

  if (cobranca.status === 'paga' && cobranca.chaveLicencaGerada) {
    return { ok: true, cobranca, chave: cobranca.chaveLicencaGerada }
  }
  if (cobranca.status === 'expirada') {
    return { ok: false, mensagem: 'cobrança expirada' }
  }

  const cliente = obterCliente(cobranca.clienteId)
  if (!cliente) return { ok: false, mensagem: 'cliente não encontrado' }

  const novaExpiracao = somarDiasNaExpiracao(
    cliente.validadeAtual,
    cobranca.diasContratados
  )
  const chave = await gerarChaveLicenca(config.CHAVE_HMAC, cliente.clienteId, novaExpiracao)

  const agora = new Date().toISOString()
  const cobrancaPaga: Cobranca = {
    ...cobranca,
    status: 'paga',
    pagaEm: agora,
    chaveLicencaGerada: chave
  }
  const clienteAtualizado: Cliente = {
    ...cliente,
    validadeAtual: novaExpiracao,
    ultimoPagamentoEm: agora
  }
  gravarCobranca(cobrancaPaga)
  gravarCliente(clienteAtualizado)

  return { ok: true, cobranca: cobrancaPaga, chave }
}

const porta = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port: porta }, (info) => {
  console.log(`licenca API ouvindo em http://0.0.0.0:${info.port}`)
})

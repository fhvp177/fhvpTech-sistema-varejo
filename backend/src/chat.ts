// Proxy autenticado pra Claude API (chatbot do app).
//
// Por que existe: o SQLite com os dados do lojista está LOCAL, no PC dele — o
// loop de tool-use roda no app (Electron main), que consulta o banco e monta a
// conversa. Mas a API key da Anthropic NÃO pode ir pro cliente (repo/binário).
// Então o app manda system+tools+messages pra cá, e este módulo injeta a key,
// fixa o modelo (Haiku) e limita max_tokens antes de chamar a Anthropic.
//
// É um proxy fino e transparente: NÃO entende de tools (quem executa é o app).
// Só repassa o request já montado e devolve a Message crua pro app continuar o
// loop. O `cache_control` que o app puser em tools/system passa direto.

import Anthropic from '@anthropic-ai/sdk'

// Fixo no servidor — ignora qualquer `model` que o cliente mande, pra uma
// licença ativa não conseguir rodar Opus na nossa conta. Haiku 4.5 é barato e
// suficiente pra consultas sobre estoque/vendas.
const MODELO = 'claude-haiku-4-5'

// Teto de saída por resposta. Resposta de chatbot de varejo é curta; isto
// limita custo mesmo que o cliente peça mais.
const MAX_TOKENS_TETO = 2048

let client: Anthropic | null = null

// Campos que o app monta e manda. Tipados a partir do próprio SDK pra não
// divergir do contrato da Messages API.
export type ChatRequest = {
  system?: Anthropic.MessageCreateParams['system']
  tools?: Anthropic.MessageCreateParams['tools']
  messages: Anthropic.MessageParam[]
  max_tokens?: number
}

export type ResultadoChat =
  | { ok: true; message: Anthropic.Message }
  | { ok: false; status: number; erro: string }

export async function proxyChat(req: ChatRequest): Promise<ResultadoChat> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return { ok: false, status: 503, erro: 'Assistente de IA não está configurado no servidor.' }
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return { ok: false, status: 400, erro: 'messages é obrigatório.' }
  }

  if (!client) client = new Anthropic({ apiKey: key })

  const maxTokens = Math.min(
    typeof req.max_tokens === 'number' && req.max_tokens > 0 ? req.max_tokens : MAX_TOKENS_TETO,
    MAX_TOKENS_TETO
  )

  try {
    const message = await client.messages.create({
      model: MODELO,
      max_tokens: maxTokens,
      system: req.system,
      tools: req.tools,
      messages: req.messages
    })
    return { ok: true, message }
  } catch (e) {
    // Exceções tipadas do SDK (não casar por string de mensagem).
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, erro: 'Limite de uso da IA atingido. Tente novamente em instantes.' }
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, status: 503, erro: 'Credencial da IA inválida no servidor.' }
    }
    if (e instanceof Anthropic.APIError) {
      // Saldo de créditos esgotado (billing_error / "credit balance too low").
      // Mensagem amigável de upgrade em vez de erro técnico.
      const tipo = (e as { type?: string }).type ?? ''
      const msg = (e.message ?? '').toLowerCase()
      const ehCredito = tipo === 'billing_error' || msg.includes('credit') || msg.includes('billing')
      if (ehCredito) {
        return {
          ok: false,
          status: 402,
          erro:
            'O assistente de IA está temporariamente indisponível — o plano de uso do período se esgotou. ' +
            'Para reativar agora, fale com o suporte sobre um upgrade do plano: ' +
            'botão "Suporte" na barra lateral ou WhatsApp (85) 9.2187-1975.'
        }
      }
      return { ok: false, status: 502, erro: `Falha ao consultar a IA (${e.status ?? 'erro'}).` }
    }
    return { ok: false, status: 500, erro: (e as Error).message }
  }
}

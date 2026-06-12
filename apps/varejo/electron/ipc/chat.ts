// Handler IPC + loop de tool-use do chatbot.
//
// O loop roda AQUI (main process) porque as tools consultam o SQLite local. A
// cada rodada chamamos o proxy do backend (POST /chat), que injeta a API key e
// fala com a Claude API. Quando o modelo pede tools, executamos localmente e
// devolvemos os resultados; repetimos até o modelo dar a resposta final.
// Ver electron/chat/ferramentas.ts (tools) e backend/src/chat.ts (proxy).

import { ipcMain } from 'electron'
import { extrairClienteIdLocal } from '../licenca'
import { TOOLS, executarTool } from '../chat/ferramentas'

// Mesmo backend usado na renovação de licença (ipc/licenca-pagamento.ts).
const URL_BACKEND = 'https://licenca-gnmodas.fly.dev'

// Trava de segurança: no máximo N idas à API por mensagem do usuário, pra um
// loop de tools nunca rodar indefinidamente (custo/latência).
const MAX_RODADAS = 5

const SYSTEM = `Você é o assistente do Sistema da FHVP Tech, um sistema de gestão para a loja de varejo do usuário. Você ajuda o lojista a consultar dados da própria loja: estoque, preços de venda, vendas, giro de produtos e contas a receber (inadimplência). Nunca se refira ao sistema como "Sistema RT" — a marca para o usuário é sempre "FHVP Tech".

Regras:
- Responda em português do Brasil, de forma curta e prática.
- Use as ferramentas para obter dados REAIS do banco. Nunca invente números, preços ou estoques.
- O sistema NÃO armazena custo de compra nem margem de lucro — apenas o preço de venda. Se perguntarem sobre custo ou margem, explique que esse dado não está cadastrado no sistema.
- Valores em reais (R$).
- Se uma consulta não retornar resultado, diga isso claramente em vez de supor.

Sobre pagamentos e inadimplência: o sistema controla vendas a prazo e parceladas, com data de vencimento. "Inadimplente" / "em atraso" = venda a prazo ou parcela cujo vencimento JÁ passou e não foi paga. "A vencer" / "pendente" = ainda dentro do prazo (deve, mas não está atrasado). São coisas diferentes: ao pedirem "somente os inadimplentes", liste apenas quem tem valor EM ATRASO, sem misturar com quem só tem parcelas a vencer. Para qualquer pergunta sobre devedores, atraso, cobrança ou contas a receber, use a ferramenta contas_a_receber — o sistema CONSEGUE, sim, identificar inadimplência pela data de vencimento.`

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown }

type MensagemClaude = {
  role: 'assistant'
  content: Bloco[]
  stop_reason: string | null
}

export type MensagemChat = { role: 'user' | 'assistant'; content: string }

async function chamarBackend(
  clienteId: string,
  messages: unknown[],
  novaPergunta: boolean
): Promise<MensagemClaude> {
  const r = await fetch(`${URL_BACKEND}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clienteId,
      // Só a 1ª rodada conta no limite diário; as rodadas de tool seguintes não.
      novaPergunta,
      // Breakpoint de cache no system: como tools renderizam antes do system,
      // marcar o system cacheia tools+system juntos (ver prompt-caching).
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages
    })
  })
  if (!r.ok) {
    let msg = `Erro ${r.status} ao falar com o assistente`
    try {
      const corpo = (await r.json()) as { erro?: string }
      if (corpo.erro) msg = corpo.erro
    } catch {
      // corpo não-JSON; mantém a mensagem genérica
    }
    throw new Error(msg)
  }
  return (await r.json()) as MensagemClaude
}

function textoFinal(content: Bloco[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

async function conversar(historico: MensagemChat[]): Promise<string> {
  const clienteId = extrairClienteIdLocal()
  if (!clienteId) {
    throw new Error('Nenhuma licença ativa encontrada — o assistente precisa de uma loja cadastrada.')
  }

  // Começa com o histórico simples (texto). Durante o loop anexamos os blocos
  // crus (tool_use do assistant, tool_result do user) que a API exige.
  const messages: unknown[] = historico.map((m) => ({ role: m.role, content: m.content }))

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const message = await chamarBackend(clienteId, messages, rodada === 0)
    messages.push({ role: 'assistant', content: message.content })

    if (message.stop_reason !== 'tool_use') {
      return textoFinal(message.content) || 'Não consegui formular uma resposta.'
    }

    const usosTool = message.content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use'
    )
    const resultados = usosTool.map((tu) => {
      const r = executarTool(tu.name, tu.input ?? {})
      return {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: r.conteudo,
        is_error: r.erro
      }
    })
    messages.push({ role: 'user', content: resultados })
  }

  return 'A consulta ficou longa demais. Tente reformular a pergunta de forma mais específica.'
}

export function registrarHandlersChat(): void {
  ipcMain.handle('chat:enviar', async (_event, historico: MensagemChat[]) => {
    try {
      if (!Array.isArray(historico) || historico.length === 0) {
        return { success: false, error: 'Nenhuma mensagem para enviar.' }
      }
      const resposta = await conversar(historico)
      return { success: true, data: resposta }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

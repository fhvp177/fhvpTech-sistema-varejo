// Handlers IPC pra fluxo de renovação de licença via PIX.
// Conversa com o backend (Fly.io / Node) que orquestra a cobrança e
// devolve a chave assinada quando o pagamento confirma.
//
// O clienteId vem da própria licença local — se não houver licença, não
// dá pra renovar (primeira venda continua sendo manual).

import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'

// URL do backend de licenciamento. Mude pra http://localhost:8080 se quiser
// testar contra o backend rodando localmente (npm run dev em backend/).
const URL_BACKEND = 'https://licenca-gnmodas.fly.dev'

type RespostaCobranca = {
  txid: string
  clienteId: string
  valorCentavos: number
  diasContratados: number
  status: 'pendente' | 'paga' | 'expirada'
  qrcode: string
  qrcodeBase64: string
  criadaEm: string
  expiraEm: string
  pagaEm?: string
  chaveLicencaGerada?: string
}

export function registrarHandlersLicencaPagamento(): void {
  registrarCanal('licenca:obterClienteId', () => {
    try {
      return { success: true, data: extrairClienteIdLocal() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Quem atende esta loja — a FHVP ou o revendedor que a vendeu.
   *
   * Serve à tela de licença bloqueada, que é onde a pergunta importa: ela mostra
   * um telefone e um botão de renovar por PIX, e os dois estão ERRADOS para
   * quem comprou de um revendedor. O PIX cairia na conta da FHVP (dinheiro no
   * lado errado do ciclo) e o telefone mandaria o lojista ligar para quem não
   * atende a conta dele.
   *
   * ── Falhar aqui não pode piorar a tela ───────────────────────────────────
   * Esta consulta acontece justamente quando a licença venceu — e uma loja com
   * a licença vencida tem chance real de estar sem internet. Por isso qualquer
   * problema (offline, backend fora, resposta estranha) devolve `null`, e a tela
   * cai no texto genérico da FHVP. Nunca um erro na cara de quem já está vendo
   * uma tela de bloqueio.
   *
   * O timeout curto é parte disso: sem ele, a tela ficaria com o contato em
   * branco por meio minuto esperando um servidor que não vem.
   */
  registrarCanal('licenca:suporte', async () => {
    try {
      const clienteId = extrairClienteIdLocal()
      if (!clienteId) return { success: true, data: null }

      const resp = await fetch(`${URL_BACKEND}/suporte/${encodeURIComponent(clienteId)}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!resp.ok) return { success: true, data: null }
      return { success: true, data: await resp.json() }
    } catch {
      // Offline é o caso ESPERADO, não uma exceção — daí o catch mudo.
      return { success: true, data: null }
    }
  })

  registrarCanal(
    'licenca:criarCobranca',
    async (dados: { diasContratados?: number; valorCentavos?: number }) => {
      try {
        const clienteId = extrairClienteIdLocal()
        if (!clienteId) {
          return {
            success: false,
            error:
              'Nenhuma licença ativa encontrada. Entre em contato com o suporte pra cadastrar sua loja antes de renovar.'
          }
        }
        const r = await fetch(`${URL_BACKEND}/cobranca`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteId,
            diasContratados: dados.diasContratados ?? 30,
            valorCentavos: dados.valorCentavos ?? 10000
          })
        })
        if (!r.ok) {
          const corpo = await r.text()
          return { success: false, error: corpo || `Erro ${r.status} ao criar cobrança` }
        }
        const cobranca = (await r.json()) as RespostaCobranca
        return { success: true, data: cobranca }
      } catch (error) {
        return {
          success: false,
          error: `Falha de conexão com o servidor de licenças: ${(error as Error).message}`
        }
      }
    }
  )

  registrarCanal('licenca:consultarCobranca', async (txid: string) => {
    try {
      const r = await fetch(`${URL_BACKEND}/cobranca/${encodeURIComponent(txid)}`)
      if (!r.ok) {
        const corpo = await r.text()
        return { success: false, error: corpo || `Erro ${r.status} ao consultar cobrança` }
      }
      const cobranca = (await r.json()) as RespostaCobranca
      return { success: true, data: cobranca }
    } catch (error) {
      return {
        success: false,
        error: `Falha de conexão com o servidor de licenças: ${(error as Error).message}`
      }
    }
  })
}

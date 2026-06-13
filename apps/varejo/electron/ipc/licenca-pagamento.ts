// Handlers IPC pra fluxo de renovação de licença via PIX.
// Conversa com o backend (Fly.io / Node) que orquestra a cobrança e
// devolve a chave assinada quando o pagamento confirma.
//
// O clienteId vem da própria licença local — se não houver licença, não
// dá pra renovar (primeira venda continua sendo manual).

import { ipcMain } from 'electron'
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
  ipcMain.handle('licenca:obterClienteId', () => {
    try {
      return { success: true, data: extrairClienteIdLocal() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'licenca:criarCobranca',
    async (
      _event,
      dados: { diasContratados?: number; valorCentavos?: number }
    ) => {
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
            valorCentavos: dados.valorCentavos ?? 8000
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

  ipcMain.handle('licenca:consultarCobranca', async (_event, txid: string) => {
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

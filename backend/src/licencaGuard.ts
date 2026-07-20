// Checagem de licença ativa, compartilhada entre as rotas.
//
// Extraída do index.ts pra não viver em dois lugares: a rota fiscal precisa da
// MESMA regra do /chat e do /recuperacao. Duas cópias divergiriam com o tempo
// (mesmo motivo que levou a formatação de endereço pro core).

import type { Cliente } from './tipos.ts'
import { obterCliente } from './db.ts'

// Licença vale até o fim do dia de `validadeAtual` (AAAA-MM-DD), em UTC.
export function licencaAtiva(cliente: Cliente): boolean {
  if (!cliente.validadeAtual) return false
  const exp = new Date(cliente.validadeAtual + 'T23:59:59Z')
  return !isNaN(exp.getTime()) && exp.getTime() >= Date.now()
}

export type ResultadoLicenca =
  | { ok: true; cliente: Cliente }
  | { ok: false; status: 400 | 403 | 404; erro: string }

// Resolve o clienteId e confirma licença ativa em um passo. Devolve o status
// HTTP certo pra cada recusa, pra rota não repetir esse encadeamento.
export function exigirLicenca(clienteId: string | undefined): ResultadoLicenca {
  if (!clienteId) return { ok: false, status: 400, erro: 'clienteId obrigatório' }
  const cliente = obterCliente(clienteId)
  if (!cliente) return { ok: false, status: 404, erro: 'cliente não encontrado' }
  if (!licencaAtiva(cliente)) return { ok: false, status: 403, erro: 'licença inativa' }
  return { ok: true, cliente }
}

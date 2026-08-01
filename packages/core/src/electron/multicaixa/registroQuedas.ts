/**
 * Diário de quedas de conexão do caixa adicional.
 *
 * ── Para que serve ───────────────────────────────────────────────────────────
 * "O segundo caixa fica caindo" é uma reclamação impossível de investigar sem
 * dado. Caiu quantas vezes? Por quanto tempo? Sempre no mesmo horário? Com
 * isto registrado, a conversa deixa de ser sobre impressão e passa a ser sobre
 * fato — e costuma apontar para o roteador da loja ou para o computador
 * principal entrando em suspensão, não para o sistema.
 *
 * ── Por que arquivo, e não banco ─────────────────────────────────────────────
 * Quem sofre a queda é o caixa adicional, e ele não tem banco. Vai para o
 * userData, ao lado da configuração do multicaixa.
 *
 * ── Por que nunca lança ──────────────────────────────────────────────────────
 * Isto é diagnóstico. Um erro ao gravar diagnóstico jamais pode atrapalhar a
 * venda — falha em silêncio e a vida segue.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'

/** Guarda as últimas quedas. Além disso não ajuda a diagnosticar e só ocupa espaço. */
export const MAXIMO_REGISTROS = 200

export interface Queda {
  caiuEm: string
  /** `null` enquanto ainda está fora do ar. */
  voltouEm: string | null
}

export interface ResumoQuedas {
  total: number
  ultimaQueda: string | null
  /** Soma do tempo fora do ar, só das quedas já encerradas. */
  tempoForaMs: number
  /** Há uma queda em aberto agora. */
  foraDoArAgora: boolean
}

function ler(caminho: string): Queda[] {
  if (!existsSync(caminho)) return []
  try {
    const bruto = JSON.parse(readFileSync(caminho, 'utf8'))
    if (!Array.isArray(bruto)) return []
    return bruto.filter(
      (q): q is Queda =>
        Boolean(q) &&
        typeof q === 'object' &&
        typeof (q as Queda).caiuEm === 'string' &&
        (typeof (q as Queda).voltouEm === 'string' || (q as Queda).voltouEm === null)
    )
  } catch {
    return []
  }
}

function gravar(caminho: string, quedas: Queda[]): void {
  try {
    const temporario = `${caminho}.tmp`
    writeFileSync(temporario, JSON.stringify(quedas.slice(-MAXIMO_REGISTROS), null, 2), 'utf8')
    renameSync(temporario, caminho)
  } catch {
    // Diagnóstico não pode atrapalhar a venda.
  }
}

/** Anota que a conexão caiu agora. Queda repetida sem volta não duplica registro. */
export function anotarQueda(caminho: string, quando: string = new Date().toISOString()): void {
  const quedas = ler(caminho)
  const ultima = quedas[quedas.length - 1]
  if (ultima && ultima.voltouEm === null) return
  quedas.push({ caiuEm: quando, voltouEm: null })
  gravar(caminho, quedas)
}

/** Fecha a queda em aberto. Volta sem queda anterior é ignorada. */
export function anotarVolta(caminho: string, quando: string = new Date().toISOString()): void {
  const quedas = ler(caminho)
  const ultima = quedas[quedas.length - 1]
  if (!ultima || ultima.voltouEm !== null) return
  ultima.voltouEm = quando
  gravar(caminho, quedas)
}

export function resumirQuedas(caminho: string): ResumoQuedas {
  const quedas = ler(caminho)
  const ultima = quedas[quedas.length - 1]
  let tempoForaMs = 0
  for (const q of quedas) {
    if (!q.voltouEm) continue
    const inicio = Date.parse(q.caiuEm)
    const fim = Date.parse(q.voltouEm)
    if (Number.isFinite(inicio) && Number.isFinite(fim) && fim > inicio) tempoForaMs += fim - inicio
  }
  return {
    total: quedas.length,
    ultimaQueda: ultima?.caiuEm ?? null,
    tempoForaMs,
    foraDoArAgora: Boolean(ultima && ultima.voltouEm === null)
  }
}

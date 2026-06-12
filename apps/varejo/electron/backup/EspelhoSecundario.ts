import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join, basename } from 'path'

// Mesmos limites da política principal — a pasta secundária segue FIFO simples
// (sem promoções semanal/mensal, só cópias diretas de cada backup criado)
const LIMITES_FIFO: Record<string, number> = {
  automaticos: 5,
  diarios: 7,
  semanais: 4,
  mensais: 3,
  manuais: 10,
  'pre-update': 3,
  'pre-restauracao': 3,
}

export type ResultadoEspelho = {
  sucesso: boolean
  erro?: string
}

/**
 * Copia um ZIP de backup para a subpasta correspondente na pasta secundária
 * e aplica FIFO para manter os limites de retenção.
 *
 * Não lança exceção — falha no espelho nunca deve bloquear o backup primário.
 */
export function espelharBackup(
  caminhoZipOrigem: string,
  pastaSecundaria: string,
  subpasta: string
): ResultadoEspelho {
  if (!pastaSecundaria) return { sucesso: true } // sem pasta configurada — silencioso

  try {
    const pastaDestino = join(pastaSecundaria, subpasta)
    mkdirSync(pastaDestino, { recursive: true })

    const nomeArquivo = basename(caminhoZipOrigem)
    copyFileSync(caminhoZipOrigem, join(pastaDestino, nomeArquivo))

    aplicarFifo(pastaDestino, LIMITES_FIFO[subpasta] ?? 10)

    return { sucesso: true }
  } catch (err) {
    return { sucesso: false, erro: (err as Error).message }
  }
}

function aplicarFifo(pasta: string, limite: number): void {
  if (!existsSync(pasta)) return

  // Formato do nome garante que ordem alfabética == ordem cronológica
  const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith('.zip'))
    .sort()

  for (let i = 0; i < arquivos.length - limite; i++) {
    try {
      rmSync(join(pasta, arquivos[i]), { force: true })
    } catch {
      // ignora falha individual — não deve travar o processo
    }
  }
}

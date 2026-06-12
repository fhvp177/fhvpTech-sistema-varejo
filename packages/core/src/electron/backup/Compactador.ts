import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { createWriteStream, mkdirSync } from 'fs'
import { dirname, join } from 'path'

export type MetadadoBackup = {
  versao_app: string
  data: string        // ISO 8601
  tipo: string        // 'automatico' | 'diario' | 'manual' | 'pre-update' | 'pre-restauracao'
  tamanho_db_bytes: number
}

export type ResultadoCompactacao = {
  sucesso: boolean
  tamanhoBytes?: number
  erro?: string
}

export type ResultadoExtracao = {
  sucesso: boolean
  caminhoDb?: string
  metadata?: MetadadoBackup
  erro?: string
}

/**
 * Cria um ZIP contendo a cópia do banco + metadata.json.
 * Recebe o caminho da *cópia* do banco (já gerada por db.backup()),
 * nunca o arquivo de banco ativo.
 */
export async function criarZip(
  caminhoDbCopia: string,
  caminhoZipDestino: string,
  metadata: MetadadoBackup
): Promise<ResultadoCompactacao> {
  try {
    mkdirSync(dirname(caminhoZipDestino), { recursive: true })

    return await new Promise<ResultadoCompactacao>((resolve) => {
      const output = createWriteStream(caminhoZipDestino)
      const archive = archiver('zip', { zlib: { level: 6 } })

      output.on('close', () => {
        resolve({ sucesso: true, tamanhoBytes: archive.pointer() })
      })

      archive.on('error', (err: Error) => {
        resolve({ sucesso: false, erro: err.message })
      })

      archive.pipe(output)
      archive.file(caminhoDbCopia, { name: 'database.sqlite' })
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })
      archive.finalize()
    })
  } catch (err) {
    return { sucesso: false, erro: (err as Error).message }
  }
}

/**
 * Extrai um ZIP de backup, retornando o caminho do database.sqlite
 * extraído e os metadados do backup.
 */
export function extrairZip(
  caminhoZip: string,
  pastaDestino: string
): ResultadoExtracao {
  try {
    mkdirSync(pastaDestino, { recursive: true })
    const zip = new AdmZip(caminhoZip)
    zip.extractAllTo(pastaDestino, true)

    const entradaMetadata = zip.getEntry('metadata.json')
    let metadata: MetadadoBackup | undefined
    if (entradaMetadata) {
      metadata = JSON.parse(entradaMetadata.getData().toString('utf8')) as MetadadoBackup
    }

    return {
      sucesso: true,
      caminhoDb: join(pastaDestino, 'database.sqlite'),
      metadata,
    }
  } catch (err) {
    return { sucesso: false, erro: (err as Error).message }
  }
}

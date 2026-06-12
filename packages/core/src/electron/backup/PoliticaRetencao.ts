import { readdirSync, statSync, renameSync, unlinkSync } from 'fs'
import { join, basename } from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArquivoBackup = {
  caminho: string
  data: Date
  tamanhoBytes: number
}

export type ResultadoPolitica = {
  arquivosDeletados: number
  arquivosPromovidos: number
  tamanhoTotalMB: number
  alertaTamanho: boolean         // true se total > 500 MB
  novaDataPromocaoSemanal?: Date // definido quando promoção semanal ocorreu
  novaDataPromocaoMensal?: Date  // definido quando promoção mensal ocorreu
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMITES_FIFO: Record<string, number> = {
  automaticos: 5,
  diarios: 7,
  semanais: 4,
  mensais: 3,
  manuais: 10,
  'pre-update': 3,
  'pre-restauracao': 3,
}

const ALERTA_TAMANHO_BYTES = 500 * 1024 * 1024 // 500 MB

// ─── Funções puras (sem efeitos colaterais — testáveis isoladamente) ──────────

/** Extrai a data do nome de arquivo de backup. Retorna null se o nome não bate o padrão. */
export function parsearDataDoNome(nomeArquivo: string): Date | null {
  const match = nomeArquivo.match(/backup_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_/)
  if (!match) return null
  const [, data, hh, mm, ss] = match
  const d = new Date(`${data}T${hh}:${mm}:${ss}`)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Retorna os arquivos mais antigos que excedem o limite.
 * Input deve estar em qualquer ordem — a função ordena internamente.
 */
export function arquivosParaDeletar(arquivos: ArquivoBackup[], limite: number): ArquivoBackup[] {
  const ordenados = [...arquivos].sort((a, b) => a.data.getTime() - b.data.getTime())
  const excesso = ordenados.length - limite
  return excesso > 0 ? ordenados.slice(0, excesso) : []
}

/** Retorna true se a promoção semanal (diarios → semanais) ainda não aconteceu nesta semana. */
export function precisaPromocaoSemanal(
  ultimaPromocao: Date | null,
  agora: Date = new Date()
): boolean {
  const domingo = domingoMaisRecente(agora)
  return !ultimaPromocao || ultimaPromocao < domingo
}

/** Retorna true se a promoção mensal (semanais → mensais) ainda não aconteceu neste mês. */
export function precisaPromocaoMensal(
  ultimaPromocao: Date | null,
  agora: Date = new Date()
): boolean {
  const primeiroDia = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0)
  return !ultimaPromocao || ultimaPromocao < primeiroDia
}

// ─── Helpers de filesystem ────────────────────────────────────────────────────

/** Lista todos os ZIPs de uma pasta, ordenados do mais antigo ao mais recente. */
export function listarArquivosBackup(pasta: string): ArquivoBackup[] {
  try {
    return readdirSync(pasta)
      .filter((f) => f.endsWith('.zip'))
      .map((nome) => {
        const caminho = join(pasta, nome)
        const data = parsearDataDoNome(nome) ?? new Date(0)
        const tamanhoBytes = statSync(caminho).size
        return { caminho, data, tamanhoBytes }
      })
      .sort((a, b) => a.data.getTime() - b.data.getTime())
  } catch {
    return []
  }
}

// ─── Ponto de entrada principal ───────────────────────────────────────────────

/**
 * Aplica a política completa de retenção:
 * 1. Promoção mensal (semanais → mensais) — checada antes da semanal para evitar
 *    que um arquivo recém-promovido seja promovido novamente no mesmo boot.
 * 2. Promoção semanal (diarios → semanais).
 * 3. Rotação FIFO em todas as pastas.
 * 4. Cálculo do alerta de tamanho total.
 *
 * Retorna o resultado para que o chamador persista as novas datas de promoção.
 */
export function aplicarPoliticaCompleta(
  pastaPadrao: string,
  opcoes: {
    ultimaPromocaoSemanal: Date | null
    ultimaPromocaoMensal: Date | null
    agora?: Date
  }
): ResultadoPolitica {
  const agora = opcoes.agora ?? new Date()
  let arquivosDeletados = 0
  let arquivosPromovidos = 0
  let novaDataPromocaoSemanal: Date | undefined
  let novaDataPromocaoMensal: Date | undefined

  // 1. Promoção mensal primeiro
  if (precisaPromocaoMensal(opcoes.ultimaPromocaoMensal, agora)) {
    const res = moverMaisRecente(
      join(pastaPadrao, 'semanais'),
      join(pastaPadrao, 'mensais'),
      LIMITES_FIFO['mensais']
    )
    arquivosDeletados += res.deletados
    if (res.promovido) {
      arquivosPromovidos++
      novaDataPromocaoMensal = agora
    }
  }

  // 2. Promoção semanal
  if (precisaPromocaoSemanal(opcoes.ultimaPromocaoSemanal, agora)) {
    const res = moverMaisRecente(
      join(pastaPadrao, 'diarios'),
      join(pastaPadrao, 'semanais'),
      LIMITES_FIFO['semanais']
    )
    arquivosDeletados += res.deletados
    if (res.promovido) {
      arquivosPromovidos++
      novaDataPromocaoSemanal = agora
    }
  }

  // 3. Rotação FIFO em todas as pastas + cálculo de tamanho total
  let tamanhoTotalBytes = 0

  for (const [subpasta, limite] of Object.entries(LIMITES_FIFO)) {
    const pasta = join(pastaPadrao, subpasta)
    const arquivos = listarArquivosBackup(pasta)

    tamanhoTotalBytes += arquivos.reduce((acc, f) => acc + f.tamanhoBytes, 0)

    for (const arquivo of arquivosParaDeletar(arquivos, limite)) {
      try {
        unlinkSync(arquivo.caminho)
        arquivosDeletados++
      } catch {
        // não travar o app por falha de deleção
      }
    }
  }

  const tamanhoTotalMB = Math.round((tamanhoTotalBytes / (1024 * 1024)) * 10) / 10

  return {
    arquivosDeletados,
    arquivosPromovidos,
    tamanhoTotalMB,
    alertaTamanho: tamanhoTotalBytes > ALERTA_TAMANHO_BYTES,
    novaDataPromocaoSemanal,
    novaDataPromocaoMensal,
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function domingoMaisRecente(data: Date): Date {
  const diaSemana = data.getDay() // 0 = domingo
  const domingo = new Date(data)
  domingo.setDate(data.getDate() - diaSemana)
  domingo.setHours(0, 0, 0, 0)
  return domingo
}

function moverMaisRecente(
  pastaOrigem: string,
  pastaDestino: string,
  limiteDestino: number
): { promovido: boolean; deletados: number } {
  const arquivosOrigem = listarArquivosBackup(pastaOrigem)
  if (arquivosOrigem.length === 0) return { promovido: false, deletados: 0 }

  let deletados = 0

  // Abre espaço no destino antes de adicionar o novo arquivo
  const arquivosDestino = listarArquivosBackup(pastaDestino)
  for (const arquivo of arquivosParaDeletar(arquivosDestino, limiteDestino - 1)) {
    try {
      unlinkSync(arquivo.caminho)
      deletados++
    } catch {
      // não travar
    }
  }

  // Move o arquivo mais recente da origem para o destino
  const maisRecente = arquivosOrigem[arquivosOrigem.length - 1]
  try {
    renameSync(maisRecente.caminho, join(pastaDestino, basename(maisRecente.caminho)))
    return { promovido: true, deletados }
  } catch {
    return { promovido: false, deletados }
  }
}

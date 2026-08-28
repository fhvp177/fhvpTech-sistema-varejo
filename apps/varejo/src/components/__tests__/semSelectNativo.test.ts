/**
 * Nenhum `<select>` nativo na interface.
 *
 * ── Por que a regra existe ──────────────────────────────────────────────────
 * O `<select>` do navegador aceita CSS no campo FECHADO, e por isso ele parecia
 * resolvido: a caixinha tinha a nossa borda, a nossa altura e o nosso anel de
 * foco. Mas a LISTA ABERTA é desenhada pelo sistema operacional, fora do
 * documento — nenhuma regra de CSS a alcança. No Windows ela aparecia com a
 * barra azul e a fonte do sistema, no meio de telas que não se parecem com isso
 * em lugar nenhum. O usuário viu, em quatro telas diferentes, no mesmo dia.
 *
 * ── Por que um teste, e não só combinar ─────────────────────────────────────
 * `<select>` é o caminho mais curto quando alguém precisa de uma lista: são três
 * linhas e funciona. Ninguém escolhe o nativo por discordar da regra — escolhe
 * por não lembrar dela às 23h de uma sexta. Este teste lembra.
 *
 * O substituto é `Select` de `@fhvptech/core/ui/select`, que desenha a lista e
 * mantém o teclado inteiro (setas, Enter, Esc, Home/End e busca por digitação).
 *
 * ⚠️ Se algum dia um `<select>` nativo for mesmo a escolha certa em algum ponto,
 * a saída NÃO é apagar este teste: é acrescentar o arquivo em `EXCECOES` com o
 * motivo escrito ao lado. Assim a exceção fica visível para quem vier depois.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(__dirname, '..', '..')

/** Arquivo → motivo pelo qual o nativo continua ali. Vazio hoje, e é o certo. */
const EXCECOES: Record<string, string> = {}

function arquivosTsx(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosTsx(caminho))
    } else if (nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('interface sem <select> nativo', () => {
  const arquivos = arquivosTsx(RAIZ_SRC)

  it('varreu a pasta src (se isto falhar, o resto vira teatro)', () => {
    expect(arquivos.length).toBeGreaterThan(20)
  })

  it('nenhuma tela usa <select> — a lista aberta dele é do Windows, não nossa', () => {
    const culpados = arquivos
      .filter((caminho) => {
        const rel = caminho.replace(RAIZ_SRC, 'src')
        if (EXCECOES[rel]) return false
        // `<select` seguido de espaço ou quebra: pega o elemento, não palavras
        // como "selecting" nem a classe utilitária `select-none`.
        return /<select[\s>]/.test(readFileSync(caminho, 'utf8'))
      })
      .map((c) => c.replace(RAIZ_SRC, 'src'))

    expect(culpados).toEqual([])
  })
})

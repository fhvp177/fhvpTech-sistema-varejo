/**
 * Todo hook do React que a tela usa está IMPORTADO.
 *
 * ── O acidente que trouxe este arquivo (2026-09-04) ──────────────────────────
 * Ao limpar imports que tinham deixado de ser usados, o `useCallback` saiu da
 * lista do `Dashboard.tsx` — e continuava sendo chamado uma vez, lá pelo meio
 * do arquivo. O resultado no aparelho do lojista foi **tela branca**: o React
 * derruba a árvore inteira quando um componente joga durante o render, e não
 * sobra nem a barra de navegação para explicar o que houve.
 *
 * ── Por que o typecheck não pegou ────────────────────────────────────────────
 * ⚠️ Pegaria. O que falhou foi o comando: o `tsconfig.json` da raiz deste app
 * tem `"files": []` e só aponta para os dois projetos filhos, então
 * `tsc --noEmit -p tsconfig.json` conclui em silêncio sem conferir arquivo
 * nenhum — e parece aprovação. O comando certo é `npm run typecheck`.
 *
 * Este teste existe porque o mesmo engano vai acontecer de novo, e uma tela
 * branca é caro demais para depender de alguém lembrar da flag certa. Ele roda
 * junto com o resto da suíte, sem depender de como o typecheck foi invocado.
 *
 * ── O que ele NÃO faz ────────────────────────────────────────────────────────
 * Não confere hook próprio (`useEhCelular` e afins): esses o empacotador
 * resolve como qualquer outro import, e um nome faltando ali quebra o build,
 * que é barulho suficiente. A lista abaixo é só a dos hooks do React, que são
 * os que somem em silêncio quando alguém "limpa" a linha do import.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', '..')

const HOOKS_DO_REACT = [
  'useState',
  'useEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useContext',
  'useReducer',
  'useLayoutEffect',
  'useImperativeHandle',
  'useId',
  'useTransition',
  'useDeferredValue',
  'useSyncExternalStore'
]

function arquivosTsx(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosTsx(caminho))
    } else if (nome.endsWith('.tsx') || nome.endsWith('.ts')) {
      achados.push(caminho)
    }
  }
  return achados
}

/**
 * O fonte sem comentário e sem texto de string.
 *
 * ⚠️ Um comentário que MENCIONA `useCallback(` contaria como uso, e um texto
 * de ajuda que fala do hook, também. O que interessa é chamada de verdade.
 */
function soCodigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

describe('hook usado é hook importado', () => {
  it('★ nenhuma tela chama um hook do React que não está no import', () => {
    const faltando: string[] = []

    for (const caminho of arquivosTsx(SRC)) {
      const bruto = readFileSync(caminho, 'utf8')
      const codigo = soCodigo(bruto)
      // A linha do import fica no bruto de propósito: é dela que sai a prova.
      const importaDoReact = bruto.match(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'react'/)
      const importados = new Set(
        (importaDoReact?.[1] ?? '')
          .split(',')
          .map((p) => p.trim().split(/\s+as\s+/)[0].trim())
      )
      const usaNamespace = /\bReact\s*\./.test(codigo) && /import\s+\*\s+as\s+React/.test(bruto)

      for (const hook of HOOKS_DO_REACT) {
        const chamado = new RegExp(`(?<!\\.)\\b${hook}\\s*[(<]`).test(codigo)
        if (!chamado) continue
        if (importados.has(hook)) continue
        if (usaNamespace) continue
        faltando.push(`${relative(SRC, caminho)}: usa ${hook} sem importar`)
      }
    }

    expect(faltando, 'hook chamado sem import derruba a tela inteira em branco').toEqual([])
  })
})

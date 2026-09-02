/**
 * O `window.api` do navegador tem que cobrir o do app instalado — inteiro.
 *
 * São duas implementações do MESMO objeto: o `preload.ts` escreve os 159
 * métodos um a um; o `web/api.ts` deriva todos de uma regra. As telas usam o
 * objeto sem saber qual das duas está embaixo.
 *
 * ── O que dá errado sem este teste ───────────────────────────────────────────
 * Alguém adiciona `api.vendas.reimprimirSegundaVia()` no preload e registra o
 * canal `vendas:reimprimir2via`. No app instalado funciona. No tablet, a regra
 * deriva `vendas:reimprimirSegundaVia`, que não existe, e a tela mostra
 * "O canal não existe" no meio de uma venda.
 *
 * Ninguém descobre isso escrevendo o método — descobre o lojista, no balcão.
 * Este teste move a descoberta para o momento em que a linha é escrita.
 *
 * ── Por que ler o fonte do preload ───────────────────────────────────────────
 * Importar o preload arrastaria o Electron, que não carrega no runtime dos
 * testes. E a pergunta aqui é sobre o que está ESCRITO nele, que é exatamente o
 * que o arquivo responde.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { canalDe, criarApiWeb, EVENTOS_SEM_FONTE, EXCECOES } from '../api'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PRELOAD = readFileSync(join(AQUI, '..', '..', '..', 'electron', 'preload.ts'), 'utf8')

interface Metodo {
  grupo: string
  metodo: string
  /** Canal invocado, ou `null` quando o método é uma inscrição em evento. */
  canal: string | null
}

/**
 * Percorre o preload guardando em que grupo e em que método está, e associa
 * cada `ipcRenderer.invoke`/`.on` ao método que o contém.
 *
 * Grupo é uma chave com 2 espaços de recuo (`  produtos: {`); método tem 4
 * (`    listar: (...`). É a formatação que o Prettier mantém no repositório, e
 * a primeira asserção reprova alto se ela mudar.
 */
function metodosDoPreload(): Metodo[] {
  const achados: Metodo[] = []
  let grupo: string | null = null
  let metodo: string | null = null
  let jaTemCanal = false

  for (const linha of PRELOAD.split('\n')) {
    const abreGrupo = linha.match(/^ {2}(\w+): \{\s*$/)
    if (abreGrupo) {
      grupo = abreGrupo[1]
      metodo = null
      continue
    }
    if (/^ {2}\}/.test(linha)) grupo = null

    const abreMetodo = linha.match(/^ {4}(\w+):\s*\(/)
    if (abreMetodo && grupo) {
      metodo = abreMetodo[1]
      jaTemCanal = false
    }

    if (!grupo || !metodo || jaTemCanal) continue

    const invoca = linha.match(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/)
    if (invoca) {
      achados.push({ grupo, metodo, canal: invoca[1] })
      jaTemCanal = true
      continue
    }
    if (/ipcRenderer\.on\(/.test(linha)) {
      achados.push({ grupo, metodo, canal: null })
      jaTemCanal = true
    }
  }
  return achados
}

const METODOS = metodosDoPreload()

describe('o api do navegador cobre o do app instalado', () => {
  it('acha os métodos do preload (se não, o resto não prova nada)', () => {
    expect(METODOS.length).toBeGreaterThan(150)
    // Uma amostra conhecida, para o dia em que a extração quebrar em silêncio.
    expect(METODOS).toContainEqual({ grupo: 'produtos', metodo: 'listar', canal: 'produtos:listar' })
  })

  it('a regra deriva o canal certo para TODO método', () => {
    const errados = METODOS.filter((m) => m.canal !== null).filter(
      (m) => canalDe(m.grupo, m.metodo) !== m.canal
    )

    expect(
      errados.map((m) => `api.${m.grupo}.${m.metodo}() deveria chamar "${m.canal}"`),
      'Método novo cujo canal não segue "grupo:metodo". Some com a diferença, ' +
        'ou registre em EXCECOES no web/api.ts.'
    ).toEqual([])
  })

  it('toda inscrição em evento está declarada como sem fonte na web', () => {
    const eventos = METODOS.filter((m) => m.canal === null).map((m) => `${m.grupo}.${m.metodo}`)

    expect(eventos.length, 'nenhuma inscrição encontrada — a extração quebrou?').toBeGreaterThan(0)
    for (const e of eventos) {
      expect(
        EVENTOS_SEM_FONTE.has(e),
        `${e} avisa a tela de algo. No navegador ninguém dispara esse aviso: ` +
          'ou o servidor passa a mandar o evento, ou declare em EVENTOS_SEM_FONTE.'
      ).toBe(true)
    }
  })

  it('não sobra exceção que o preload não tem mais', () => {
    const caminhos = new Set(METODOS.map((m) => `${m.grupo}.${m.metodo}`))
    for (const chave of Object.keys(EXCECOES)) {
      expect(caminhos.has(chave), `${chave} está em EXCECOES mas sumiu do preload`).toBe(true)
    }
    for (const e of EVENTOS_SEM_FONTE) {
      expect(caminhos.has(e), `${e} está em EVENTOS_SEM_FONTE mas sumiu do preload`).toBe(true)
    }
  })

  it('o objeto entrega função para qualquer método, e inscrição devolve cancelador', () => {
    const api = criarApiWeb() as Record<string, Record<string, (...a: unknown[]) => unknown>>

    expect(typeof api.produtos.listar).toBe('function')
    expect(typeof api.comissoes.resumo).toBe('function')
    // Inscrição: chamar devolve a função de cancelar, que a tela usa na saída.
    expect(typeof api.backup.onNotificacao(() => {})).toBe('function')
  })

  it('o objeto não se passa por promessa', () => {
    // Um Proxy que devolve função para TUDO faria `await api` travar para
    // sempre, porque o JavaScript veria um `.then` e ficaria esperando.
    const api = criarApiWeb() as Record<string, unknown>
    expect(api.then).toBeUndefined()
  })
})

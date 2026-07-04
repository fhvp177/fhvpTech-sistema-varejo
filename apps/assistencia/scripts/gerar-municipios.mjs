// Gera src/data/municipiosBR.json a partir da API pública do IBGE.
// Roda UMA vez (e sempre que quiser atualizar a lista, raríssimo):
//   node scripts/gerar-municipios.mjs
// A lista é estática: vai embutida no app, então o seletor de cidade/UF
// funciona 100% offline, sem chave de API e sem custo.

import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const DESTINO = join(RAIZ, 'src', 'data', 'municipiosBR.json')
const BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades'

async function buscarJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return r.json()
}

async function main() {
  console.log('Baixando estados...')
  const estadosRaw = await buscarJson(`${BASE}/estados?orderBy=nome`)
  const estados = estadosRaw.map((e) => ({ sigla: e.sigla, nome: e.nome }))

  const municipios = {}
  for (const { sigla } of estados) {
    const lista = await buscarJson(`${BASE}/estados/${sigla}/municipios`)
    municipios[sigla] = lista
      .map((m) => m.nome)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    console.log(`  ${sigla}: ${municipios[sigla].length} municípios`)
  }

  const total = Object.values(municipios).reduce((s, l) => s + l.length, 0)
  mkdirSync(dirname(DESTINO), { recursive: true })
  // Sem indentação: arquivo de dados, otimizado pra tamanho.
  writeFileSync(DESTINO, JSON.stringify({ estados, municipios }), 'utf-8')
  console.log(`\n✓ ${estados.length} estados, ${total} municípios → ${DESTINO}`)
}

main().catch((e) => {
  console.error('Falha ao gerar lista:', e.message)
  process.exit(1)
})

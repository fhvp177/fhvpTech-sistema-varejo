/**
 * O varejo não tem ramo. Nem em palavra, nem em desenho.
 *
 * ── Por que a regra existe ──────────────────────────────────────────────────
 * Este é um sistema de varejo GENÉRICO: a mesma instalação serve loja de
 * informática, ração, cimento e perfume. Toda vez que uma tela fala de um ramo
 * específico, o lojista dos outros ramos lê aquilo como "este sistema não é pra
 * mim" — e é uma frase que ele não esquece.
 *
 * A regra já foi cobrada. E em 11/09/2026 ela vazou de novo, por um caminho que
 * nenhum teste de texto pegaria: um **ícone de camiseta** marcava a categoria
 * que usa grade de tamanhos. Na loja de informática do cliente, o que aparecia
 * era uma camiseta ao lado de "Acessórios", "Brinquedos" e "Perfumes".
 *
 * Por isso este teste olha as duas coisas: a palavra E o desenho.
 *
 * ── Onde a palavra do ramo CONTINUA valendo ─────────────────────────────────
 * Em comentário e em nome de variável, quando o assunto é fiscal de verdade. O
 * capítulo 61/62 da NCM é vestuário e o 64 é calçado — isso é vocabulário da
 * SEFAZ, não escolha nossa, e `utils/nfe.ts` usa esses nomes com razão.
 *
 * Daí o teste varrer só o que o lojista LÊ: texto dentro de aspas, com os
 * comentários removidos antes.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(__dirname, '..', '..')

/**
 * Ícones que só fazem sentido num ramo.
 *
 * Lista curta de propósito: um ícone entra aqui quando alguém o usou para
 * dizer algo que vale para qualquer loja. A camiseta dizia "tem tamanho"; o
 * substituto é a régua, que mede qualquer coisa.
 *
 * ⚠️ `Footprints` NÃO entra, por mais que pareça calçado. Ele é o ícone do
 * "Tour pelas telas", onde as pegadas são os PASSOS do passeio guiado. Ele
 * chegou a ser incluído aqui e acusou uma tela inocente na primeira execução.
 * Guarda que grita à toa é guarda que alguém desliga.
 */
const ICONES_DE_RAMO = ['Shirt', 'Cat', 'Dog', 'Pizza', 'Beef']

/** Palavras de ramo, quando aparecem em texto que vai para a tela. */
const PALAVRAS_DE_RAMO = /\b(roupas?|vestu[áa]rio|camisas?|blusas?|cal[çc]ados?)\b/i

function arquivosFonte(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosFonte(caminho))
    } else if (nome.endsWith('.ts') || nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

/** Tira comentários de bloco e de linha, preservando `https://`. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Todo texto entre aspas simples, duplas ou crases. */
function literais(fonte: string): string[] {
  return fonte.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? []
}

describe('vocabulário e ícones sem ramo', () => {
  const arquivos = arquivosFonte(RAIZ_SRC)

  it('varreu a pasta src (se isto falhar, o resto vira teatro)', () => {
    expect(arquivos.length).toBeGreaterThan(20)
  })

  it('★ nenhum ícone de um ramo só — foi assim que a camiseta entrou', () => {
    const culpados: string[] = []
    for (const caminho of arquivos) {
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      for (const icone of ICONES_DE_RAMO) {
        // `<Shirt`, `Shirt,` ou `Shirt }` — o componente, não uma palavra
        // qualquer que por acaso comece igual.
        if (new RegExp(`(<|\\b)${icone}\\b\\s*[,}/\\s]`).test(fonte)) {
          culpados.push(`${caminho.slice(RAIZ_SRC.length + 1)} → ${icone}`)
        }
      }
    }
    expect(
      culpados,
      'Este ícone amarra a tela a um ramo. A grade de tamanhos usa Ruler (régua), ' +
        'que mede qualquer coisa.'
    ).toEqual([])
  })

  it('★ nenhuma palavra de ramo no texto que o lojista lê', () => {
    const culpados: string[] = []
    for (const caminho of arquivos) {
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      for (const texto of literais(fonte)) {
        if (PALAVRAS_DE_RAMO.test(texto)) {
          culpados.push(`${caminho.slice(RAIZ_SRC.length + 1)} → ${texto.slice(0, 70)}`)
        }
      }
    }
    expect(
      culpados,
      'Texto de tela não nomeia ramo. "Roupas têm grade de tamanhos" vira ' +
        '"quem vende por tamanho pode ligar a grade". Comentário e nome de ' +
        'variável seguem livres — o capítulo 61/62 da NCM é vestuário mesmo.'
    ).toEqual([])
  })
})

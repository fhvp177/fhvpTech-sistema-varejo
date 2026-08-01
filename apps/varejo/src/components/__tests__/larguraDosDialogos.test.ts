// Diálogo que vaza pra fora da própria caixa é um bug invisível: só aparece
// quando um cadastro real tem nome comprido, e aí já está na loja do cliente.
// Aconteceu na devolução da venda #57 — a tabela de itens saiu 109px pra fora
// do modal e foi pintada por cima da tela de trás.
//
// Estes testes olham o código-fonte em vez do DOM porque o defeito é de
// LAYOUT, e jsdom não calcula layout. A medição de verdade (Chromium, largura
// mínima em cada tela) está descrita no commit; aqui fica só o alarme de quem
// remover a proteção sem saber pra que ela servia.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const raiz = join(__dirname, '..', '..', '..', '..', '..')
const ler = (rel: string): string => readFileSync(join(raiz, rel), 'utf-8')

describe('DialogContent do core', () => {
  const fonte = ler('packages/core/src/ui/dialog.tsx')

  // As classes do DialogContent, e só dela. Dois cuidados aprendidos na marra:
  //   1. o arquivo tem vários componentes e todos usam `className={cn(`, então
  //      um regex solto no arquivo inteiro pega o do overlay;
  //   2. procurar a classe no texto do arquivo casa com o COMENTÁRIO que
  //      explica a classe — o teste passa mesmo depois de alguém apagá-la.
  const classes = (() => {
    const i = fonte.indexOf('const DialogContent')
    const j = fonte.indexOf('DialogContent.displayName')
    const bloco = fonte.slice(i, j > i ? j : undefined)
    // Pula os comentários: interessa a string literal dentro do cn().
    const semComentarios = bloco.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    return /className={cn\(\s*'([^']*)'/.exec(semComentarios)?.[1] ?? ''
  })()

  it('encontrou mesmo as classes do diálogo', () => {
    // Sem isto, qualquer um dos testes abaixo passa de graça quando o regex
    // deixa de casar — foi exatamente assim que a primeira versão destes
    // testes sobreviveu à mutação que devolvia o bug.
    expect(classes).toMatch(/\bgrid\b/)
    expect(classes).toMatch(/\bmax-w-lg\b/)
  })

  it('zera a largura mínima dos filhos', () => {
    // O diálogo é `grid`, e item de grid nasce com `min-width: auto` — que quer
    // dizer "não encolha abaixo do seu próprio conteúdo". Uma tabela larga
    // empurrava o filho além do `max-w-lg` em vez de o filho se ajustar.
    // Medido no Chromium: a tabela da devolução pedia 573px de mínimo dentro de
    // 462px úteis. Com esta regra, 364px — 100px de folga.
    expect(classes).toContain('[&>*]:min-w-0')
  })

  it('não corta o que passar da borda', () => {
    // A tentação é resolver com overflow hidden/auto no próprio diálogo. Não
    // dá: o seletor de cliente e outros combos abrem lista PRA FORA do diálogo
    // de propósito, e cortar isso trocaria um bug visual por outro.
    expect(classes).not.toMatch(/\boverflow-(hidden|x-auto|y-auto|auto)\b/)
  })
})

describe('tabela de itens da devolução', () => {
  const fonte = ler('apps/varejo/src/components/ModalDevolucao.tsx')

  it('não prende o nome do produto a uma largura fixa', () => {
    // `truncate max-w-[320px]` parece um teto, mas pra uma tabela ele vira
    // PISO: a coluna passa a exigir 320px, e era o que estourava o modal.
    // Além disso, truncar o nome numa devolução é ruim por si — o operador
    // precisa distinguir dois produtos de nome parecido.
    const celulaDoNome = /<div className="font-medium[^"]*"/.exec(fonte)?.[0] ?? ''
    expect(celulaDoNome).not.toMatch(/max-w-\[\d+px\]/)
    expect(celulaDoNome).not.toMatch(/\btruncate\b/)
  })

  it('mantém a tabela num contêiner que rola, e não que transborda', () => {
    // Rede de segurança pro dia em que as colunas crescerem de novo: rolar
    // dentro do modal é ruim, vazar pra fora dele é pior.
    expect(fonte).toMatch(/border rounded-lg overflow-x-auto/)
  })
})

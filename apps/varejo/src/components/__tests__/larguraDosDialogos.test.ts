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
import { readFileSync, readdirSync } from 'fs'
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

  it('tem TETO DE ALTURA — senão some o título em cima e os botões embaixo', () => {
    // O diálogo é centralizado por `translate-y-[-50%]`: sem teto, conteúdo
    // mais alto que a janela cresce pros dois lados e leva junto o cabeçalho e
    // o rodapé, que ficam inalcançáveis. Foi o que aconteceu ao abrir a seção
    // fiscal (NCM) dentro do cadastro de produto.
    expect(
      classes,
      'DialogContent sem max-h: um formulário comprido corta o título e os botões'
    ).toMatch(/max-h-\[\d+vh\]/)
  })

  it('ROLA quando o conteúdo passa do teto', () => {
    // Teto sem rolagem só troca "vaza pra fora" por "não dá pra ver o resto".
    expect(
      classes,
      'DialogContent com max-h e sem overflow-y-auto: o excedente fica inacessível'
    ).toMatch(/overflow-y-auto/)
  })

  it('não corta na horizontal', () => {
    // A rolagem é só vertical de propósito. Conteúdo largo se resolve com
    // `min-w-0` aqui + `overflow-x-auto` no próprio conteúdo (ver a tabela da
    // devolução, mais abaixo).
    expect(classes).not.toMatch(/overflow-(hidden|x-auto)/)
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

// ── A regra que SUSTENTA a rolagem do diálogo ───────────────────────────────
// Enquanto os combos desenhavam a lista como `absolute` DENTRO do diálogo, dar
// rolagem a ele as recortaria. E, por serem posicionadas, elas não entram no
// `scrollHeight` — nem rolando apareceriam. Foi por isso que a versão anterior
// deste arquivo PROIBIA overflow no diálogo. A proibição só pôde sair porque os
// combos passaram a desenhar em portal; se algum voltar atrás, o teto de altura
// vira um bug novo, e é isto que os testes abaixo vigiam.
describe('listas flutuantes (combos) desenham em PORTAL', () => {
  for (const nome of ['ClienteSeletor', 'CidadeSeletor']) {
    it(nome + ' usa createPortal, não position absolute', () => {
      const fonte = ler('apps/varejo/src/components/' + nome + '.tsx')
      expect(fonte, nome + ' precisa desenhar a lista em portal').toContain('createPortal')
      expect(
        fonte,
        nome + ' voltou a posicionar a lista com "absolute" — dentro de um ' +
          'diálogo com rolagem ela seria recortada e não apareceria nem rolando.'
      ).not.toMatch(/className="absolute z-\d/)
    })
  }

  it('nenhum combo novo passou despercebido', () => {
    // Varre a pasta atrás do padrão perigoso: lista sobreposta com `absolute`.
    // Componente novo que caia nisso reprova aqui, e não na tela do cliente.
    const dir = join(raiz, 'apps/varejo/src/components')
    const suspeitos = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf-8')
        return /className="absolute z-\d/.test(src) && /bg-popover/.test(src)
      })
    expect(
      suspeitos,
      'Estes componentes abrem lista sobreposta com "absolute". Dentro de um ' +
        'diálogo (que agora rola) ela é recortada. Use createPortal com a posição ' +
        'medida do container, como em ClienteSeletor.'
    ).toEqual([])
  })
})

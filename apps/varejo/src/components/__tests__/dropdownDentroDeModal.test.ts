/**
 * Dropdown que vive num portal em `document.body` PRECISA reativar o mouse.
 *
 * ── O defeito que isto prende (aconteceu, em 3 telas ao mesmo tempo) ────────
 * O diálogo modal do Radix, enquanto está aberto, põe `pointer-events: none` no
 * `<body>` e devolve `auto` só para o painel dele
 * (`@radix-ui/react-dismissable-layer/dist/index.js`, linhas 111 e 142). Isso é
 * o que impede o usuário de clicar no que está atrás do modal.
 *
 * Só que os nossos seletores com busca desenham a lista num PORTAL preso a
 * `document.body` — de propósito, porque dentro do `DialogContent` (que tem
 * `overflow-y-auto`) ela seria recortada. Aí a lista herda o `none` do body: ela
 * APARECE, o teclado seleciona normalmente com setas + Enter, e o **mouse
 * simplesmente atravessa**. Nada quebra, nada dá erro, e o defeito só aparece
 * pra quem clica — que é todo mundo.
 *
 * Junto vêm mais duas, e as três só funcionam juntas:
 *
 *  2. `pointerdown` — a mesma camada do Radix escuta no document e fecha o
 *     diálogo ao ver um clique "fora". Para ela, este portal É fora. Sem barrar
 *     a propagação, consertar o clique passaria a fechar o modal inteiro a cada
 *     opção escolhida.
 *
 *  3. `wheel` — o `react-remove-scroll`, que trava a rolagem da página enquanto
 *     o modal está aberto, escuta `wheel` no document (SideEffect.js:139, com
 *     passive:false) e chama preventDefault em tudo que julga estar fora do
 *     modal. A lista tem `overflow-y-auto` e PARECE que deveria rolar sozinha —
 *     mas o navegador nunca chega a rolar. Foi o terceiro a ser descoberto, e o
 *     mais fácil de não perceber: nada quebra, a lista só fica parada.
 *
 * ── Por que ler o FONTE e não simular o clique ──────────────────────────────
 * Em jsdom não existe hit-testing: `pointer-events` não é calculado e um
 * `fireEvent.click` acerta o elemento de qualquer jeito. Um teste de
 * comportamento passaria verde com o bug presente — foi exatamente por isso que
 * ele chegou até o usuário. A verificação que responde a pergunta certa aqui é
 * estrutural, como em `camposComMascara.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(__dirname, '..', '..')

/**
 * O core entra na varredura junto com o app.
 *
 * ⚠️ Ele ficou de fora na primeira versão deste guarda, e o buraco era grande:
 * `ui/select.tsx` é o componente por trás dos ~66 seletores dos dois apps — de
 * longe o que mais tem dropdown — e nenhuma das três regras era cobrada dele.
 * A falha só apareceu ao rodar mutação: apagar a regra da roda do mouse no core
 * deixava o teste VERDE. Guarda que não alcança o componente mais usado é
 * decoração.
 */
const RAIZ_CORE = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'src', 'ui')

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

/**
 * O CONTEÚDO de cada chamada a `createPortal`, e não o arquivo inteiro.
 *
 * A diferença importa: `EtiquetasA4.tsx` tem botões (`onClick`) na página e um
 * portal só de impressão, escondido e sem interação nenhuma. Olhando o arquivo
 * todo, os botões da página fariam o portal parecer interativo e o teste
 * cobraria dele algo que ele não precisa.
 *
 * O recorte vai do `createPortal(` até o parêntese que o FECHA, contando
 * profundidade. A primeira versão cortava no primeiro `document.body` que
 * aparecesse — e essa versão nascia furada, porque o comentário que explica o
 * problema dentro do próprio componente menciona "document.body" em prosa: o
 * bloco terminava ali, antes do código, e o teste passava verde com o bug
 * presente. Foi pego rodando as mutações contra o guarda.
 */
function conteudosDePortal(fonte: string): string[] {
  const blocos: string[] = []
  let i = fonte.indexOf('createPortal(')
  while (i !== -1) {
    let profundidade = 0
    let fim = -1
    for (let j = i + 'createPortal'.length; j < fonte.length; j++) {
      if (fonte[j] === '(') profundidade++
      else if (fonte[j] === ')') {
        profundidade--
        if (profundidade === 0) {
          fim = j
          break
        }
      }
    }
    if (fim !== -1) blocos.push(fonte.slice(i, fim))
    i = fonte.indexOf('createPortal(', i + 1)
  }
  return blocos
}

const portais = [...arquivosTsx(RAIZ_SRC), ...arquivosTsx(RAIZ_CORE)].flatMap((caminho) =>
  conteudosDePortal(readFileSync(caminho, 'utf8')).map((conteudo, n) => ({
    nome: `${caminho.replace(RAIZ_SRC, 'src').replace(RAIZ_CORE, 'core/ui')} (portal ${n + 1})`,
    conteudo
  }))
)

describe('dropdown em portal dentro de modal', () => {
  it('encontrou os portais (se isto falhar, o resto vira teatro)', () => {
    // 3 do app (ClienteSeletor, CidadeSeletor, EtiquetasA4) + o Select do core.
    expect(portais.length).toBeGreaterThanOrEqual(4)
  })

  it.each(portais.map((p) => [p.nome, p.conteudo]))(
    '%s reativa o mouse e não deixa o clique fechar o modal',
    (_nome, conteudo) => {
      // Portal sem interação (a folha escondida de impressão das etiquetas) não
      // precisa de nada disso: ninguém clica nele.
      if (!/onMouseDown|onClick|onPointerDown/.test(conteudo)) return

      expect(conteudo).toMatch(/pointerEvents:\s*'auto'/)
      expect(conteudo).toMatch(/onPointerDown=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/)
      expect(conteudo).toMatch(/onWheel=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/)
    }
  )
})

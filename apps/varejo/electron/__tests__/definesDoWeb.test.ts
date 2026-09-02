/**
 * As constantes de build da interface têm que ser as MESMAS nos dois destinos.
 *
 * A mesma tela é compilada duas vezes: para a janela do app instalado
 * (`electron.vite.config.ts`, bloco `renderer`) e para o navegador
 * (`vite.web.config.ts`). Cada build declara suas constantes em `define`, e o
 * bundler as substitui por literais.
 *
 * ── Por que uma constante faltando é pior que um erro ────────────────────────
 * `__FEAT_NFE__` ausente não quebra a compilação: vira `undefined`, cai num
 * `if` e a nota fiscal simplesmente não aparece na tela. Sem erro, sem log, sem
 * nada. O lojista abriria o sistema no tablet e diria "sumiu o botão da nota" —
 * e a busca começaria pela tela, que está certa, e não pelo arquivo de build,
 * que é onde o problema está.
 *
 * Este teste faz a divergência aparecer no lugar certo: na hora de mexer no
 * build, com o nome da constante que falta.
 *
 * ── E os segredos ────────────────────────────────────────────────────────────
 * O outro caso é o inverso e é grave: as chaves de licença são declaradas no
 * bundle do processo PRINCIPAL, que nunca sai da máquina. O bundle do navegador
 * é baixado por quem abrir o endereço. Uma dessas chaves cair no `define` do
 * web e ela vai junto, legível, para dentro do tablet de qualquer um.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const APP = join(AQUI, '..', '..')

const CONFIG_ELECTRON = readFileSync(join(APP, 'electron.vite.config.ts'), 'utf8')
const CONFIG_WEB = readFileSync(join(APP, 'vite.web.config.ts'), 'utf8')

/** Nomes no formato `__XXX__:` — a forma de toda constante de build daqui. */
function constantesDeclaradas(fonte: string): string[] {
  return [...fonte.matchAll(/(__[A-Z0-9_]+__)\s*:/g)].map((m) => m[1]).sort()
}

/**
 * Só o pedaço do `renderer` do config do Electron: o bloco `main` declara os
 * segredos de licença, que não têm nada a ver com a tela e não podem entrar na
 * comparação.
 */
function trechoRenderer(fonte: string): string {
  const i = fonte.indexOf('  renderer: {')
  expect(i, 'bloco renderer não encontrado em electron.vite.config.ts').toBeGreaterThan(-1)
  return fonte.slice(i)
}

describe('constantes de build da interface', () => {
  it('o navegador declara exatamente as mesmas do app instalado', () => {
    const naJanela = constantesDeclaradas(trechoRenderer(CONFIG_ELECTRON))
    const noNavegador = constantesDeclaradas(CONFIG_WEB)

    expect(naJanela.length, 'nenhuma constante encontrada — o padrão mudou?').toBeGreaterThan(5)
    expect(noNavegador).toEqual(naJanela)
  })

  it('nenhum segredo de licença vaza para o bundle do navegador', () => {
    for (const segredo of ['CHAVE_HMAC', 'CHAVE_AES', 'SALT_AES']) {
      expect(CONFIG_WEB.includes(segredo), `${segredo} apareceu no build do navegador`).toBe(false)
    }
  })

  it('os dois builds leem a mesma tabela de edições', () => {
    for (const [nome, fonte] of [
      ['electron.vite.config.ts', CONFIG_ELECTRON],
      ['vite.web.config.ts', CONFIG_WEB]
    ] as const) {
      expect(
        /from\s+['"]\.\/edicoes['"]/.test(fonte),
        `${nome} não importa ./edicoes — a tabela foi copiada de novo?`
      ).toBe(true)
    }
  })
})

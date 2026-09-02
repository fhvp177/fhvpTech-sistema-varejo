/**
 * A aba de Comissões tem que acompanhar quem está logado.
 *
 * ── O bug que este teste existe para não deixar voltar ──────────────────────
 * A aba só aparece para gerente, e quem decide isso é um estado no App. Na
 * primeira versão, esse estado era atualizado DENTRO do efeito de licença/auth
 * — que roda uma vez, quando o app abre.
 *
 * O problema: ao abrir o app ainda não existe sessão. Ela vive na memória do
 * processo principal e morre junto com o app, então toda reabertura começa sem
 * ninguém logado. O efeito rodava com `papel` indefinido, gravava `false`, e o
 * login logo depois não mexia mais nesse estado. Resultado: **a aba sumia toda
 * vez que o app era fechado** e só voltava quando alguém mexia no percentual
 * (que recarrega por outro caminho, o contexto).
 *
 * Nada disso dava erro. Nenhum teste ficava vermelho. O sintoma parecia
 * intermitente e "do nada" — o pior tipo de defeito para quem usa.
 *
 * ── Por que ler o fonte ─────────────────────────────────────────────────────
 * O conserto certo não foi acrescentar uma chamada no login: foi tornar o
 * estado DERIVADO da sessão, num efeito que depende do papel de quem está
 * logado. Assim qualquer caminho que troque de usuário — login, logout, elevar
 * privilégio, trocar de vendedor — acerta a aba de graça.
 *
 * O que precisa ser garantido, então, não é um valor: é a FORMA da ligação. Um
 * teste de comportamento só pegaria isso montando o App inteiro com IPC falso e
 * simulando um login — muita máquina para proteger uma linha, e ainda assim ele
 * não impediria alguém de voltar a atualizar o estado num efeito de mão única.
 *
 * Mesma escolha do canais.test.ts e do camposComMascara.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const APP = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8')

/** O trecho `useEffect(() => { … }, [deps])` que contém um certo texto. */
function efeitoQueContem(fonte: string, agulha: string): string | null {
  let i = fonte.indexOf('useEffect(')
  while (i !== -1) {
    // Fecha por contagem de parênteses para pegar o efeito inteiro, incluindo
    // o array de dependências.
    let prof = 0
    const abre = fonte.indexOf('(', i)
    for (let j = abre; j < fonte.length; j++) {
      if (fonte[j] === '(') prof++
      else if (fonte[j] === ')') {
        prof--
        if (prof === 0) {
          const bloco = fonte.slice(i, j + 1)
          if (bloco.includes(agulha)) return bloco
          break
        }
      }
    }
    i = fonte.indexOf('useEffect(', i + 1)
  }
  return null
}

describe('a aba de Comissões é derivada da sessão', () => {
  const efeito = efeitoQueContem(APP, 'recarregarComissoes')

  it('existe um efeito que atualiza o estado da aba', () => {
    // Se isto falhar, o resto vira teatro: as asserções abaixo passariam por
    // vacuidade sobre um efeito que não existe mais.
    expect(efeito).not.toBeNull()
  })

  it('★ e ele depende de quem está logado', () => {
    // A dependência é o conserto inteiro. Sem `vendedor` aqui, o estado volta a
    // ser calculado uma vez só — na abertura, quando ainda não há sessão — e a
    // aba some de novo a cada reabertura do app.
    const deps = /,\s*\[([^\]]*)\]\s*\)\s*$/.exec((efeito ?? '').trim())?.[1] ?? ''
    expect(deps).toMatch(/vendedor/)
  })

  it('e o papel usado é o da sessão, não um valor solto', () => {
    expect(efeito ?? '').toMatch(/recarregarComissoes\(\s*vendedor\?\.papel\s*\)/)
  })

  it('o efeito de licença/auth NÃO volta a mexer nisso', () => {
    // Era ali que o estado era gravado antes, e é para lá que a "correção"
    // instintiva tende a voltar. Dois donos do mesmo estado é como o bug nasce:
    // o de mão única sobrescreve o derivado dependendo da ordem.
    const efeitoAuth = efeitoQueContem(APP, 'recarregarSessao()')
    expect(efeitoAuth).not.toBeNull()
    expect(efeitoAuth ?? '').not.toMatch(/recarregarComissoes/)
  })
})

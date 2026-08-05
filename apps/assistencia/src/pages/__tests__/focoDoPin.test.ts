// O cursor tem que continuar no campo depois de uma tentativa errada — em TODA
// tela que pede senha/PIN. Sem isso, a pessoa erra, o campo esvazia, e ela
// precisa CLICAR de novo antes de redigitar.
//
// ── A sutileza que fazia isso falhar ─────────────────────────────────────────
// O código chamava `ref.current?.focus()` logo depois do `await`, junto com a
// mensagem de erro, e parecia resolvido. Não estava: o campo é `disabled`
// enquanto a verificação roda, e aquela linha executa ANTES de o React
// repintar — focar campo desabilitado é no-op. Quando ele reabilita, já não há
// ninguém pedindo o foco.
//
// A correção mora no hook `useFocoAoLiberar` do core, que reage ao campo VOLTAR
// a aceitar digitação. Estes testes vigiam que as telas continuem usando o
// hook: reintroduzir o `focus()` manual não quebra typecheck, não quebra build,
// e só quem erra a senha na loja percebe.
//
// ⚠️ São QUATRO telas com o mesmo problema, achadas na varredura de 2026-08-04:
// login, autorização do gerente, recuperação de PIN e cadastro de e-mail. A
// tela de senha de restauração NÃO entra: lá o campo nunca é desabilitado (só o
// botão), então o foco nunca se perdeu.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const raiz = join(__dirname, '..', '..', '..', '..', '..')
const ler = (rel: string): string => readFileSync(join(raiz, rel), 'utf-8')
const APP = 'apps/assistencia'

// Telas onde o campo é desabilitado durante uma verificação assíncrona.
const TELAS = [
  { arquivo: `${APP}/src/pages/LoginSistema.tsx`, nome: 'login' },
  { arquivo: `${APP}/src/components/ModalElevarPrivilegio.tsx`, nome: 'autorização do gerente' },
  { arquivo: `${APP}/src/components/ModalRecuperacaoPin.tsx`, nome: 'recuperação de PIN' },
  { arquivo: `${APP}/src/components/ModalCadastrarEmailDono.tsx`, nome: 'cadastro de e-mail' }
]

describe('o hook que devolve o foco', () => {
  const hook = ler('packages/core/src/lib/useFocoAoLiberar.ts')

  it('existe e reage ao campo deixar de estar bloqueado', () => {
    // Sentinela: sem isto, os testes abaixo passariam de graça se o arquivo
    // mudasse de lugar.
    expect(hook).toContain('export function useFocoAoLiberar')
    expect(hook).toContain('if (!ativo || bloqueado) return')
    expect(hook).toContain('ref.current?.focus()')
  })

  it('depende de `bloqueado` — é o que devolve o foco após o erro', () => {
    const deps = /\}, \[([^\]]*)\]/.exec(hook)?.[1] ?? ''
    expect(
      deps,
      'O hook não reage a `bloqueado`: o campo reabilita sem receber o cursor.'
    ).toContain('bloqueado')
  })
})

describe.each(TELAS)('foco na tela de $nome', ({ arquivo }) => {
  const fonte = ler(arquivo)

  it('usa o hook do core, e não um focus() próprio', () => {
    expect(
      fonte,
      'Esta tela desabilita o campo durante a verificação — precisa do ' +
        'useFocoAoLiberar, senão o cursor se perde depois de errar.'
    ).toContain('useFocoAoLiberar(')
  })

  it('não voltou a chamar focus() dentro do fluxo assíncrono', () => {
    // Um `focus()` depois do `await` é no-op (input ainda `disabled`). Se
    // alguém o trouxer de volta achando que resolve, o hook pode acabar
    // removido junto — e aí o bug volta.
    const depoisDoAwait = fonte
      .split('\n')
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /\.focus\(\)/.test(l) && !/setTimeout/.test(l))
      .filter(({ i }) => {
        // Só acusa focus() solto DENTRO de função async (o padrão do bug).
        // Focos em efeito de abertura e em setTimeout são legítimos.
        const antes = fonte.split('\n').slice(Math.max(0, i - 25), i).join('\n')
        return /await /.test(antes) && /async/.test(antes)
      })
    expect(
      depoisDoAwait.map(({ l }) => l.trim()),
      'focus() depois de um await: ali o campo ainda está disabled e a chamada ' +
        'não faz nada. Quem devolve o foco é o useFocoAoLiberar.'
    ).toEqual([])
  })
})

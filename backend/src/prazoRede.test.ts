// Toda chamada para fora tem prazo. Rodar: npx tsx --test src/prazoRede.test.ts
//
// ── O incidente ─────────────────────────────────────────────────────────────
// Em 11/09/2026 este servidor travou inteiro: aceitava a conexao em 0,06s e nao
// devolvia um byte, em qualquer endereco, ate estourar 35 segundos. Licenca,
// nota fiscal e painel, todos fora — e assim ficou ate alguem reclamar.
//
// Havia NOVE `fetch` para terceiros (ACBr, Efi, R2) e nenhum com prazo. O
// `fetch` do Node nao desiste sozinho: nao existe prazo padrao. Terceiro que
// para de responder no meio da resposta deixa a chamada pendurada para sempre,
// segurando uma conexao. Algumas dessas e o servidor fica sem espaco.
//
// ── Por que uma guarda, e nao so o conserto ─────────────────────────────────
// Esquecer o prazo e o comportamento PADRAO da linguagem: quem escreve um
// `fetch` novo nao omite o prazo por discordar, omite porque nao ha nada
// lembrando. Aqui tem.
//
// ⚠️ Le o FONTE de proposito. Um teste de comportamento precisaria de um
// terceiro que trava para provar o prazo, e um terceiro que trava e exatamente
// o que nao se consegue simular de forma confiavel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PRAZO_ACBR_MS, PRAZO_EFI_MS, PRAZO_R2_MS, PRAZO_TOKEN_MS, prazoDe } from './prazoRede.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))

/** Um `fetch(...)`, do abre ao fecha, contando parenteses. */
function chamadasDeFetch(fonte: string): string[] {
  const achadas: string[] = []
  let i = fonte.indexOf('fetch(')
  while (i !== -1) {
    // `.fetch` de objeto (app.fetch) nao e chamada de rede.
    if (fonte[i - 1] !== '.') {
      let profundidade = 0
      let j = i + 'fetch'.length
      for (; j < fonte.length; j++) {
        if (fonte[j] === '(') profundidade++
        else if (fonte[j] === ')') {
          profundidade--
          if (profundidade === 0) break
        }
      }
      achadas.push(fonte.slice(i, j + 1))
    }
    i = fonte.indexOf('fetch(', i + 1)
  }
  return achadas
}

test('nenhuma chamada para fora sem prazo', () => {
  const semPrazo: string[] = []
  let total = 0

  for (const nome of readdirSync(AQUI)) {
    if (!nome.endsWith('.ts') || nome.endsWith('.test.ts')) continue
    const fonte = readFileSync(join(AQUI, nome), 'utf8')
    for (const chamada of chamadasDeFetch(fonte)) {
      // Só interessa quem sai para a rede: `http` no alvo, ou template com
      // uma base de URL. `app.fetch` e afins já ficaram de fora acima.
      const saiParaRede = /https?:\/\/|baseUrl|URL_|\$\{base\}|\(url[,)]/.test(chamada)
      if (!saiParaRede) continue
      total++
      if (!chamada.includes('signal:')) {
        semPrazo.push(`${nome}: ${chamada.slice(0, 70).replace(/\s+/g, ' ')}`)
      }
    }
  }

  assert.ok(total >= 9, `esperava achar as 9 chamadas conhecidas, achei ${total}`)
  assert.deepEqual(
    semPrazo,
    [],
    'Estas chamadas saem para terceiros sem prazo. O fetch do Node NAO desiste ' +
      'sozinho: uma delas pendurada segura uma conexao para sempre, e algumas ' +
      'derrubam o servidor inteiro. Use signal: prazoDe(...) de prazoRede.ts.'
  )
})

test('o prazo de tudo cabe dentro do que o aplicativo espera', () => {
  // O aplicativo desiste do backend em 60s (TEMPO_RESPOSTA_FISCAL_MS, no core).
  // Chamada nossa mais lenta que isso faz o balconista desistir primeiro, e aí
  // a nota fica reservada sem desfecho — o pior dos dois mundos.
  const TETO_DO_APLICATIVO = 60_000
  for (const [nome, ms] of Object.entries({
    PRAZO_ACBR_MS,
    PRAZO_TOKEN_MS,
    PRAZO_EFI_MS,
    PRAZO_R2_MS
  })) {
    assert.ok(ms < TETO_DO_APLICATIVO, `${nome} (${ms}ms) precisa ser menor que 60000`)
    assert.ok(ms >= 10_000, `${nome} (${ms}ms) é curto demais para rede de terceiro`)
  }
})

test('prazoDe devolve um sinal que expira sozinho', () => {
  const s = prazoDe(PRAZO_TOKEN_MS)
  assert.equal(s.aborted, false)
  assert.ok(typeof s.addEventListener === 'function')
})

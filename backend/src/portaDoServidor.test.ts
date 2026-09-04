// Em que porta este backend sobe.
// node:test + node:assert (nativos). Rodar: npx tsx --test src/portaDoServidor.test.ts
//
// ── Por que um teste para isto ───────────────────────────────────────────────
// Em 2026-09-03 o site `kikopescados.fhvptech.com` passou DUAS vezes a
// responder "FHVP Tech — licenca API ok". Não era DNS, não era o Cloudflare, e
// não era sequer conflito de porta: o app daquele projeto ouve em 0.0.0.0:8080
// (IPv4) e este backend subia em [::]:8080 (IPv6). Ninguém dava erro, os dois
// ficavam no ar, e o túnel do Cloudflare, que resolve `localhost` preferindo
// IPv6, passava a entregar ESTE servidor aos visitantes do outro site.
//
// Um comentário não segura isso: o padrão vive numa linha só, longe de quem
// está mexendo, e voltar para 8080 parece inofensivo. Estes testes seguram.
//
// O segundo teste guarda o outro lado: a produção precisa DIZER a porta. Se o
// `PORT` sumir do fly.toml, o Fly volta a depender do padrão do código, e aí
// mudar o padrão (que é o conserto deste incidente) derrubaria o licenciamento
// de todas as lojas no deploy seguinte, sem aviso.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FONTE = readFileSync(join(AQUI, 'index.ts'), 'utf8')
const FLY = readFileSync(join(AQUI, '..', 'fly.toml'), 'utf8')

/**
 * Portas que pertencem a OUTROS projetos desta máquina, ou que qualquer
 * ferramenta pega sozinha. Nenhuma delas pode ser o padrão daqui.
 */
const PORTAS_DE_OUTROS = [8080, 3000, 5173, 5432, 4877]

test('★ o padrão local NÃO é uma porta de outro projeto', () => {
  const m = FONTE.match(/const PORTA_PADRAO_LOCAL = (\d+)/)
  assert.ok(m, 'sumiu a constante da porta local')
  const porta = Number(m[1])
  assert.equal(
    PORTAS_DE_OUTROS.includes(porta),
    false,
    `porta ${porta}: já derrubou o site de outro projeto duas vezes em 2026-09-03`
  )
  assert.ok(porta > 1023 && porta < 65536, 'porta fora da faixa utilizável')
})

test('o servidor lê a porta do ambiente antes do padrão', () => {
  // É o que deixa a produção mandar. Fixar o número aqui faria o Fly bater numa
  // porta e o processo ouvir em outra.
  assert.match(FONTE, /Number\(process\.env\.PORT \?\? PORTA_PADRAO_LOCAL\)/)
})

test('★ a produção DIZ a porta, em vez de herdar o padrão do código', () => {
  const noEnv = FLY.match(/^\s*PORT = "(\d+)"/m)
  assert.ok(noEnv, 'o fly.toml deixou de declarar PORT — a produção voltou a depender do padrão')
  const interno = FLY.match(/internal_port = (\d+)/)
  assert.ok(interno, 'sumiu o internal_port do fly.toml')
  assert.equal(
    noEnv[1],
    interno[1],
    'PORT e internal_port divergiram: o Fly bate numa porta e o processo ouve em outra'
  )
})

// A chave do token guardado. Parece detalhe, mas foi ela que segurou dois
// recursos prontos sem ninguém entender por quê.
//
// A ACBr não deixa EDITAR credencial: para mudar permissões, cria-se uma nova.
// Enquanto a chave do cache era só o ambiente, trocar a credencial não trocava
// o token — o antigo continuava válido pelo relógio por até 30 dias, e o
// sistema seguia usando as permissões velhas. O sintoma era um 403 mudo.
//
// Rodar: npx tsx --test src/acbr.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chaveToken } from './acbr.ts'

const BASE = 'https://prod.acbr.api.br'
const CREDENCIAL_ANTIGA = 'varejo-prod-84Nvabcdefgh'
const CREDENCIAL_NOVA = 'assistencia-prod-99Zzabcdefgh'

test('a mesma credencial no mesmo ambiente reusa o token', () => {
  // Sem isto o backend pediria token a cada chamada e estouraria o limite de
  // 4 pedidos por hora na quinta venda.
  assert.equal(chaveToken(BASE, CREDENCIAL_ANTIGA), chaveToken(BASE, CREDENCIAL_ANTIGA))
})

test('trocar a credencial invalida o token guardado', () => {
  // O ponto do arquivo. Se estas duas chaves fossem iguais, dar uma permissão
  // nova no console não teria efeito nenhum até o token vencer sozinho.
  assert.notEqual(chaveToken(BASE, CREDENCIAL_ANTIGA), chaveToken(BASE, CREDENCIAL_NOVA))
})

test('ambientes diferentes não compartilham token', () => {
  // O token vem carimbado com a audiência do host: usar o de sandbox contra
  // produção devolve 401 "Audience [aud] claim", que não parece erro de
  // ambiente nenhum.
  const hom = chaveToken('https://hom.acbr.api.br', CREDENCIAL_ANTIGA)
  assert.notEqual(hom, chaveToken(BASE, CREDENCIAL_ANTIGA))
})

test('a credencial não fica legível na chave', () => {
  // A chave é gravada no banco. Guardar o client_id em claro ali espalharia a
  // credencial para todo backup do volume.
  const chave = chaveToken(BASE, CREDENCIAL_ANTIGA)
  assert.ok(!chave.includes(CREDENCIAL_ANTIGA))
  assert.ok(chave.startsWith(BASE + '#'))
})

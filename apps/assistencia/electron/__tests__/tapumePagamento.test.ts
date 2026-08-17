/**
 * O tapume de obra da maquininha integrada.
 *
 * ── Por que isto é um teste, e não só um comentário ──────────────────────────
 * A feature de pagamento na maquininha está EM CONSTRUÇÃO. Enquanto não estiver
 * pronta, nenhum lojista pode topar com ela: metade de um fluxo de cobrança é
 * pior que fluxo nenhum, porque envolve dinheiro do cliente na maquininha.
 *
 * O risco real não é alguém ligar a flag de propósito — é ligar SEM PERCEBER.
 * `__FEAT_PAGAMENTO__` mora ao lado de seis flags comerciais que são `true` na
 * edição 'pro', e a edição padrão do build É a 'pro'. Copiar a linha de cima ao
 * acrescentar uma feature nova é o erro mais fácil do mundo aqui, e ele sairia
 * silencioso: o build passa, o instalador gera, e a obra vai pro balcão.
 *
 * ⚠️ QUANDO A FEATURE FICAR PRONTA, ESTE ARQUIVO INTEIRO É PRA SER APAGADO —
 * junto com a flag `pagamento`, deixando o gate só na `tef`, que é a flag
 * comercial de verdade. Se você chegou aqui porque este teste ficou vermelho e
 * a feature ESTÁ pronta, apagar é a resposta certa. Se ela não está, o vermelho
 * acabou de evitar um vazamento pro cliente.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const config = readFileSync(join(__dirname, '..', '..', 'electron.vite.config.ts'), 'utf-8')

describe('tapume da maquininha integrada', () => {
  it('a flag pagamento está desligada em TODAS as edições', () => {
    const ligadas = [...config.matchAll(/pagamento:\s*(true|false)/g)]
      .map((m) => m[1])
      .filter((v) => v === 'true')

    expect(
      ligadas,
      'A feature de pagamento na maquininha foi LIGADA numa edição. Se ela já ' +
        'está pronta, apague este arquivo e a flag `pagamento` (o gate passa a ' +
        'ser só `tef`). Se não está, desligue de volta antes de empacotar.'
    ).toEqual([])
  })

  it('a flag existe nas duas edições — não some por descuido', () => {
    // Se a chave sumisse, `FEATURES.pagamento` viraria undefined, o define
    // injetaria `undefined` e o `if (__FEAT_PAGAMENTO__)` continuaria falso por
    // acidente. Funcionaria hoje e quebraria no dia de ligar a feature.
    const ocorrencias = [...config.matchAll(/pagamento:\s*(?:true|false)/g)]

    expect(ocorrencias.length, 'esperado uma entrada por edição (basico e pro)').toBe(2)
  })

  it('o processo principal também recebe a flag', () => {
    // Sem isso, os canais IPC de pagamento se registrariam mesmo com a feature
    // desligada — a tela some, mas o caminho continua alcançável.
    const trechoMain = config.slice(0, config.indexOf('renderer:'))

    expect(trechoMain).toContain('__FEAT_PAGAMENTO__')
  })
})

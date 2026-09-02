import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // ── Por que 30 segundos, e não os 5 padrão ──────────────────────────────
    // Boa parte desta suíte encosta no disco de verdade: migração da pasta de
    // dados, diário de quedas, backup, banco em arquivo temporário. Não é
    // desleixo — é o que esses testes existem para provar, e trocar por um
    // sistema de arquivos falso deixaria de cobrir justamente o que quebra na
    // máquina do lojista.
    //
    // Rodando dezenas de arquivos em paralelo no Windows, com o antivírus
    // inspecionando cada arquivo temporário, uma operação que leva milissegundos
    // sozinha passa a levar segundos. Já apareceu duas vezes, em testes
    // diferentes, sempre como "Test timed out in 5000ms" — nunca como asserção
    // errada.
    //
    // O tempo maior não enfraquece nada: teste travado continua reprovando,
    // só que depois de esperar o suficiente para ninguém confundir lentidão
    // com defeito.
    testTimeout: 30_000,

    include: ['electron/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
  },
})

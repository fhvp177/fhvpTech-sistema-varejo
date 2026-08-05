/**
 * Tipos do multi-caixa usados pela interface.
 *
 * Ficam AQUI, e não em `electron.d.ts`, por um motivo de TypeScript que morde
 * feio: aquele arquivo não tem nenhum `export` de propósito — é um script de
 * declarações globais, e é assim que `window.api`, `__APP_VERSION__` e as flags
 * de build ficam visíveis no projeto inteiro. Bastaria um `export` lá para ele
 * virar módulo e todas essas globais sumirem de uma vez.
 *
 * O `electron.d.ts` referencia estes tipos com `import('./multicaixa')`, que é
 * a forma que não transforma o arquivo em módulo.
 */

export interface TerminalPareadoUI {
  id: string
  nome: string
  criadoEm: string
  ultimoAcessoEm: string | null
}

export interface EstadoMulticaixa {
  modo: 'normal' | 'servidor' | 'terminal'
  /** O que o lojista pediu (`modo`) pode divergir do que está no ar. */
  servidorNoAr: boolean
  /** Se este computador também atende caixas que estão fora da loja. */
  atendeForaDaLoja: boolean
  porta: number
  endereco: string | null
  firewall: 'liberado' | 'bloqueado' | 'indeterminado'
  /** Autoriza CONECTAR um caixa novo. */
  codigoPareamento: { codigo: string; expiraEm: number } | null
  /** Autoriza COPIAR o banco para outro computador. Códigos separados de propósito. */
  codigoCopia: { codigo: string; expiraEm: number } | null
  terminais: TerminalPareadoUI[]
  versao: string
}

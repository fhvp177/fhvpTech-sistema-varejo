// O @types/node do repo (v20) ainda não conhece o node:sqlite (nasceu no Node
// 22.5). Declaração mínima só com o que o teste de integração usa.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(caminho: string)
    exec(sql: string): void
    prepare(sql: string): {
      run(...args: unknown[]): unknown
      get(...args: unknown[]): unknown
      all(...args: unknown[]): unknown
    }
    close(): void
  }
}

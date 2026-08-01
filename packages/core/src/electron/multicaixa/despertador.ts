/**
 * Impede o PC de dormir enquanto ele é o caixa principal.
 *
 * ── Por que isso é problema de código, e não do lojista ──────────────────────
 * O Windows suspende a máquina ociosa por padrão. Suspender congela o processo
 * e derruba a rede: o segundo caixa, que pode estar a quilômetros dali, vê
 * "sem conexão" sem nenhuma pista do motivo. E o PC parece ligado — a luz está
 * acesa.
 *
 * Dá para pedir ao lojista que mude o plano de energia do Windows. Mas isso é
 * o tipo de instrução que se perde na primeira reinstalação, e o sintoma volta
 * meses depois como "o notebook parou de funcionar". Melhor o app avisar o
 * sistema por conta própria: enquanto eu servir o segundo caixa, não durma.
 *
 * `prevent-app-suspension` mantém o processador acordado mas **deixa a tela
 * apagar** — a economia de energia que importa continua valendo.
 *
 * ── O que isto NÃO resolve ───────────────────────────────────────────────────
 * - Alguém escolher "Suspender" no menu iniciar. O bloqueio impede o sono
 *   automático, não a decisão de uma pessoa.
 * - O Windows Update reiniciar de madrugada. Depois do reboot o app não está
 *   aberto, e se o Windows pedir senha ele fica na tela de bloqueio.
 * - Falta de energia.
 *
 * Os três viram aviso no documento entregue ao cliente — não têm solução em
 * código, têm solução em combinado.
 */

/** Superfície mínima do `powerSaveBlocker` do Electron, para poder testar. */
export interface BloqueadorDeSono {
  start(tipo: 'prevent-app-suspension' | 'prevent-display-sleep'): number
  stop(id: number): void
  isStarted(id: number): boolean
}

export class Despertador {
  private id: number | null = null

  constructor(private readonly bloqueador: BloqueadorDeSono) {}

  /** Liga o bloqueio. Chamar duas vezes não acumula bloqueios pendurados. */
  ligar(): void {
    if (this.id !== null && this.bloqueador.isStarted(this.id)) return
    this.id = this.bloqueador.start('prevent-app-suspension')
  }

  /**
   * Desliga. Importante ao encerrar o modo servidor: deixar o bloqueio ativo
   * faria o PC de um lojista que desistiu do multi-caixa nunca mais dormir.
   */
  desligar(): void {
    if (this.id === null) return
    if (this.bloqueador.isStarted(this.id)) this.bloqueador.stop(this.id)
    this.id = null
  }

  ativo(): boolean {
    return this.id !== null && this.bloqueador.isStarted(this.id)
  }
}

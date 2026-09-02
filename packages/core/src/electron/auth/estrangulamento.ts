/**
 * Freia quem fica tentando adivinhar PIN ou código.
 *
 * ── Por que passou a ser necessário ──────────────────────────────────────────
 * No aplicativo instalado, errar o PIN à vontade nunca importou: para tentar, a
 * pessoa precisa estar de pé na frente do computador da loja. O balcão era o
 * limite de tentativas.
 *
 * Servido pelo navegador, esse limite some. O endereço é público, e o que
 * separa um estranho do caixa da loja passa a ser só o PIN — quatro dígitos em
 * muitas lojas, dez mil combinações. Um script tenta todas em minutos.
 *
 * Pior é o código de recuperação: são seis dígitos, e acertá-lo REDEFINE o PIN.
 * Um milhão de combinações sem freio é questão de horas.
 *
 * ── Espera crescente, não bloqueio ───────────────────────────────────────────
 * A tentação é bloquear a conta depois de N erros. Num sistema de caixa isso é
 * ruim: qualquer um que saiba o endereço poderia trancar o gerente para fora da
 * própria loja, de propósito, no meio do movimento.
 *
 * Então a punição é ESPERA, e ela cresce. Quem errou de verdade digitando
 * espera alguns segundos; quem está varrendo o espaço de senhas leva anos.
 * A conta nunca fica trancada para sempre.
 *
 *   erros 1–3  → nenhuma espera (dedo trocado acontece)
 *   4º         → 5 segundos
 *   5º         → 15 segundos
 *   6º         → 1 minuto
 *   7º e além  → 5 minutos
 *
 * Com isso, 10 mil PINs levam mais de um mês de tentativas ininterruptas.
 *
 * ── Recusar, nunca dormir ────────────────────────────────────────────────────
 * A espera é aplicada RECUSANDO a chamada na hora, e não segurando-a. Segurar
 * pareceria mais elegante, e seria um convite: bastaria abrir mil chamadas
 * presas para esgotar o servidor da loja, que atende um processo só. Recusar
 * responde na hora e não guarda nada.
 */

/** O que se sabe sobre quem está tentando. */
export interface Tentativas {
  falhas: number
  /** Quando foi a última falha, em milissegundos. */
  ultima: number
}

/** Quantos erros passam sem castigo. */
export const ERROS_LIVRES = 3

/** Espera depois de cada erro além dos livres. O último valor vale daí em diante. */
export const ESPERAS_MS = [5_000, 15_000, 60_000, 300_000]

/** Sem novas tentativas por este tempo, a contagem zera sozinha. */
export const ESQUECER_APOS_MS = 30 * 60_000

/**
 * Quanto falta esperar, em milissegundos. Zero significa "pode tentar".
 *
 * A contagem some depois de um tempo parada: quem errou três vezes hoje de
 * manhã não deve começar o dia seguinte já castigado.
 */
export function esperaRestante(t: Tentativas | undefined, agora: number): number {
  if (!t || t.falhas <= ERROS_LIVRES) return 0
  if (agora - t.ultima >= ESQUECER_APOS_MS) return 0

  const passo = Math.min(t.falhas - ERROS_LIVRES, ESPERAS_MS.length) - 1
  const restante = t.ultima + ESPERAS_MS[passo] - agora
  return restante > 0 ? restante : 0
}

/** Contabiliza mais um erro. A contagem recomeça se ficou muito tempo parada. */
export function aposFalha(t: Tentativas | undefined, agora: number): Tentativas {
  const esquecida = !t || agora - t.ultima >= ESQUECER_APOS_MS
  return { falhas: esquecida ? 1 : t.falhas + 1, ultima: agora }
}

/** Frase para a tela. Segundos inteiros, arredondados para cima. */
export function mensagemDeEspera(restanteMs: number): string {
  const seg = Math.ceil(restanteMs / 1000)
  if (seg <= 60) {
    return `Muitas tentativas erradas. Aguarde ${seg} segundo${seg === 1 ? '' : 's'} e tente de novo.`
  }
  const min = Math.ceil(seg / 60)
  return `Muitas tentativas erradas. Aguarde ${min} minuto${min === 1 ? '' : 's'} e tente de novo.`
}

/**
 * O freio com memória. Uma instância por app; a chave separa o que é
 * independente — cada vendedor tem a sua contagem, e o código de recuperação de
 * um e-mail não castiga o login de ninguém.
 *
 * Vive em memória: reiniciar o servidor esquece tudo. Aceitável, porque quem
 * está tentando adivinhar não consegue provocar reinício.
 */
export class Estrangulador {
  private readonly porChave = new Map<string, Tentativas>()

  /** Milissegundos que faltam para esta chave poder tentar. Zero = liberado. */
  espera(chave: string, agora = Date.now()): number {
    return esperaRestante(this.porChave.get(chave), agora)
  }

  falhou(chave: string, agora = Date.now()): void {
    this.porChave.set(chave, aposFalha(this.porChave.get(chave), agora))
    this.limpar(agora)
  }

  /** Acertou: a contagem zera. */
  acertou(chave: string): void {
    this.porChave.delete(chave)
  }

  /**
   * Joga fora contagens velhas. Sem isto, um ataque com e-mails inventados
   * encheria o mapa até o processo ficar sem memória — trocando um problema de
   * segurança por outro.
   */
  private limpar(agora: number): void {
    for (const [chave, t] of this.porChave) {
      if (agora - t.ultima >= ESQUECER_APOS_MS) this.porChave.delete(chave)
    }
  }

  /** Só para teste. */
  esquecerTudo(): void {
    this.porChave.clear()
  }
}

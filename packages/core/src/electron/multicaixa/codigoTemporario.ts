/**
 * Código curto de uso único, com cerco.
 *
 * Duas operações do multi-caixa precisam autorizar uma máquina que ainda não
 * tem credencial nenhuma: conectar um caixa adicional e clonar o banco. Nos
 * dois casos o segredo tem que ser curto, porque quem digita é gente — 6
 * dígitos, como o de uma Smart TV.
 *
 * Seis dígitos são um milhão de combinações: muito para uma pessoa, pouquíssimo
 * para um computador na mesma rede tentando milhares por segundo. Então o código
 * sozinho não protege nada. O que protege é o cerco:
 *
 * - **Só existe quando o lojista pede.** Fora da janela não há código, e
 *   nenhuma tentativa passa. A porta não fica entreaberta.
 * - **Morre em 5 minutos.**
 * - **Serve uma vez só.**
 * - **Morre em 5 tentativas erradas** — este é o item que fecha a força bruta:
 *   são 5 chances em um milhão, não um milhão de chances. E o lojista percebe,
 *   porque precisa gerar outro.
 * - **Conferência em tempo constante**, para o tempo de resposta não entregar
 *   quantos dígitos já estão certos.
 *
 * ── O que NÃO protege ────────────────────────────────────────────────────────
 * Quem está de pé na frente da máquina lendo a tela consegue autorizar. É por
 * desenho, igual ao PIN: acesso ao balcão já é acesso.
 */
import { randomInt, timingSafeEqual } from 'node:crypto'

export const VALIDADE_CODIGO_MS = 5 * 60 * 1000
export const MAXIMO_TENTATIVAS = 5

export interface CodigoAtivo {
  codigo: string
  expiraEm: number
  tentativasRestantes: number
}

export type ResultadoConferencia = 'ok' | 'sem-codigo' | 'codigo-errado' | 'codigo-expirado'

/** Código de 6 dígitos por sorteio criptográfico — `Math.random` é previsível. */
function sortearCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function iguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export class CodigoDeUsoUnico {
  private estado: CodigoAtivo | null = null

  constructor(private readonly agora: () => number = Date.now) {}

  /**
   * Abre a janela e devolve o código para a tela. Uma por vez: pedir um novo
   * invalida o anterior, para não ficarem dois códigos válidos por aí.
   */
  abrir(): CodigoAtivo {
    this.estado = {
      codigo: sortearCodigo(),
      expiraEm: this.agora() + VALIDADE_CODIGO_MS,
      tentativasRestantes: MAXIMO_TENTATIVAS
    }
    return { ...this.estado }
  }

  fechar(): void {
    this.estado = null
  }

  /** Código em vigor, ou `null`. Expirado conta como inexistente. */
  ativo(): CodigoAtivo | null {
    if (!this.estado) return null
    if (this.agora() >= this.estado.expiraEm) {
      this.estado = null
      return null
    }
    return { ...this.estado }
  }

  /**
   * Confere uma tentativa. Em caso de acerto, encerra a janela — o código serve
   * uma vez só.
   */
  conferir(informado: string): ResultadoConferencia {
    const atual = this.ativo()
    if (!atual) return 'sem-codigo'

    if (!iguais(String(informado ?? ''), atual.codigo)) {
      this.estado!.tentativasRestantes -= 1
      if (this.estado!.tentativasRestantes <= 0) {
        this.fechar()
        return 'codigo-expirado'
      }
      return 'codigo-errado'
    }

    this.fechar()
    return 'ok'
  }
}

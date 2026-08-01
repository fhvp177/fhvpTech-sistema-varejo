/**
 * Pareamento de um caixa adicional.
 *
 * Todo o resto do multi-caixa é protegido por um token de 256 bits, impossível
 * de adivinhar. Mas a máquina nova não tem token nenhum quando chega: precisa
 * ganhar o primeiro. O segredo dessa etapa é curto porque quem digita é gente,
 * e todo o cerco que compensa isso vive em `codigoTemporario.ts` — que a
 * clonagem do banco também usa.
 *
 * Aqui fica só o que é específico do pareamento: transformar um código aceito
 * numa credencial permanente.
 */
import { randomBytes } from 'node:crypto'
import { CodigoDeUsoUnico, type CodigoAtivo } from './codigoTemporario'
import { gerarToken, hashDeToken } from './tokens'
import { gerarChaveSigilo } from './sigilo'

export { MAXIMO_TENTATIVAS, VALIDADE_CODIGO_MS, type CodigoAtivo } from './codigoTemporario'

export interface CredencialNova {
  /** Identidade do caixa — vira a `origem` de cada chamada dele. */
  id: string
  /** Token cru. Só existe aqui e na resposta; o PC guarda apenas o resumo. */
  token: string
  tokenHash: string
  /**
   * Chave do sigilo ponta a ponta.
   *
   * Combinada AQUI, no pareamento, que acontece na rede da loja — é o único
   * momento em que as duas máquinas se falam sem intermediário. Depois disso,
   * mesmo que o caixa vá para o outro lado do país, o servidor de encontro
   * encaminha bytes que não consegue abrir.
   */
  chaveSigilo: string
}

export type ResultadoPareamento =
  | { ok: true; credencial: CredencialNova }
  | { ok: false; motivo: 'sem-codigo' | 'codigo-errado' | 'codigo-expirado' }

/**
 * Identidade do caixa, sorteada.
 *
 * A primeira versão usava o relógio (`Date.now()`), e o teste pegou o problema:
 * dois pareamentos no mesmo milissegundo nasciam com o MESMO id. Como o id é a
 * `origem` que identifica quem está chamando, dois caixas iguais
 * compartilhariam a sessão — a venda de um sairia no nome do vendedor do outro,
 * que é exatamente o bug que a sessão por origem existe para impedir.
 */
function novoId(): string {
  return `terminal-${randomBytes(6).toString('hex')}`
}

export class JanelaPareamento {
  private readonly codigo: CodigoDeUsoUnico

  constructor(agora: () => number = Date.now) {
    this.codigo = new CodigoDeUsoUnico(agora)
  }

  /** O lojista clicou em "conectar um caixa". Devolve o código para a tela. */
  abrir(): CodigoAtivo {
    return this.codigo.abrir()
  }

  fechar(): void {
    this.codigo.fechar()
  }

  ativo(): CodigoAtivo | null {
    return this.codigo.ativo()
  }

  /**
   * Tentativa vinda de uma máquina nova. Em caso de acerto, devolve a credencial
   * e encerra a janela — o código serve uma vez só.
   */
  tentar(codigoInformado: string): ResultadoPareamento {
    const resultado = this.codigo.conferir(codigoInformado)
    if (resultado !== 'ok') return { ok: false, motivo: resultado }

    const token = gerarToken()
    return {
      ok: true,
      credencial: {
        id: novoId(),
        token,
        tokenHash: hashDeToken(token),
        chaveSigilo: gerarChaveSigilo()
      }
    }
  }
}

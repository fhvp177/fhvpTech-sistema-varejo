/**
 * Prazo para toda chamada que este servidor faz PARA FORA.
 *
 * ── O incidente que gerou isto ──────────────────────────────────────────────
 * Em 11/09/2026 o backend inteiro travou: aceitava a conexao em 0,06s e nao
 * devolvia um byte, em qualquer endereco, ate estourar 35 segundos. Licenca,
 * nota fiscal e painel, todos fora, e assim ficou ate alguem reclamar.
 *
 * A causa de fundo estava aqui: havia NOVE `fetch` para terceiros (ACBr, Efi,
 * R2) e nenhum com prazo. O `fetch` do Node nao desiste sozinho — nao existe
 * prazo padrao. Quando o outro lado para de responder no meio da resposta (o
 * log tinha exatamente isso, `UND_ERR_SOCKET: other side closed`), a chamada
 * fica pendurada para sempre, segurando uma conexao. Algumas dessas e o
 * servidor fica sem espaco para atender qualquer outra coisa.
 *
 * ⚠️ Prazo nao e zelo: e a diferenca entre "a ACBr esta fora" e "o FHVP esta
 * fora". Sem ele, a indisponibilidade de um terceiro vira a nossa.
 *
 * ── Por que numeros diferentes ──────────────────────────────────────────────
 * O teto de tudo e o prazo que o APLICATIVO da ao backend: 60 segundos
 * (`TEMPO_RESPOSTA_FISCAL_MS`, no core). Toda chamada nossa para fora tem que
 * caber DENTRO disso com folga, senao quem desiste primeiro e o balconista, e
 * ai a nota fica reservada sem desfecho — o pior dos dois mundos.
 */

/**
 * Emitir, consultar e cancelar documento fiscal na ACBr.
 *
 * O mais generoso da casa, porque do outro lado tem a SEFAZ e ela demora
 * mesmo. 45s deixa 15 de folga dentro dos 60 que o aplicativo espera.
 */
export const PRAZO_ACBR_MS = 45_000

/**
 * Pegar token de autenticacao (ACBr e Efi).
 *
 * Curto de proposito: autenticacao que demora e autenticacao que nao vai vir.
 * E, quando ela falha, nada depois dela adianta — falhar rapido aqui devolve a
 * conexao em vez de segurar.
 */
export const PRAZO_TOKEN_MS = 15_000

/** Cobranca PIX na Efi: criar, consultar, configurar webhook. */
export const PRAZO_EFI_MS = 20_000

/** Listar ou baixar backup no armazenamento em nuvem. */
export const PRAZO_R2_MS = 20_000

/**
 * O `signal` pronto para entregar ao `fetch`.
 *
 * Existe para o prazo ficar visivel no lugar da chamada — `AbortSignal.timeout`
 * solto no meio das opcoes se le como detalhe, e o teste que cobra prazo
 * procura por este nome.
 */
export function prazoDe(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

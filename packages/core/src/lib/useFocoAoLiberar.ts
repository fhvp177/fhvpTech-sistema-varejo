import { useEffect, type RefObject } from 'react'

/**
 * Devolve o cursor a um campo assim que ele volta a aceitar digitação.
 *
 * ── O bug que este hook existe pra impedir ───────────────────────────────────
 * Campo de senha/PIN normalmente fica `disabled` enquanto a verificação roda.
 * Quando ele desabilita, o navegador tira o foco dele. A correção intuitiva —
 * chamar `ref.current?.focus()` logo depois do `await`, junto com a mensagem de
 * erro — NÃO funciona: aquele trecho roda ANTES de o React repintar, com o
 * input ainda `disabled`, e focar campo desabilitado é no-op. Quando ele
 * reabilita, já não há ninguém pedindo o foco.
 *
 * Resultado pra quem usa: erra o PIN, o campo esvazia, e é preciso CLICAR nele
 * de novo antes de redigitar. Aconteceu na tela de login, na autorização do
 * gerente, na recuperação de PIN e no cadastro de e-mail do dono — sempre pelo
 * mesmo motivo, sempre "consertado" com o mesmo focus() que não faz nada.
 *
 * Aqui o foco é pedido REAGINDO ao campo deixar de estar bloqueado, que é o
 * único momento em que ele pode mesmo receber o cursor.
 *
 * @param ref       campo que deve receber o cursor
 * @param bloqueado true enquanto o campo está `disabled` (carregando, travado…)
 * @param ativo     false quando não se deve roubar o foco — por exemplo, com um
 *                  modal aberto por cima: quem digita o e-mail da recuperação
 *                  não pode ver o cursor pular pro campo de trás
 * @param chave     muda quando o campo passa a ser "outro" (troca de usuário,
 *                  troca de etapa do formulário) e o foco deve voltar mesmo sem
 *                  `bloqueado` ter mudado
 */
export function useFocoAoLiberar(
  ref: RefObject<HTMLElement | null>,
  bloqueado: boolean,
  ativo = true,
  chave?: unknown
): void {
  useEffect(() => {
    if (!ativo || bloqueado) return
    ref.current?.focus()
    // `ref` é estável (useRef) e de propósito fica fora das dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueado, ativo, chave])
}

/**
 * O botão "voltar" do navegador anda DENTRO do sistema, e nunca sai dele.
 *
 * ── O problema, visto no primeiro teste ──────────────────────────────────────
 * No aplicativo instalado não existe botão de voltar. No navegador existe — e
 * num tablet Android ele é botão do sistema, ou um gesto de borda, apertado o
 * tempo todo por reflexo. Quem estava no PDV apertava voltar esperando fechar o
 * PDV, e o navegador saía do site inteiro.
 *
 * Numa venda pela metade, isso é perder a venda.
 *
 * ── Por que não bastou trocar o roteador ─────────────────────────────────────
 * A saída óbvia seria trocar o `MemoryRouter` por um roteador de URL, e deixar
 * o navegador cuidar do histórico. Não resolve: o PDV não é uma rota, é um
 * MODO (`pdvAtivo`) ligado dentro da tela de Vendas. Ele nunca entrou no
 * histórico do navegador, então voltar não teria como fechá-lo.
 *
 * ── Como funciona ────────────────────────────────────────────────────────────
 * Mantém-se sempre uma entrada de histórico sobrando. Quando o voltar é
 * apertado, essa entrada é consumida — e aqui ela é reposta na mesma hora, de
 * modo que sempre haja o que consumir da próxima vez. O navegador nunca chega
 * na entrada anterior ao sistema, que é por onde ele sairia.
 *
 * Com o voltar capturado, ele passa a significar o que a pessoa espera:
 *
 *   1. está no PDV        → fecha o PDV
 *   2. veio de outra tela → volta para ela (histórico do próprio roteador)
 *   3. está na primeira   → fica onde está
 *
 * O caso 3 é deliberado. Num sistema de caixa, sair sem querer custa caro e
 * ficar parado não custa nada: quem quiser mesmo sair fecha a aba.
 *
 * ── Só na web ────────────────────────────────────────────────────────────────
 * Este componente só é montado no build do navegador. No aplicativo instalado
 * não há histórico de navegador para guardar, e a constante de build faz o
 * código sumir do pacote em vez de ficar apenas desligado.
 */
import { useEffect } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  pdvAtivo: boolean
  setPdvAtivo: (ativo: boolean) => void
}

// O estado do PDV chega por propriedade, e não pelo contexto: o `App` já o tem
// em mãos, e buscá-lo de volta lá criaria um ciclo de imports entre os dois.
export const GuardaDoVoltar: FC<Props> = ({ pdvAtivo, setPdvAtivo }) => {
  const navigate = useNavigate()

  useEffect(() => {
    // A entrada sobrando. `pushState` não recarrega nada nem muda o endereço
    // visível — só empilha um degrau para o voltar ter onde pisar.
    window.history.pushState(null, '', window.location.href)

    const aoVoltar = (): void => {
      // Repõe o degrau ANTES de agir: se o usuário apertar voltar duas vezes
      // rápido, a segunda já encontra a pilha armada.
      window.history.pushState(null, '', window.location.href)

      if (pdvAtivo) {
        setPdvAtivo(false)
        return
      }
      // No `MemoryRouter`, voltar sem para onde ir não faz nada — que é
      // exatamente o desejado na primeira tela.
      navigate(-1)
    }

    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [pdvAtivo, setPdvAtivo, navigate])

  return null
}

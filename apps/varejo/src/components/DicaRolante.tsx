/**
 * A dica do campo de busca, que vai e volta quando não cabe.
 *
 * ── O problema ───────────────────────────────────────────────────────────────
 * "Buscar por cliente ou nº da venda..." tem 240px. O campo, numa tela de 360
 * dividida com um menu e um botão, tem 180. O navegador corta a frase no meio
 * e não há como ler o resto — o `placeholder` é um pseudo-elemento, não dá para
 * rolar nem animar.
 *
 * ── A saída ──────────────────────────────────────────────────────────────────
 * O campo fica sem `placeholder` no celular e ganha esta dica por cima, que é
 * um elemento de verdade e por isso pode andar. Ela desliza até o fim da frase,
 * espera, e volta.
 *
 * ⚠️ Ela só existe enquanto o campo está VAZIO. Assim que a pessoa digita, some
 * — e some junto o movimento.
 *
 * ── ⚠️ Sobre animar uma coisa que fica na tela o dia inteiro ─────────────────
 * A régua do projeto é que animação decorativa é imposto cobrado 300 vezes por
 * dia. Esta passa porque INFORMA: sem ela, metade da frase é ilegível. Mesmo
 * assim ela anda devagar (12s o ciclo), pausa nas duas pontas, PARA quando o
 * campo tem foco — ninguém precisa de movimento enquanto digita — e não existe
 * para quem pediu menos movimento no sistema.
 *
 * ── Sem medir nada em JavaScript ─────────────────────────────────────────────
 * O quanto ela anda é `100cqw - 100%`: a largura da janela menos a largura do
 * texto, resolvida pelo próprio navegador com consulta de contêiner. O `min()`
 * com zero é o que faz a frase que CABE não se mexer — sem ele, texto curto
 * andaria para a direita, para fora.
 *
 * O `aria-label` do campo carrega a frase inteira, então quem usa leitor de
 * tela ouve tudo de uma vez e não depende de esperar a volta.
 */
export function DicaRolante({ texto }: { texto: string }): JSX.Element {
  return (
    <span className="dica-rolante" aria-hidden="true">
      <span>{texto}</span>
    </span>
  )
}

export default DicaRolante

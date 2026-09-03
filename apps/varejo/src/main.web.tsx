/**
 * Porta de entrada da versão que roda no navegador.
 *
 * Só faz uma coisa antes do de sempre: montar o `window.api`. No aplicativo
 * instalado quem monta é o `preload`, que o Electron executa antes de a página
 * existir. Aqui não há preload — a página é a primeira a rodar.
 *
 * ── Por que o import de baixo é dinâmico ─────────────────────────────────────
 * `import` estático é içado para o topo: escrevendo `import './main'` no fim do
 * arquivo, o React montaria ANTES desta linha rodar. A primeira tela já
 * pergunta a licença e a sessão, e um `window.api` ausente naquele instante
 * daria tela branca sem nenhuma mensagem — o pior modo de falha possível.
 *
 * O `import()` só acontece quando a execução chega nele, que é o que garante a
 * ordem.
 *
 * ── E o estilo entra aqui, estático ──────────────────────────────────────────
 * Só que import dinâmico também adia o CSS: ele viraria um pedaço buscado por
 * JavaScript depois da página abrir, e o lojista veria o sistema sem estilo
 * nenhum por um instante a cada abertura. Importando a folha AQUI, ela vira um
 * `<link>` no próprio HTML e chega junto com a página.
 */
import './index.css'
import { instalarApiWeb } from './web/api'

instalarApiWeb()

// Marca o documento como "servido pelo navegador". É o que permite ao CSS
// aplicar as regras de toque só aqui — ver o bloco `[data-alvo='web']` no
// index.css.
//
// Sem essa marca, um notebook Windows com tela sensível casaria com
// `any-pointer: coarse` e receberia os alvos maiores, mudando a aparência de
// lojistas que já usam o aplicativo instalado e nunca pediram nada.
document.documentElement.dataset.alvo = 'web'

void import('./main')

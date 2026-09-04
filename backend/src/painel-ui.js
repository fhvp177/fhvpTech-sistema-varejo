/**
 * Pecas de interface compartilhadas pelos DOIS paineis.
 *
 * Mora em arquivo proprio, e nao copiado nas duas paginas, pela mesma razao do
 * `painel.css`: sao dois paineis que precisam parecer o mesmo produto. Com o
 * codigo duplicado, a segunda alteracao ja sai divergente, e "quase igual"
 * passa impressao de descuido — justamente o que um parceiro comercial nao
 * deveria sentir ao abrir a tela todo dia.
 *
 * Aqui dentro: o mapa de icones do lucide, o cartao de numero e o menu de
 * acoes de linha. Nada que dependa de qual painel esta usando.
 *
 * Publica no escopo global de proposito: as duas paginas rodam o script delas
 * dentro de uma IIFE, e chamam `icone(...)`, `cartao(...)` e `menuAcoes(...)`
 * como se fossem locais.
 */
(function (raiz) {
  'use strict'

  /**
   * Icones em SVG embutido.
   *
   * Extraidos do mesmo lucide que o app usa, para que o painel e o sistema do
   * lojista tenham o mesmo tracado. Embutidos, e nao carregados de uma CDN,
   * porque a CSP da pagina e `default-src 'none'`: buscar imagem de fora seria
   * bloqueado, e afrouxar a CSP para enfeitar a tela e troca ruim.
   */
  const ICONES = {
    'ban': '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    'banknote': '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    'building-2': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-check-big': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'ellipsis-vertical': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'handshake': '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    'key-round': '<path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    'mail-check': '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/>',
    'mail-x': '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m17 17 4 4"/><path d="m21 17-4 4"/>',
    'laptop': '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    'monitor': '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    'circle-minus': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    'octagon-alert': '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'pause': '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'store': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  }

  /**
   * Devolve o SVG de um icone. `tom` vira a cor via CSS, nunca fixa aqui.
   *
   * ⚠️ A classe `icone` vai no PROPRIO SVG, e nao num invólucro. SVG com
   * viewBox e sem largura estica ate o tamanho do pai, e o tamanho vinha so
   * de regras de conteiner (`.com-icone svg` e companhia). Icone posto numa
   * tela nova saia gigante, em silencio: foi assim que a lista de maquinas
   * nasceu com um monitor ocupando a largura toda e o botao fora da tela.
   *
   * As regras de conteiner tem especificidade maior e continuam mandando
   * onde ja existiam, entao nada do que estava certo muda.
   */
  function icone(nome, extra) {
    const d = ICONES[nome]
    if (!d) return document.createComment('icone ' + nome + ' inexistente')
    const wrap = document.createElement('span')
    wrap.style.display = 'inline-flex'
    wrap.innerHTML =
      '<svg class="icone' + (extra ? ' ' + extra : '') + '" ' +
      'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'
    return wrap.firstChild
  }

  /**
   * Cartao de numero com icone.
   *
   * Ordem igual a do Dashboard do app: icone em cima, depois o rotulo, depois o
   * numero grande. Nao e capricho — quem administra a rede tambem usa o sistema
   * do lojista, e duas telas nossas com a mesma informacao em ordens diferentes
   * fazem a pessoa reler as duas.
   *
   * `tom` pinta o quadrado do icone (ok / alerta / erro / neutro).
   */
  function cartao(rotulo, valor, nomeIcone, tom) {
    const d = document.createElement('div')
    d.className = 'card anim-pop'

    const cx = document.createElement('span')
    cx.className = 'icone-card' + (tom ? ' ' + tom : '')
    cx.appendChild(icone(nomeIcone))

    const r = document.createElement('div'); r.className = 'rotulo'; r.textContent = rotulo
    const v = document.createElement('div'); v.className = 'valor'; v.textContent = valor
    d.append(cx, r, v)
    return d
  }

  /**
   * Menu de acoes de uma linha.
   *
   * Substitui a fileira de botoes que quebrava em duas linhas e dava o mesmo
   * peso visual a uma acao de rotina e a uma que derruba loja. Aqui a rotina
   * fica em cima, o destrutivo embaixo de um traco.
   *
   * Fecha ao clicar fora, ao apertar Esc e ao escolher qualquer item: menu que
   * fica aberto atras de um modal e lixo na tela.
   */
  function menuAcoes(itens) {
    const cx = document.createElement('div'); cx.className = 'menu-acoes'

    const gatilho = document.createElement('button')
    gatilho.type = 'button'
    gatilho.className = 'neutro pequeno'
    gatilho.setAttribute('aria-haspopup', 'menu')
    gatilho.setAttribute('aria-expanded', 'false')
    gatilho.setAttribute('aria-label', 'Ações')
    gatilho.title = 'Ações'
    gatilho.appendChild(icone('ellipsis-vertical'))

    const lista = document.createElement('div')
    lista.className = 'menu-lista'
    lista.setAttribute('role', 'menu')
    lista.hidden = true

    function fechar() {
      lista.hidden = true
      if (lista.parentNode === document.body) document.body.removeChild(lista)
      gatilho.setAttribute('aria-expanded', 'false')
      document.removeEventListener('click', foraDaqui, true)
      document.removeEventListener('keydown', teclou, true)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
    function foraDaqui(ev) {
      if (!cx.contains(ev.target) && !lista.contains(ev.target)) fechar()
    }
    function teclou(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fechar() } }

    for (const it of itens) {
      if (it === '-') {
        const s = document.createElement('div'); s.className = 'separador'
        lista.appendChild(s)
        continue
      }
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('role', 'menuitem')
      if (it.perigo) b.className = 'perigo'
      b.appendChild(icone(it.icone))
      b.appendChild(document.createTextNode(it.texto))
      b.addEventListener('click', () => { fechar(); it.aoClicar() })
      lista.appendChild(b)
    }

    gatilho.addEventListener('click', (ev) => {
      ev.stopPropagation()
      const abrindo = lista.hidden

      // Fecha qualquer outro menu antes: dois abertos ao mesmo tempo confundem
      // sobre qual linha vai receber a ação.
      for (const outra of document.querySelectorAll('body > .menu-lista')) {
        document.body.removeChild(outra)
      }
      for (const g of document.querySelectorAll('.menu-acoes > button')) {
        g.setAttribute('aria-expanded', 'false')
      }

      if (!abrindo) { fechar(); return }

      // ⚠️ O menu vive no <body>, não dentro da linha.
      //
      // A tabela mora num contêiner com `overflow-x: auto` (é o que permite
      // rolar as colunas em tela estreita). Qualquer filho posicionado dentro
      // dele é RECORTADO na borda: o menu abria e aparecia pela metade, com uma
      // barra de rolagem surgindo do nada.
      //
      // Levando para o <body> com `position: fixed`, ele deixa de ter contêiner
      // que o recorte. O preço é que a posição não acompanha mais nada sozinha,
      // por isso rolagem e redimensionamento FECHAM o menu em vez de tentar
      // segui-lo: menu que descola do botão que o abriu é pior que menu fechado.
      document.body.appendChild(lista)
      lista.hidden = false
      lista.style.position = 'fixed'
      // O `right: 0` do CSS base servia ao menu ancorado na linha. Aqui ele
      // soma com o `left` calculado e estica a caixa de ponta a ponta, por isso
      // precisa ser desligado explicitamente.
      lista.style.right = 'auto'
      const r = gatilho.getBoundingClientRect()
      lista.style.top = (r.bottom + 5) + 'px'
      // Alinhado à direita do gatilho, e nunca para fora da janela.
      const largura = lista.offsetWidth || 190
      lista.style.left = Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8)) + 'px'

      // Se não couber abaixo, abre para cima. Uma linha no fim da tabela não
      // pode ter o menu escondido no rodapé da janela.
      const altura = lista.offsetHeight
      if (r.bottom + 5 + altura > window.innerHeight - 8) {
        lista.style.top = Math.max(8, r.top - 5 - altura) + 'px'
      }

      gatilho.setAttribute('aria-expanded', 'true')
      document.addEventListener('click', foraDaqui, true)
      document.addEventListener('keydown', teclou, true)
      window.addEventListener('scroll', fechar, true)
      window.addEventListener('resize', fechar)
    })

    cx.appendChild(gatilho)
    return cx
  }

  /**
   * Poe o icone nos cartoes que ja vem no HTML.
   *
   * O painel da FHVP monta os cartoes por JS e usa `cartao()`. O do revendedor
   * os tem escritos na pagina, com os numeros preenchidos depois. Para os dois
   * ficarem iguais sem reescrever o segundo, o cartao estatico declara
   * `data-icone` e esta funcao insere o quadrado na frente do rotulo.
   *
   * Roda uma vez no carregamento: cartao estatico nao nasce nem some depois.
   */
  function hidratarCartoes() {
    for (const card of document.querySelectorAll('.card[data-icone]')) {
      if (card.querySelector('.icone-card')) continue
      const cx = document.createElement('span')
      cx.className = 'icone-card' + (card.dataset.tom ? ' ' + card.dataset.tom : '')
      cx.appendChild(icone(card.dataset.icone))
      card.insertBefore(cx, card.firstChild)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hidratarCartoes)
  } else {
    hidratarCartoes()
  }

  raiz.icone = icone
  raiz.cartao = cartao
  raiz.menuAcoes = menuAcoes
})(window)

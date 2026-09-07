// Mede o cupom no Chromium de verdade, sob mídia de impressão, e falha se
// alguma coisa passar da largura da bobina. É o único jeito de responder
// "nome gigante quebra o layout?" sem gastar papel.
//
//   npm run medir:cupom
const { app, BrowserWindow } = require('electron')
const path = require('path')
const { readFileSync } = require('fs')

/*
 * O quanto a cabeca termica alcanca, em mm de corpo.
 *
 * A POS80 imprime 72,07mm a partir da borda esquerda do papel. Com os 2mm
 * de @page de cada lado, sobram 68 para o corpo e ainda ficam 2mm de folga.
 * Passar disso nao da erro nenhum: o texto simplesmente nao sai no papel.
 */
const LARGURA_MAXIMA_MM = 68

const ultimo = process.argv[process.argv.length - 1]
const dir = ultimo.endsWith('.js')
  ? path.join(require('os').tmpdir(), 'fhvp-medir-cupom')
  : ultimo
const ARQUIVOS = [
  'cupom-normal.html',
  'cupom-avista.html',
  'cupom-extremo.html',
  'devolucao-extremo.html',
  'entrega-extremo.html'
]

const MEDIR = `(() => {
  const body = document.body
  const cs = getComputedStyle(body)
  const r = body.getBoundingClientRect()
  const limite = r.right - parseFloat(cs.paddingRight)
  const PX_MM = 96 / 25.4
  const vazando = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width === 0) continue
    if (b.right > limite + 0.5) vazando.push({
      tag: el.tagName.toLowerCase(),
      classe: el.className || '(sem classe)',
      excesso_mm: +((b.right - limite) / PX_MM).toFixed(2),
      texto: (el.textContent || '').trim().slice(0, 28)
    })
  }
  return {
    // ⚠️ Onde o corpo COMECA, medido da borda esquerda da pagina. Em bobina
    // isso tem que ser ~0: nao existe centro de folha para centralizar, e um
    // corpo centralizado numa pagina larga sai todo fora do papel.
    inicioCorpo_mm: +(r.left / PX_MM).toFixed(2),
    larguraCorpo_mm: +(body.clientWidth / PX_MM).toFixed(2),
    rolagem_mm: +(body.scrollWidth / PX_MM).toFixed(2),
    altura_mm: +(body.scrollHeight / PX_MM).toFixed(1),
    vazando: vazando.slice(0, 6),
    total: vazando.length
  }
})()`

let falhou = false

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900 })
  win.webContents.debugger.attach('1.3')
  for (const arquivo of ARQUIVOS) {
    try {
      await win.loadFile(path.join(dir, arquivo))
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
      const r = await win.webContents.executeJavaScript(MEDIR)
      // Onde este arquivo pegou o placar: o "OK" so sai se nada tiver reprovado
      // no caminho. Ja aconteceu de a regua reprovar e dizer OK na linha
      // seguinte, e relatorio que se contradiz nao decide nada.
      const placarAntes = falhou
      console.log(`\n===== ${arquivo}`)
      console.log(
        `  corpo ${r.larguraCorpo_mm}mm | comeca em ${r.inicioCorpo_mm}mm | ` +
          `rolagem ${r.rolagem_mm}mm | altura ${r.altura_mm}mm`
      )

      /*
       * ⚠️ A medicao que de fato pega o defeito que foi ao papel.
       *
       * O comprovante de entrega tinha 68mm e cabia inteiro — e mesmo assim saiu
       * praticamente em branco, porque comecava aos 71mm da borda: `margin: 0
       * auto` centraliza na pagina que o Chromium monta (larga), e nao na bobina.
       *
       * O conserto e um bloco @media print encostando o corpo a esquerda. Esta
       * checagem e o que cobra que ele exista.
       */
      if (r.inicioCorpo_mm > 3) {
        console.log(
          `  COMECA LONGE DEMAIS DA BORDA: ${r.inicioCorpo_mm}mm.` +
            ' Em bobina o papel encosta na esquerda — falta um @media print com margin: 0.'
        )
        falhou = true
      }
      // O scrollWidth é o critério que manda. O laço por elemento só aponta o
      // culpado quando dá — ele compara CAIXAS, e texto que vaza de um bloco de
      // 68mm não alarga o bloco, então sozinho ele deixa passar vazamento real.
      /*
       * ⚠️ O CORPO tambem e medido, e nao so o conteudo dentro dele.
       *
       * A versao antiga comparava scrollWidth com clientWidth: isso pega texto
       * vazando de um bloco, e NAO pega um corpo largo demais para a bobina.
       * Foi por esse buraco que o cupom do entregador saiu deslocado, com meio
       * centimetro aparecendo — tudo cabia dentro do corpo, e o corpo e que nao
       * cabia no papel.
       */
      const fonte = readFileSync(path.join(dir, arquivo), 'utf-8')
      if (r.larguraCorpo_mm > LARGURA_MAXIMA_MM + 0.1) {
        console.log(
          `  CORPO LARGO DEMAIS: ${r.larguraCorpo_mm}mm, e a cabeca alcanca ${LARGURA_MAXIMA_MM}mm.` +
            ' O papel sai deslocado e quase tudo fica fora da bobina.'
        )
        falhou = true
      }
      /*
       * E ninguem declara o tamanho da pagina. O Chromium ignora o papel do
       * driver de qualquer jeito, e declarar aqui so faz a pagina ser diagramada
       * num formato que a impressora depois desloca por conta propria.
       */
      if (/@page[^{]*\{[^}]*\bsize\s*:/.test(fonte)) {
        console.log('  DECLAROU size no @page — tire; o Chromium ignora o papel do driver.')
        falhou = true
      }

      const transbordou = r.rolagem_mm > r.larguraCorpo_mm + 0.1
      if (!transbordou && falhou === placarAntes) {
        console.log('  OK — cabe inteiro na bobina')
      } else if (transbordou) {
        console.log(`  VAZOU ${(r.rolagem_mm - r.larguraCorpo_mm).toFixed(1)}mm além do papel`)
        for (const v of r.vazando) console.log(`    +${v.excesso_mm}mm  ${v.tag}.${v.classe}  "${v.texto}"`)
        if (r.total === 0) console.log('    (nenhuma CAIXA vazou — é texto escapando de dentro de um bloco)')
        falhou = true
      }
    } catch (e) {
      console.log(`\n===== ${arquivo}\n  ERRO: ${e.message}`)
    }
  }
  app.exit(falhou ? 1 : 0)
})

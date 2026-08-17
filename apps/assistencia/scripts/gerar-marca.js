/**
 * Gera a marca da ASSISTÊNCIA a partir da arte original da FHVP Tech,
 * recolorida para a paleta do nicho (petróleo + grafite).
 *
 * Uso:  npx electron scripts/gerar-marca.js [--aplicar]
 *
 * Produz, a partir de `src/assets/logo.png` do VAREJO (a arte original):
 *   src/assets/logo.png      — a marca da tela de login, na resolução de origem
 *   resources/icon.png       — 512×512, o que o empacotador usa
 *   resources/icon.ico       — 256/128/64/48/32/16, o ícone do Windows
 *
 * ── Por que Electron, e não uma biblioteca de imagem ────────────────────────
 * Não há potrace, Inkscape nem ImageMagick nesta máquina, e o projeto não tem
 * sharp/jimp. Mas o Electron já está aqui: o `nativeImage` abre PNG, entrega os
 * pixels crus, redimensiona e devolve PNG. Zero dependência nova.
 *
 * ── O que isto é, e o que NÃO é ─────────────────────────────────────────────
 * É um recolorimento FIEL: as letras, os traços de circuito e o degradê do V
 * são preservados pixel a pixel; só a cor muda. NÃO é uma vetorização — para
 * isso seria preciso um traçador de curvas. Se um dia aparecer o SVG original
 * da marca, recolorir lá vira trocar três hex, e este script se aposenta.
 *
 * ── Sem `--aplicar` ele não grava nada ──────────────────────────────────────
 * O padrão é ensaio: escreve na pasta temporária e diz o que faria. Sobrescrever
 * a identidade visual do app é coisa de olhar antes.
 */
const { app, nativeImage } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

const RAIZ = path.join(__dirname, '..')
// A arte de origem é a do varejo: é a marca FHVP Tech original, sem recolorir.
// Ler de lá (e não da própria assistência) torna o script IDEMPOTENTE — rodar
// duas vezes não empilha recolorimento sobre recolorimento.
const ORIGEM = path.join(RAIZ, '..', 'varejo', 'src', 'assets', 'logo.png')

// ── Regras de cor ───────────────────────────────────────────────────────────
const AZUL_MIN = 185 // o azul da marca vive entre ~185° e ~255°
const AZUL_MAX = 255
const TEAL = 174 // matiz de destino (teal-600/700 do Tailwind)
const LIMITE_FUNDO = 0.22 // abaixo disto é o fundo do círculo
// ⚠️ E acima DISTO é letra, não acento. Sem este teto, os pixels claros das
// letras — que trazem um leve viés azul do antialias — passavam no teste de
// "é azul" (matiz 240°, saturação 0.35) e viravam teal médio: a marca escrita
// saía esverdeada. Luminosidade separa antes do matiz.
const LIMITE_LETRA = 0.82

function rgbParaHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslParaRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [
    Math.round(canal(h + 1 / 3) * 255),
    Math.round(canal(h) * 255),
    Math.round(canal(h - 1 / 3) * 255)
  ]
}

/** Devolve um nativeImage recolorido. `escala` 0 = mantém o tamanho de origem. */
function recolorir(img) {
  const { width, height } = img.getSize()
  const px = img.toBitmap() // BGRA
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue // fora do círculo: intocado
    const b = px[i], g = px[i + 1], r = px[i + 2]
    let [h, s, l] = rgbParaHsl(r, g, b)
    const ehAzul = h >= AZUL_MIN && h <= AZUL_MAX && s > 0.12 && l <= LIMITE_LETRA

    if (l < LIMITE_FUNDO) {
      // Fundo → grafite (zinc-950). A luminosidade original entra em escala, e
      // não zerada, pra que a vinheta suave da arte continue existindo — sem
      // ela o círculo vira um disco chapado.
      h = 240; s = 0.1; l = 0.02 + l * 0.55
    } else if (ehAzul) {
      // Acento: o V, o "TECH" e os traços de circuito.
      //
      // Só girar o matiz não bastava: o azul da marca é vivo (l≈0.47, saturação
      // no talo), e virar teal mantendo isso dá um turquesa NEON que não é a
      // paleta. Aqui a faixa do azul é REMAPEADA para a do teal-500/600,
      // preservando a ordem relativa — é o que mantém o degradê do V.
      h = TEAL
      s = Math.min(s, 0.85)
      l = Math.max(0.24, Math.min(0.48, 0.24 + (l - 0.3) * 0.55))
    } else if (s > 0.03) {
      // Letras claras: ficam NEUTRAS. O viés azul do antialias, mantido,
      // viraria um halo esverdeado em volta de cada letra. A marca escrita é
      // branca — quem carrega a cor é o acento.
      s = s * 0.15
    }

    const [nr, ng, nb] = hslParaRgb(h, s, l)
    px[i] = nb; px[i + 1] = ng; px[i + 2] = nr
  }
  return nativeImage.createFromBitmap(px, { width, height })
}

/**
 * Empacota vários PNGs num .ico.
 *
 * O formato aceita PNG embutido desde o Vista, então não é preciso escrever
 * bitmap DIB — basta o cabeçalho e os arquivos inteiros enfileirados.
 * Cada entrada tem 16 bytes; lado 256 é gravado como 0, que é a convenção.
 */
function montarIco(imagens) {
  const CABECALHO = 6
  const ENTRADA = 16
  const inicio = CABECALHO + ENTRADA * imagens.length

  const dir = Buffer.alloc(CABECALHO)
  dir.writeUInt16LE(0, 0) // reservado
  dir.writeUInt16LE(1, 2) // 1 = ícone
  dir.writeUInt16LE(imagens.length, 4)

  const entradas = []
  const dados = []
  let deslocamento = inicio
  for (const { lado, png } of imagens) {
    const e = Buffer.alloc(ENTRADA)
    e.writeUInt8(lado >= 256 ? 0 : lado, 0)
    e.writeUInt8(lado >= 256 ? 0 : lado, 1)
    e.writeUInt8(0, 2) // paleta
    e.writeUInt8(0, 3) // reservado
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(deslocamento, 12)
    entradas.push(e)
    dados.push(png)
    deslocamento += png.length
  }
  return Buffer.concat([dir, ...entradas, ...dados])
}

app.whenReady().then(() => {
  const aplicar = process.argv.includes('--aplicar')
  const destino = aplicar
    ? { logo: path.join(RAIZ, 'src', 'assets', 'logo.png'),
        png: path.join(RAIZ, 'resources', 'icon.png'),
        ico: path.join(RAIZ, 'resources', 'icon.ico') }
    : (() => {
        const d = path.join(tmpdir(), 'marca-assistencia')
        mkdirSync(d, { recursive: true })
        return { logo: path.join(d, 'logo.png'), png: path.join(d, 'icon.png'), ico: path.join(d, 'icon.ico') }
      })()

  try {
    const original = nativeImage.createFromPath(ORIGEM)
    if (original.isEmpty()) throw new Error(`não consegui abrir a arte de origem: ${ORIGEM}`)
    const { width } = original.getSize()

    // 1. A marca da tela de login, na resolução de origem.
    const marca = recolorir(original)
    writeFileSync(destino.logo, marca.toPNG())
    console.log(`  logo.png   ${width}×${width}`)

    // 2. O ícone 512, que é o que o empacotador consome.
    const i512 = recolorir(original.resize({ width: 512, height: 512, quality: 'best' }))
    writeFileSync(destino.png, i512.toPNG())
    console.log(`  icon.png   512×512`)

    // 3. O .ico do Windows. Redimensiona a partir da arte ORIGINAL em cada
    //    tamanho (e não do 512 já reduzido): reduzir uma vez só preserva mais
    //    detalhe nos tamanhos pequenos, onde os traços de circuito somem fácil.
    const lados = [256, 128, 64, 48, 32, 16]
    const imagens = lados.map((lado) => ({
      lado,
      png: recolorir(original.resize({ width: lado, height: lado, quality: 'best' })).toPNG()
    }))
    writeFileSync(destino.ico, montarIco(imagens))
    console.log(`  icon.ico   ${lados.join('/')}`)

    console.log(aplicar ? '\n  ✓ aplicado' : `\n  [ENSAIO] escrito em ${path.dirname(destino.logo)}`)
    app.exit(0)
  } catch (e) {
    console.error(`  erro: ${e.message}`)
    app.exit(1)
  }
})

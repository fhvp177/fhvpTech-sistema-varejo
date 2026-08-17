// Amostra as cores dominantes de um PNG, agrupadas. Serve para conferir o
// resultado do recolorimento com número, em vez de olho.
const { app, nativeImage } = require('electron')

app.whenReady().then(() => {
  const arquivo = process.argv[2]
  const img = nativeImage.createFromPath(arquivo)
  const { width, height } = img.getSize()
  const px = img.toBitmap()

  const contagem = new Map()
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue
    // Agrupa em degraus de 16 para não listar 40 mil tons de antialias.
    const b = px[i] >> 4 << 4, g = px[i + 1] >> 4 << 4, r = px[i + 2] >> 4 << 4
    const k = `${r},${g},${b}`
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }

  const hex = (r, g, b) =>
    '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

  console.log(`  ${arquivo}  ${width}×${height}`)
  ;[...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, n]) => {
      const [r, g, b] = k.split(',').map(Number)
      const pct = ((n / (width * height)) * 100).toFixed(1)
      console.log(`    ${hex(r, g, b)}  ${String(pct).padStart(5)}%`)
    })
  app.exit(0)
})

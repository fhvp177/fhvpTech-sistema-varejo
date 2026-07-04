import { FC, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

type Props = {
  codigo_barras: string
  nome: string
  preco: number
  larguraMm: number
  alturaMm: number
  mostrarNome: boolean
  mostrarCodigo: boolean
  mostrarPreco: boolean
  mostrarLinhasGuia: boolean
}

const EtiquetaUnitaria: FC<Props> = ({
  codigo_barras,
  nome,
  preco,
  larguraMm,
  alturaMm,
  mostrarNome,
  mostrarCodigo,
  mostrarPreco,
  mostrarLinhasGuia,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !codigo_barras.trim()) return
    try {
      JsBarcode(svg, codigo_barras, {
        format: 'CODE128',
        displayValue: false,
        margin: 2,
        width: 1.2,
        height: 30,
      })
      const w = svg.getAttribute('width')
      const h = svg.getAttribute('height')
      if (w && h) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
        svg.removeAttribute('width')
        svg.removeAttribute('height')
      }
    } catch {
      // código de barras inválido — SVG fica vazio
    }
  }, [codigo_barras])

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div
      style={{
        width: `${larguraMm}mm`,
        height: `${alturaMm}mm`,
        border: mostrarLinhasGuia ? '0.3pt dashed #aaa' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '1mm 1.5mm',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
        gap: '0.4mm',
      }}
    >
      {mostrarNome && (
        <span
          style={{
            fontSize: '5.5pt',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.1,
            width: '100%',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            display: 'block',
            flexShrink: 0,
          }}
        >
          {nome}
        </span>
      )}

      <svg
        ref={svgRef}
        style={{
          width: '100%',
          flex: '1 1 0',
          display: 'block',
          minHeight: '6mm',
          maxHeight: '18mm',
        }}
      />

      {mostrarCodigo && (
        <span
          style={{
            fontSize: '4.5pt',
            letterSpacing: '0.2pt',
            textAlign: 'center',
            display: 'block',
            flexShrink: 0,
          }}
        >
          {codigo_barras}
        </span>
      )}

      {mostrarPreco && (
        <span
          style={{
            fontSize: alturaMm <= 26 ? '7pt' : '9pt',
            fontWeight: 'bold',
            textAlign: 'center',
            display: 'block',
            flexShrink: 0,
          }}
        >
          {fmt(preco)}
        </span>
      )}
    </div>
  )
}

export default EtiquetaUnitaria

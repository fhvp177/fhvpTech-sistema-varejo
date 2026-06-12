import { FC, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

type Props = {
  codigo: string
  formato?: 'EAN13' | 'CODE128'
  largura?: number
  altura?: number
  mostrarNumero?: boolean
}

// Calcula dígito verificador do EAN-13
export function gerarEAN13(): string {
  const prefixo = '789' // GS1 Brasil
  const corpo = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('')
  const base = prefixo + corpo

  let soma = 0
  for (let i = 0; i < 12; i++) {
    soma += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const dv = (10 - (soma % 10)) % 10
  return base + dv
}

const BarcodeGenerator: FC<Props> = ({
  codigo,
  formato = 'CODE128',
  largura = 2,
  altura = 60,
  mostrarNumero = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !codigo) return
    try {
      JsBarcode(svgRef.current, codigo, {
        format: formato,
        width: largura,
        height: altura,
        displayValue: mostrarNumero,
        fontSize: 12,
        margin: 8,
        background: '#ffffff'
      })
    } catch {
      // Código inválido para o formato selecionado — silencia sem quebrar a UI
    }
  }, [codigo, formato, largura, altura, mostrarNumero])

  if (!codigo) return null

  return (
    <div className="flex justify-center bg-white rounded border p-2">
      <svg ref={svgRef} />
    </div>
  )
}

export default BarcodeGenerator

import { FC } from 'react'
import { LayoutEtiqueta } from '../utils/presetsLayoutA4'
import EtiquetaUnitaria from './EtiquetaUnitaria'

export type SlotDado = {
  codigo_barras: string
  nome: string
  preco: number
} | null

type Props = {
  layout: LayoutEtiqueta
  slots: SlotDado[]
  mostrarNome: boolean
  mostrarCodigo: boolean
  mostrarPreco: boolean
  mostrarLinhasGuia: boolean
}

const FolhaA4Preview: FC<Props> = ({
  layout,
  slots,
  mostrarNome,
  mostrarCodigo,
  mostrarPreco,
  mostrarLinhasGuia,
}) => {
  const total = layout.colunas * layout.linhas

  return (
    <div
      style={{
        width: '210mm',
        height: '297mm',
        position: 'relative',
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: total }, (_, idx) => {
        const col = idx % layout.colunas
        const row = Math.floor(idx / layout.colunas)
        const x =
          layout.margem_esquerda_mm +
          col * (layout.largura_etiqueta_mm + layout.espacamento_h_mm)
        const y =
          layout.margem_topo_mm +
          row * (layout.altura_etiqueta_mm + layout.espacamento_v_mm)
        const dado = slots[idx] ?? null

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${x}mm`,
              top: `${y}mm`,
            }}
          >
            {dado ? (
              <EtiquetaUnitaria
                codigo_barras={dado.codigo_barras}
                nome={dado.nome}
                preco={dado.preco}
                larguraMm={layout.largura_etiqueta_mm}
                alturaMm={layout.altura_etiqueta_mm}
                mostrarNome={mostrarNome}
                mostrarCodigo={mostrarCodigo}
                mostrarPreco={mostrarPreco}
                mostrarLinhasGuia={mostrarLinhasGuia}
              />
            ) : mostrarLinhasGuia ? (
              <div
                style={{
                  width: `${layout.largura_etiqueta_mm}mm`,
                  height: `${layout.altura_etiqueta_mm}mm`,
                  border: '0.3pt dashed #ddd',
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default FolhaA4Preview

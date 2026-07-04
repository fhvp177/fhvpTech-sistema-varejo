export type LayoutEtiqueta = {
  id: string
  nome: string
  colunas: number
  linhas: number
  largura_etiqueta_mm: number
  altura_etiqueta_mm: number
  margem_topo_mm: number
  margem_esquerda_mm: number
  espacamento_h_mm: number
  espacamento_v_mm: number
}

// Medidas baseadas nas especificações oficiais Pimaco para folha A4
export const PRESETS: LayoutEtiqueta[] = [
  {
    id: 'pimaco-6080',
    nome: 'Pimaco 6080 — 3×10 (30 etiquetas)',
    colunas: 3,
    linhas: 10,
    largura_etiqueta_mm: 66.7,
    altura_etiqueta_mm: 25.4,
    margem_topo_mm: 10.5,
    margem_esquerda_mm: 4.5,
    espacamento_h_mm: 3.0,
    espacamento_v_mm: 0.0
  },
  {
    id: 'pimaco-6082',
    nome: 'Pimaco 6082 — 2×7 (14 etiquetas)',
    colunas: 2,
    linhas: 7,
    largura_etiqueta_mm: 101.6,
    altura_etiqueta_mm: 34.0,
    margem_topo_mm: 14.0,
    margem_esquerda_mm: 4.5,
    espacamento_h_mm: 3.0,
    espacamento_v_mm: 0.0
  },
  {
    id: 'pimaco-a4356',
    nome: 'Pimaco A4356 — 3×8 (24 etiquetas)',
    colunas: 3,
    linhas: 8,
    largura_etiqueta_mm: 66.7,
    altura_etiqueta_mm: 33.9,
    margem_topo_mm: 13.0,
    margem_esquerda_mm: 7.0,
    espacamento_h_mm: 2.5,
    espacamento_v_mm: 0.0
  },
  {
    id: 'compacta',
    nome: 'Compacta — 4×12 (48 etiquetas)',
    colunas: 4,
    linhas: 12,
    largura_etiqueta_mm: 48.0,
    altura_etiqueta_mm: 23.5,
    margem_topo_mm: 5.0,
    margem_esquerda_mm: 5.0,
    espacamento_h_mm: 2.0,
    espacamento_v_mm: 0.0
  },
  {
    id: 'personalizado',
    nome: 'Personalizado',
    colunas: 3,
    linhas: 10,
    largura_etiqueta_mm: 66.7,
    altura_etiqueta_mm: 25.4,
    margem_topo_mm: 10.5,
    margem_esquerda_mm: 4.5,
    espacamento_h_mm: 3.0,
    espacamento_v_mm: 0.0
  }
]

export const PRESET_PADRAO = PRESETS[0]

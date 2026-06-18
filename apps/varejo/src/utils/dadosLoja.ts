// Identidade da loja (nome, CNPJ, endereço, logo) usada nos cupons e comprovantes.
// Vem do banco via IPC (window.api.loja) — um build só, cada loja com seus dados.

export type DadosLoja = {
  nome: string
  razao_social: string
  cnpj: string
  endereco: string
  cidade: string
  uf: string
  cep: string
  telefone: string
  logo: string | null // data URI (base64) ou null
  exibir_logo: boolean
}

// Fallback usado só se o IPC falhar (raro). Os valores reais — inclusive o legado
// da loja já existente — vivem no backend (electron/ipc/loja.ts).
export const LOJA_PADRAO: DadosLoja = {
  nome: '',
  razao_social: '',
  cnpj: '',
  endereco: '',
  cidade: '',
  uf: '',
  cep: '',
  telefone: '',
  logo: null,
  exibir_logo: false
}

// Monta a linha "Cidade-UF  CEP" do cupom a partir dos campos separados.
// Tolera instalações antigas: quem gravou tudo junto no campo `cidade` (antes da
// separação) e tem uf/cep vazios continua imprimindo exatamente o que digitou.
export function linhaCidadeUf(loja: Pick<DadosLoja, 'cidade' | 'uf' | 'cep'>): string {
  const cidadeUf = [loja.cidade, loja.uf].map((s) => (s || '').trim()).filter(Boolean).join('-')
  return [cidadeUf, (loja.cep || '').trim()].filter(Boolean).join('  ')
}

export async function obterDadosLoja(): Promise<DadosLoja> {
  try {
    const r = await window.api.loja.obter()
    return r.success ? (r.data as DadosLoja) : LOJA_PADRAO
  } catch {
    return LOJA_PADRAO
  }
}

// Redimensiona uma imagem escolhida pelo usuário para um data URI compacto antes
// de guardar na config. Mantém a proporção, limitando o maior lado a `maxLado`px.
// Logos pequenas (~240px) imprimem nítidas no cupom térmico e ocupam poucos KB.
export function redimensionarLogo(arquivo: File, maxLado = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem (PNG ou JPG).'))
      return
    }
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'))
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
        const largura = Math.round(img.width * escala)
        const altura = Math.round(img.height * escala)
        const canvas = document.createElement('canvas')
        canvas.width = largura
        canvas.height = altura
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Falha ao processar a imagem.'))
          return
        }
        ctx.drawImage(img, 0, 0, largura, altura)
        // PNG preserva transparência (comum em logos). Já vem pequena pelo resize.
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(arquivo)
  })
}

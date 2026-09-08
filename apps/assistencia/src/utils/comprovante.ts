/**
 * Prepara a foto do comprovante antes de ela ir para o banco.
 *
 * ── Por que reduzir, e por que aqui ─────────────────────────────────────────
 * O comprovante mora DENTRO do banco (o porquê está na migration 045), e o
 * banco inteiro é copiado, zipado e enviado para a nuvem a cada backup. Uma
 * foto de celular moderno tem 4 a 8 MB; cinquenta vendas por mês com anexo
 * seriam 300 MB por mês entrando no arquivo que precisa subir por internet de
 * loja.
 *
 * Reduzida, a mesma foto fica entre 100 e 300 KB — cem vezes menor, e ainda
 * legível de sobra, que é o único requisito: alguém precisa conseguir ler o
 * valor, a data e o nome de quem pagou.
 *
 * O trabalho é feito no navegador porque é onde o arquivo já está. Mandar 8 MB
 * pelo IPC para reduzir do outro lado seria pagar o transporte à toa — e no
 * segundo caixa esse transporte é a rede da loja.
 */

/**
 * O lado maior da imagem depois da redução.
 *
 * ⚠️ 1600px, e não os 240 da logo. Comprovante é para LER, não para
 * reconhecer: em 240px o valor e a chave viram borrão, e um comprovante
 * ilegível não prova nada — só ocupa espaço fingindo que sim.
 */
const LADO_MAXIMO = 1600

/**
 * Qualidade do JPEG.
 *
 * 0,82 é o ponto onde o texto de um print de aplicativo de banco ainda sai
 * limpo. Abaixo disso os números finos começam a criar sujeira ao redor, que é
 * exatamente onde a leitura importa.
 */
const QUALIDADE = 0.82

/**
 * Teto do PDF, em bytes.
 *
 * ⚠️ PDF não passa pelo canvas: não dá para reduzir sem uma biblioteca inteira
 * de leitura e reescrita do formato, que pesaria mais no aplicativo do que
 * economizaria no banco.
 *
 * Na prática não é problema. Comprovante de banco em PDF é texto, não imagem, e
 * fica entre 30 e 150 KB — bem MENOS que a foto reduzida. O teto existe para o
 * caso raro do PDF com página digitalizada em alta, e principalmente para
 * impedir que alguém anexe um extrato de 40 páginas achando que é comprovante.
 */
const PDF_MAXIMO = 2 * 1024 * 1024

export type ComprovantePreparado = {
  mime: string
  /** Base64 puro, sem o prefixo `data:...;base64,` — é o que o banco guarda. */
  dados: string
  nome_arquivo: string
  /** Tamanho aproximado em bytes, para mostrar na tela antes de enviar. */
  bytes: number
}

export function prepararComprovante(arquivo: File): Promise<ComprovantePreparado> {
  return new Promise((resolve, reject) => {
    const ehPdf = arquivo.type === 'application/pdf'

    if (!arquivo.type.startsWith('image/') && !ehPdf) {
      reject(new Error('Selecione uma imagem ou um PDF do comprovante.'))
      return
    }

    /*
     * ── O caminho do PDF: passa direto ─────────────────────────────────────
     *
     * É o formato que os bancos brasileiros geram no "salvar comprovante", e o
     * que chega por e-mail. Vai como veio, porque não há como reduzi-lo aqui —
     * e não precisa: ele já nasce menor que a foto.
     *
     * ⚠️ O tamanho é conferido ANTES de ler o arquivo inteiro. `arquivo.size`
     * vem do disco sem custo; esperar o FileReader terminar para só então
     * recusar faria o celular carregar 40 MB na memória para nada.
     */
    if (ehPdf) {
      if (arquivo.size > PDF_MAXIMO) {
        reject(
          new Error(
            `O PDF tem ${tamanhoLegivel(arquivo.size)} e o limite é 2 MB. ` +
              'Comprovante de banco costuma ter menos de 200 KB — confira se ' +
              'não é um extrato inteiro.'
          )
        )
        return
      }
      const leitorPdf = new FileReader()
      leitorPdf.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
      leitorPdf.onload = () => {
        const txt = String(leitorPdf.result)
        const base64 = txt.slice(txt.indexOf(',') + 1)
        resolve({
          mime: 'application/pdf',
          dados: base64,
          nome_arquivo: arquivo.name,
          bytes: Math.floor((base64.length * 3) / 4)
        })
      }
      leitorPdf.readAsDataURL(arquivo)
      return
    }

    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'))
      img.onload = () => {
        /*
         * `Math.min(1, ...)`: imagem já pequena passa intacta. Sem isso, um
         * print de 800px seria AMPLIADO para 1600 — mais bytes para os mesmos
         * pixels, e ainda por cima borrado.
         */
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height))
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

        /*
         * ⚠️ Fundo branco antes de desenhar.
         *
         * JPEG não tem transparência. Um PNG com fundo transparente — comum em
         * print recortado — sairia com o fundo PRETO, e texto escuro sobre
         * preto é um comprovante que não se lê.
         */
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, largura, altura)
        ctx.drawImage(img, 0, 0, largura, altura)

        // JPEG, e não PNG como na logo: aqui é foto, não desenho com poucas
        // cores, e não há transparência a preservar. A diferença é de 10x.
        const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE)
        const virgula = dataUrl.indexOf(',')
        const base64 = dataUrl.slice(virgula + 1)

        resolve({
          mime: 'image/jpeg',
          dados: base64,
          nome_arquivo: arquivo.name,
          bytes: Math.floor((base64.length * 3) / 4)
        })
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(arquivo)
  })
}

/** "312 KB", "1,4 MB" — para a tela dizer o tamanho sem carregar a imagem. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

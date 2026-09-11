interface JanelaImpressao {
  loadFile(caminho: string): Promise<unknown>
  isDestroyed(): boolean
  destroy(): void
}

export const TEMPO_CARREGAR_IMPRESSAO_MS = 30_000

/** A janela pertence a esta função até terminar de carregar, inclusive no erro. */
export async function carregarJanelaImpressao<T extends JanelaImpressao>(
  criar: () => T, caminho: string, pdf = false
): Promise<T> {
  // A criação pertence ao app desktop. O núcleo continua carregável no Node,
  // inclusive nos testes e no servidor da versão web.
  const janela = criar()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      janela.loadFile(caminho),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('O documento demorou demais para abrir para impressão.')), TEMPO_CARREGAR_IMPRESSAO_MS)
      })
    ])
    if (pdf) await new Promise((resolve) => setTimeout(resolve, 400))
    if (janela.isDestroyed()) throw new Error('A janela de impressão foi encerrada.')
    return janela
  } catch (erro) {
    if (!janela.isDestroyed()) janela.destroy()
    throw erro
  } finally {
    clearTimeout(timer)
  }
}

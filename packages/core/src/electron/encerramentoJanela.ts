/**
 * Fechar a janela principal encerra o aplicativo, mesmo quando uma impressão
 * deixou outra janela invisível aberta. Esperar apenas `window-all-closed`
 * mantém a trava de instância única sem nenhuma tela para o lojista recuperar.
 *
 * O evento `closed` ocorre DEPOIS da decisão e do backup ao fechar. Não
 * interrompemos o backup nem fechamos o turno do caixa ao encerrar a janela.
 */
export function registrarEncerramentoJanela(
  janela: { once(evento: 'closed', ouvinte: () => void): unknown },
  encerrar: () => void
): void {
  janela.once('closed', () => {
    if (process.platform !== 'darwin') encerrar()
  })
}

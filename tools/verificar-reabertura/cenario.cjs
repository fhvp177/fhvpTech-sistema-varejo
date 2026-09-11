// Processo Electron isolado. Nunca carrega o app nem o banco de uma loja.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const [pasta, modo, bundle] = process.argv.slice(2)
app.setPath('userData', path.join(pasta, 'dados'))
const registrar = evento => fs.appendFileSync(path.join(pasta, 'eventos.log'), `${process.pid} ${evento}\n`)
const sonda = modo === 'sonda'
if (!app.requestSingleInstanceLock()) {
  registrar(sonda ? 'sonda-bloqueada' : 'instancia-bloqueada')
  app.quit()
} else {
  app.whenReady().then(async () => {
    if (sonda) { registrar('sonda-abriu'); app.quit(); return }
    const principal = new BrowserWindow({ show: false })
    // Representa um driver que deixou a janela de impressão esperando para
    // sempre. O conteúdo é local e não envia nada a uma impressora.
    const impressao = new BrowserWindow({ show: false })
    await Promise.all([
      principal.loadURL('data:text/html,<p>Janela principal de teste</p>'),
      impressao.loadURL('data:text/html,<p>Documento de teste</p>')
    ])
    if (modo === 'corrigido') require(bundle).registrarEncerramentoJanela(principal, () => app.quit())
    principal.on('closed', () => registrar('principal-fechada'))
    registrar('duas-janelas')
    // Mesmo ponto do app depois da decisão/backup ao fechar.
    principal.destroy()
  })
  app.on('window-all-closed', () => app.quit())
}
app.on('will-quit', () => registrar('will-quit'))
// Só o controlador deste teste cria o sinal de limpeza. A saída forçada é
// restrita a este processo de teste, que não abriu banco ou dado de usuário.
setInterval(() => {
  if (fs.existsSync(path.join(pasta, 'encerrar-teste'))) app.exit(0)
}, 100).unref()

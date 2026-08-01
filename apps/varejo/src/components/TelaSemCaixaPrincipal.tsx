import { FC, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Loader2, WifiOff } from 'lucide-react'
import ModalConfigurarMaquina from '@/components/ModalConfigurarMaquina'

/**
 * Mostrada quando um caixa adicional não consegue começar.
 *
 * ── Por que ela existe ───────────────────────────────────────────────────────
 * O caixa adicional pergunta ao computador principal quem são os vendedores
 * antes de mostrar a tela de entrada. Sem resposta, não há o que listar — e
 * antes desta tela o sistema simplesmente ficava em "Verificando acesso..."
 * indefinidamente, sem dizer o motivo nem oferecer saída.
 *
 * A falta de saída era o pior: um caixa REMOVIDO no computador principal ficava
 * preso para sempre, porque a tela de reconfiguração vem depois do login, e o
 * login depende justamente de quem não responde mais.
 *
 * ── Os dois motivos, que pedem reações diferentes ────────────────────────────
 * **Sem conexão** costuma se resolver sozinho — Wi-Fi caiu, o computador da
 * loja está reiniciando. Por isso a tela tenta de novo sozinha e sai do ar
 * assim que a resposta volta, sem ninguém precisar clicar.
 *
 * **Acesso removido** não se resolve esperando. Aqui só há dois caminhos, e os
 * dois estão na tela: conectar de novo (com um código novo do computador
 * principal) ou deixar de ser caixa adicional.
 */

interface Props {
  /** Mensagem que veio da tentativa de falar com o computador principal. */
  motivo: string
  onTentarNovamente: () => void
}

const TelaSemCaixaPrincipal: FC<Props> = ({ motivo, onTentarNovamente }) => {
  const [configurando, setConfigurando] = useState(false)
  const [saindo, setSaindo] = useState(false)

  // "Perdeu o acesso" vem do computador principal respondendo que não conhece
  // mais este caixa. Esperar não adianta; qualquer outra coisa é rede.
  const removido = /perdeu o acesso/i.test(motivo)

  // Insiste sozinha enquanto for problema de rede: o operador não precisa ficar
  // clicando para descobrir que o Wi-Fi voltou.
  useEffect(() => {
    if (removido) return
    const t = setInterval(onTentarNovamente, 5000)
    return () => clearInterval(t)
  }, [removido, onTentarNovamente])

  async function deixarDeSerCaixa() {
    setSaindo(true)
    await window.api.multicaixa.sairDoModoTerminal()
    await window.api.multicaixa.reiniciarApp()
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <div className="text-center">
          <WifiOff className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h1 className="text-lg font-semibold text-slate-800">
            {removido ? 'Este caixa foi removido' : 'Sem conexão com o caixa principal'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {removido
              ? 'O computador principal não reconhece mais este caixa. Para voltar a usá-lo, conecte novamente com um código novo.'
              : 'Este computador trabalha com os dados do computador principal e não consegue falar com ele agora. Confira se ele está ligado e na mesma rede.'}
          </p>
        </div>

        {!removido && (
          <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Tentando novamente sozinho — a tela sai daqui quando a conexão voltar.
          </p>
        )}

        <div className="space-y-2">
          {!removido && (
            <Button variant="outline" className="w-full" onClick={onTentarNovamente}>
              Tentar agora
            </Button>
          )}
          <Button className="w-full" onClick={() => setConfigurando(true)}>
            Conectar a um caixa principal
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-500"
            disabled={saindo}
            onClick={deixarDeSerCaixa}
          >
            {saindo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Deixar de ser caixa adicional
          </Button>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Ao deixar de ser caixa adicional, este computador volta a funcionar sozinho, com os
          próprios dados. Nada é apagado no computador principal.
        </p>
      </div>

      {configurando && <ModalConfigurarMaquina onFechar={() => setConfigurando(false)} />}
    </div>
  )
}

export default TelaSemCaixaPrincipal

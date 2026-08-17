import { FC, useState } from 'react'
import { CalendarClock, RefreshCw, Unlock } from 'lucide-react'
import logoEmpresa from './assets/logo.png'
import type { BloqueioRelogio } from '../lib/relogioBloqueio'

/**
 * Tela do guardião de relógio.
 *
 * Antes, este bloqueio caía na tela de ativação de licença — o lojista via
 * "insira sua chave" e concluía que tinha perdido tudo, quando na verdade os
 * dados estavam inteiros e só a data estava errada. Esta tela diz o que
 * realmente aconteceu e oferece a saída.
 *
 * Dois caminhos, decididos no main (ver relogioLogica.decidirTratamento):
 *  - o servidor desmentiu a data da máquina → só resta ajustar o Windows;
 *  - sem internet, ninguém pôde conferir → oferece o destravamento manual,
 *    que substitui a visita do suporte ao %APPDATA% do cliente.
 */
type Props = BloqueioRelogio & {
  subtitulo: string
  /**
   * Marca do nicho. Mesma ideia do `subtitulo`: cada app tem a sua arte, e esta
   * tela é compartilhada. Sem a prop, cai na marca original — que é o que o
   * varejo quer.
   */
  logo?: string
  /** Revalida a licença — usado depois de ajustar a data ou destravar. */
  onTentarNovamente: () => Promise<void> | void
}

function formatar(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

const RelogioIncorreto: FC<Props> = ({
  tratamento,
  horaLocalISO,
  horaServidorISO,
  subtitulo,
  logo,
  onTentarNovamente
}) => {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const tentarNovamente = async () => {
    setOcupado(true)
    setErro('')
    await onTentarNovamente()
    setOcupado(false)
  }

  const destravar = async () => {
    setOcupado(true)
    setErro('')
    const resp = await window.api.licenca.destravarRelogio()
    if (resp.success && resp.data.destravado) {
      await onTentarNovamente()
    } else {
      setErro(
        resp.success
          ? 'Não foi possível destravar automaticamente. Entre em contato com o suporte.'
          : resp.error
      )
    }
    setOcupado(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <img src={logo ?? logoEmpresa} alt="FHVP Tech" className="w-24 h-24 mx-auto mb-3 object-contain" />
          <p className="text-slate-500 text-sm">{subtitulo}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          <div className="flex items-start gap-2">
            <CalendarClock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 text-sm font-medium">A data do computador está errada</p>
              <p className="text-amber-700 text-sm mt-1">
                Seus dados estão salvos e intactos. O sistema só não abre enquanto a data não
                confere.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mb-5 text-sm">
          <div className="flex justify-between px-3 py-2">
            <span className="text-slate-500">Neste computador</span>
            <span className="font-medium text-slate-800">{formatar(horaLocalISO)}</span>
          </div>
          {horaServidorISO && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-slate-500">Data correta</span>
              <span className="font-medium text-emerald-700">{formatar(horaServidorISO)}</span>
            </div>
          )}
        </div>

        {tratamento === 'relogio-errado-mesmo' ? (
          <ol className="text-sm text-slate-600 space-y-1.5 mb-5 list-decimal list-inside">
            <li>Clique com o botão direito no relógio do Windows.</li>
            <li>Escolha &quot;Ajustar data/hora&quot;.</li>
            <li>Ligue &quot;Definir horário automaticamente&quot; e clique em &quot;Sincronizar agora&quot;.</li>
            <li>Volte aqui e clique no botão abaixo.</li>
          </ol>
        ) : (
          <p className="text-sm text-slate-600 mb-5">
            Não foi possível conferir a data pela internet. Se a data acima está correta, use o
            botão &quot;Destravar mesmo assim&quot;.
          </p>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-700 text-sm">{erro}</p>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={tentarNovamente}
            disabled={ocupado}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${ocupado ? 'animate-spin' : ''}`} />
            Já ajustei a data, tentar novamente
          </button>

          {tratamento === 'sem-conferencia' && (
            <button
              onClick={destravar}
              disabled={ocupado}
              className="w-full flex items-center justify-center gap-2 border border-slate-300 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Unlock className="w-4 h-4" />
              Destravar mesmo assim
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Precisa de ajuda? Suporte:{' '}
          <span className="font-semibold text-slate-600 whitespace-nowrap">(85) 9.2187-1975</span>
        </p>
      </div>
    </div>
  )
}

export default RelogioIncorreto

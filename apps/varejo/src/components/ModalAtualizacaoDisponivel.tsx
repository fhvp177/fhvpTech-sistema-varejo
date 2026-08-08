import { FC, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'

type EventoAtualizacao = { tipo: string; dados?: unknown }
type DadosPronta = { versao: string; notas: string | null }

/**
 * Quanto esperamos o app fechar sozinho depois de disparar o instalador.
 *
 * O relógio só começa quando a chamada volta — ou seja, o backup já terminou e
 * o que falta é o Windows abrir o instalador e o app morrer, coisa de segundos.
 * Antes deste limite existir, a tela tinha uma saída só: o app fechar. Qualquer
 * coisa que impedisse isso deixava o lojista olhando uma rodinha para sempre,
 * sem uma palavra sobre o que houve — foi o que aconteceu no segundo caixa.
 */
const LIMITE_ESPERA_MS = 30_000

const ModalAtualizacaoDisponivel: FC = () => {
  const [versao, setVersao] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoBackup, setAvisoBackup] = useState<string | null>(null)

  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  // O ouvinte de eventos é registrado uma vez só; sem o espelho em ref ele
  // enxergaria para sempre o `instalando` do primeiro render.
  const instalandoRef = useRef(false)

  const cancelarRelogio = (): void => {
    if (relogio.current) {
      clearTimeout(relogio.current)
      relogio.current = null
    }
  }

  const falhar = (mensagem: string): void => {
    cancelarRelogio()
    instalandoRef.current = false
    setInstalando(false)
    setErro(mensagem)
  }

  useEffect(() => {
    // Se uma atualização já estava baixada antes desta sessão abrir, mostra de cara
    window.api.atualizacao.obterInfo().then((resp) => {
      if (resp.success && resp.data.versaoBaixada) {
        setVersao(resp.data.versaoBaixada)
        setAberto(true)
      }
    })

    // Escuta novos eventos de download concluído
    const off = window.api.atualizacao.onEvento((evt: EventoAtualizacao) => {
      if (evt.tipo === 'pronta') {
        const dados = evt.dados as DadosPronta
        setVersao(dados.versao)
        setAberto(true)
        return
      }
      // Erro DURANTE a instalação é a única notícia que chega quando o
      // instalador não sobe (antivírus barrando, arquivo sumido do cache):
      // o modo silencioso não mostra janela nativa nenhuma. Fora da
      // instalação, 'erro' é verificação de rotina falhando em segundo plano
      // e não tem por que interromper ninguém.
      if (evt.tipo === 'erro' && instalandoRef.current) {
        const dados = evt.dados as { mensagem?: string } | undefined
        falhar(dados?.mensagem ?? 'Não foi possível iniciar a instalação.')
      }
    })

    return () => {
      off()
      cancelarRelogio()
    }
  }, [])

  const reiniciarAgora = async (): Promise<void> => {
    setErro(null)
    setAvisoBackup(null)
    instalandoRef.current = true
    setInstalando(true)

    try {
      const resp = await window.api.atualizacao.instalar()

      if (!resp.success) {
        falhar(resp.error)
        return
      }

      // 'nao-se-aplica' é o segundo caixa, que não tem banco próprio: não há
      // backup a fazer e isso está certo, então não vira aviso. Só 'falhou' —
      // máquina que TEM dados e não conseguiu guardá-los — merece a tarja.
      const backup = resp.data?.backup
      if (backup?.estado === 'falhou') {
        setAvisoBackup(backup.erro)
      }

      relogio.current = setTimeout(() => {
        falhar(
          'A instalação não começou. O sistema continua funcionando normalmente ' +
            'nesta versão — avise o suporte para atualizar manualmente.'
        )
      }, LIMITE_ESPERA_MS)
    } catch (e) {
      falhar((e as Error)?.message ?? 'Falha inesperada ao instalar a atualização.')
    }
  }

  if (!versao) return null

  const titulo = erro
    ? 'Não foi possível atualizar'
    : instalando
      ? 'Atualizando o sistema'
      : 'Atualização disponível'

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!instalando) setAberto(o) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {erro ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <Download className="anim-pop w-5 h-5 text-blue-600" />
            )}
            {titulo}
          </DialogTitle>
        </DialogHeader>

        {erro ? (
          <>
            <div className="space-y-2 text-sm">
              <p>{erro}</p>
              <p className="text-muted-foreground">
                Seus dados estão intactos e nada foi alterado.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAberto(false)}>
                Fechar
              </Button>
              <Button onClick={reiniciarAgora}>Tentar de novo</Button>
            </DialogFooter>
          </>
        ) : instalando ? (
          <div className="space-y-3 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <p className="text-sm text-muted-foreground">
                Instalando a nova versão… o sistema reabre sozinho em instantes.
              </p>
            </div>
            {avisoBackup && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                O backup automático desta atualização não pôde ser feito
                ({avisoBackup}). A instalação segue mesmo assim.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>
                Uma nova versão do sistema (<span className="font-semibold">{versao}</span>) foi
                baixada e está pronta para ser instalada.
              </p>
              <p className="text-muted-foreground">
                A instalação leva poucos segundos e o sistema reabre automaticamente. Seus dados
                são preservados.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAberto(false)}>
                Mais tarde
              </Button>
              <Button onClick={reiniciarAgora}>Reiniciar e instalar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ModalAtualizacaoDisponivel

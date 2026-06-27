import { FC, useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
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

const ModalAtualizacaoDisponivel: FC = () => {
  const [versao, setVersao] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [instalando, setInstalando] = useState(false)

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
      }
    })
    return off
  }, [])

  const reiniciarAgora = async (): Promise<void> => {
    setInstalando(true)
    await window.api.atualizacao.instalar()
    // O app vai fechar antes de chegar aqui, mas mantém o estado por garantia
  }

  if (!versao) return null

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!instalando) setAberto(o) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            {instalando ? 'Atualizando o sistema' : 'Atualização disponível'}
          </DialogTitle>
        </DialogHeader>

        {instalando ? (
          <div className="flex items-center gap-3 py-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
            <p className="text-sm text-muted-foreground">
              Instalando a nova versão… o sistema reabre sozinho em instantes.
            </p>
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

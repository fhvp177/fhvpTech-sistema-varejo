import { FC, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SinoNotificacoes, { type NotificacaoItem } from '@fhvptech/core/ui/SinoNotificacoes'
import ModalDetalheNotificacao, { type DetalheNotificacao } from './ModalDetalheNotificacao'
import { obterDadosLoja } from '@/utils/dadosLoja'

// WhatsApp do suporte já com a deixa do plano de backup em nuvem (o gancho que
// aparece quando o backup falha / a pasta enche). O plano em nuvem em si ainda
// não existe tecnicamente — por ora é só abrir a conversa com o suporte.
const URL_SUPORTE_NUVEM = `https://wa.me/5585921871975?text=${encodeURIComponent(
  'Olá! Recebi um alerta de backup no Sistema FHVP Tech e gostaria de saber sobre o plano com backup em nuvem.'
)}`

type Props = {
  onRenovarComPix: () => void
}

// Atualiza o sino a cada 3 min e ao focar a janela — o "ao vivo" sem pesar.
const INTERVALO_MS = 3 * 60 * 1000

// Avisos cujo clique abre um popup com os itens exatos por trás dele, em vez de
// só navegar pra uma tela genérica.
const CHAVES_DETALHE = new Set([
  'venc-hoje', 'vence-amanha', 'inadimplentes', 'estoque-baixo', 'produtos-parados'
])

const SinoNotificacoesHost: FC<Props> = ({ onRenovarComPix }) => {
  const navigate = useNavigate()
  const [itens, setItens] = useState<NotificacaoItem[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [detalhe, setDetalhe] = useState<DetalheNotificacao | null>(null)
  const [nomeLoja, setNomeLoja] = useState('')

  const carregar = useCallback(async () => {
    const resp = await window.api.notificacoes.listar()
    if (resp.success) {
      setItens(resp.data.itens)
      setNaoLidas(resp.data.naoLidas)
    }
  }, [])

  useEffect(() => {
    carregar()
    const intervalo = setInterval(carregar, INTERVALO_MS)
    const aoFocar = () => carregar()
    window.addEventListener('focus', aoFocar)
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('focus', aoFocar)
    }
  }, [carregar])

  // Nome da loja (white-label) pra compor a mensagem de cobrança no WhatsApp.
  useEffect(() => {
    obterDadosLoja()
      .then((l) => setNomeLoja(l.nome))
      .catch(() => {})
  }, [])

  // Abrir o sino marca tudo como lido (zera a bolinha); os avisos continuam na lista.
  const onToggle = useCallback(async () => {
    if (aberto) {
      setAberto(false)
      return
    }
    setAberto(true)
    await window.api.notificacoes.marcarLidas()
    setNaoLidas(0)
  }, [aberto])

  const onClicar = useCallback(
    async (n: NotificacaoItem) => {
      setAberto(false)
      if (n.acao === 'pix') {
        onRenovarComPix()
      } else if (n.acao === 'instalar-update') {
        window.api.atualizacao.instalar()
      } else if (n.acao === 'suporte') {
        window.open(URL_SUPORTE_NUVEM, '_blank', 'noopener,noreferrer')
      } else if (CHAVES_DETALHE.has(n.chave)) {
        const resp = await window.api.notificacoes.detalhe(n.chave)
        if (resp.success && resp.data) setDetalhe(resp.data)
      } else if (n.rota) {
        navigate(n.rota)
      }
    },
    [navigate, onRenovarComPix]
  )

  const onDispensar = useCallback(
    async (id: number) => {
      await window.api.notificacoes.dispensar(id)
      carregar()
    },
    [carregar]
  )

  return (
    <>
      <SinoNotificacoes
        itens={itens}
        naoLidas={naoLidas}
        aberto={aberto}
        onToggle={onToggle}
        onFechar={() => setAberto(false)}
        onClicar={onClicar}
        onDispensar={onDispensar}
      />
      <ModalDetalheNotificacao
        detalhe={detalhe}
        nomeLoja={nomeLoja}
        onFechar={() => setDetalhe(null)}
        onVerProdutos={() => {
          setDetalhe(null)
          navigate('/produtos')
        }}
      />
    </>
  )
}

export default SinoNotificacoesHost

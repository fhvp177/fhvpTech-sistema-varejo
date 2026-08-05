import { FC, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PrimeirosPassos, { type PassoChecklist } from '@fhvptech/core/ui/PrimeirosPassos'

export type ProgressoOnboarding = {
  temProduto: boolean
  temCliente: boolean
  temVenda: boolean
  lojaConfigurada: boolean
  /** Só no plano Pro: habilitação da nota fiscal concluída. */
  fiscalConfigurado?: boolean
}

export type EstadoOnboarding = {
  guiaVisto: boolean
  checklistDispensada: boolean
  progresso: ProgressoOnboarding
}

// Telas onde a checklist aparece: a inicial do gerente (Dashboard, '/') e a de
// Produtos (que é a inicial na edição básica, sem dashboard). Fora delas fica
// escondida pra não atrapalhar a operação.
const ROTAS_VISIVEIS = ['/', '/produtos']

type Props = {
  estado: EstadoOnboarding | null
  ehDono: boolean
  pdvAtivo: boolean
  onRecarregar: () => void
  onDispensar: () => void
}

const ChecklistPrimeirosPassos: FC<Props> = ({
  estado, ehDono, pdvAtivo, onRecarregar, onDispensar
}) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Reavalia o progresso ao trocar de tela (ex.: voltou de cadastrar um produto),
  // pra checar/desmarcar os passos sem precisar reabrir o sistema.
  useEffect(() => {
    if (ehDono) onRecarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (!ehDono || pdvAtivo || !estado || estado.checklistDispensada) return null
  if (!ROTAS_VISIVEIS.includes(pathname)) return null

  const { progresso } = estado
  const passos: PassoChecklist[] = [
    {
      id: 'produto',
      rotulo: 'Cadastrar seu primeiro produto',
      concluido: progresso.temProduto,
      onIr: () => navigate('/produtos')
    },
    {
      id: 'loja',
      rotulo: 'Configurar os dados da loja',
      concluido: progresso.lojaConfigurada,
      onIr: () => navigate('/configuracoes')
    },
    {
      id: 'cliente',
      rotulo: 'Cadastrar seu primeiro cliente',
      concluido: progresso.temCliente,
      onIr: () => navigate('/clientes')
    },
    {
      id: 'venda',
      rotulo: 'Fazer a sua primeira venda',
      concluido: progresso.temVenda,
      onIr: () => navigate('/vendas')
    },
    // Nota fiscal só existe no plano Pro — no Básico o passo nem aparece.
    ...(__FEAT_NFE__
      ? [
          {
            id: 'fiscal',
            rotulo: 'Habilitar a nota fiscal',
            concluido: Boolean(progresso.fiscalConfigurado),
            onIr: () => navigate('/fiscal')
          }
        ]
      : [])
  ]

  return (
    <div className="px-8 pt-6">
      <PrimeirosPassos passos={passos} onDispensar={onDispensar} />
    </div>
  )
}

export default ChecklistPrimeirosPassos

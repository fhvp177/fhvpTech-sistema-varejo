import { FC, ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useSessao } from '@/App'

type Props = {
  titulo: string
  children: ReactNode
}

// Bloqueia a rota inteira pra quem não é dono. Mostra mensagem amigável
// com explicação. Usado em Dashboard, Configurações, Restauração.
const RotaSomenteDono: FC<Props> = ({ titulo, children }) => {
  const { ehDono, vendedor } = useSessao()
  if (ehDono) return <>{children}</>

  return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{titulo} bloqueado</h2>
        <p className="text-sm text-muted-foreground">
          Esta tela é restrita ao dono da loja. Se precisar acessar,
          {vendedor ? ` peça pra um dono entrar com a conta dele.` : ' faça login como dono.'}
        </p>
      </div>
    </div>
  )
}

export default RotaSomenteDono

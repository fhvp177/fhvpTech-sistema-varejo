import { FC, useState } from 'react'
import { ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import ConfigSeguranca from '../components/ConfigSeguranca'
import CadastroUsuarios from '../components/CadastroUsuarios'

type Aba = 'seguranca' | 'usuarios'

const Configuracoes: FC = () => {
  const [aba, setAba] = useState<Aba>('seguranca')

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Segurança da sua conta e gestão dos usuários da clínica.
      </p>

      <div className="flex gap-1 border-b mb-5">
        <TabBtn ativo={aba === 'seguranca'} onClick={() => setAba('seguranca')} icon={ShieldCheck} label="Segurança" />
        <TabBtn ativo={aba === 'usuarios'} onClick={() => setAba('usuarios')} icon={Users} label="Usuários" />
      </div>

      {aba === 'seguranca' ? <ConfigSeguranca /> : <CadastroUsuarios />}
    </div>
  )
}

const TabBtn: FC<{ ativo: boolean; onClick: () => void; icon: LucideIcon; label: string }> = ({
  ativo,
  onClick,
  icon: Icon,
  label
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
      ativo
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
)

export default Configuracoes

import { FC, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { AlertTriangle, ArrowLeft, Download, Loader2, MonitorSmartphone, X } from 'lucide-react'

/**
 * Alcançável a partir da tela de login, e é aí que está o motivo de existir:
 * um computador recém-instalado não tem vendedores para listar, então ninguém
 * consegue logar nele. Se estas duas ações morassem nas Configurações, seriam
 * inalcançáveis justamente nas máquinas que precisam delas.
 *
 * As duas ações são independentes de propósito. Trazer os dados NÃO é
 * preparação para virar caixa adicional: o caixa adicional lê tudo ao vivo do
 * computador principal e não guarda cópia. Clonar antes de conectar deixaria
 * uma cópia parada envelhecendo sem servir para nada.
 */

type Tela = 'escolha' | 'clonar' | 'conectar'

interface Props {
  onFechar: () => void
}

const ModalConfigurarMaquina: FC<Props> = ({ onFechar }) => {
  const [tela, setTela] = useState<Tela>('escolha')

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {tela !== 'escolha' && (
              <button
                onClick={() => setTela('escolha')}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-slate-800">
              {tela === 'escolha' && 'Configurar este computador'}
              {tela === 'clonar' && 'Trazer os dados de outro computador'}
              {tela === 'conectar' && 'Conectar como caixa adicional'}
            </h2>
          </div>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {tela === 'escolha' && <Escolha onEscolher={setTela} />}
        {tela === 'clonar' && <FormClonar />}
        {tela === 'conectar' && <FormConectar />}
      </div>
    </div>
  )
}

const Escolha: FC<{ onEscolher: (t: Tela) => void }> = ({ onEscolher }) => (
  <div className="space-y-3">
    <button
      onClick={() => onEscolher('clonar')}
      className="w-full text-left border rounded-lg p-4 hover:bg-slate-50 transition-colors"
    >
      <p className="font-medium text-sm flex items-center gap-2">
        <Download className="w-4 h-4 text-blue-600" />
        Trazer os dados de outro computador
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Copia produtos, clientes, vendas e configurações de outro computador para este. Use ao
        instalar numa máquina nova ou ao trocar o computador da loja.
      </p>
    </button>

    <button
      onClick={() => onEscolher('conectar')}
      className="w-full text-left border rounded-lg p-4 hover:bg-slate-50 transition-colors"
    >
      <p className="font-medium text-sm flex items-center gap-2">
        <MonitorSmartphone className="w-4 h-4 text-blue-600" />
        Conectar como caixa adicional
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Este computador passa a trabalhar nos dados de outro, ao vivo. Nada fica guardado aqui, e
        ele só funciona enquanto os dois estiverem se enxergando.
      </p>
    </button>
  </div>
)

/** Campos comuns às duas operações: endereço e código de 6 dígitos. */
const CamposConexao: FC<{
  endereco: string
  setEndereco: (v: string) => void
  codigo: string
  setCodigo: (v: string) => void
  ocupado: boolean
}> = ({ endereco, setEndereco, codigo, setCodigo, ocupado }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label htmlFor="endereco">Endereço do outro computador</Label>
      <Input
        id="endereco"
        value={endereco}
        onChange={(e) => setEndereco(e.target.value)}
        placeholder="192.168.0.10"
        disabled={ocupado}
      />
    </div>
    <div>
      <Label htmlFor="codigo">Código</Label>
      <Input
        id="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        className="font-mono tracking-widest"
        disabled={ocupado}
      />
    </div>
  </div>
)

const FormClonar: FC = () => {
  const [endereco, setEndereco] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [exigeSenha, setExigeSenha] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState<string | null>(null)

  // Só pede a senha quando esta máquina já tem uma. Em instalação nova não
  // existe senha nenhuma, e pedi-la seria um beco sem saída.
  useEffect(() => {
    window.api.multicaixa.exigeSenhaParaReceber().then((r) => {
      if (r.success) setExigeSenha(r.data)
    })
  }, [])

  async function trazer() {
    setOcupado(true)
    setErro(null)
    const r = await window.api.multicaixa.receberBanco(endereco, codigo, senha)
    if (!r.success) {
      setErro(r.error)
      setOcupado(false)
      return
    }
    setPronto(r.data.copiaDeSeguranca ?? null)
    setOcupado(false)
  }

  if (pronto !== null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Os dados foram trazidos com sucesso. O sistema precisa reiniciar para usá-los.
        </p>
        <p className="text-xs text-slate-500">
          O que havia neste computador antes foi guardado na pasta de backups, caso precise voltar.
        </p>
        <Button className="w-full" onClick={() => window.api.multicaixa.reiniciarApp()}>
          Reiniciar agora
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Isto substitui tudo que existe neste computador.</span>{' '}
          Produtos, clientes e vendas daqui serão trocados pelos do outro. Uma cópia do estado
          atual é guardada na pasta de backups antes de qualquer coisa.
        </p>
      </div>

      <p className="text-xs text-slate-500">
        No outro computador, abra Configurações → Multicaixa e gere um código de cópia. Depois
        informe abaixo o endereço e o código que aparecerem lá.
      </p>

      <CamposConexao
        endereco={endereco}
        setEndereco={setEndereco}
        codigo={codigo}
        setCodigo={setCodigo}
        ocupado={ocupado}
      />

      {exigeSenha && (
        <div>
          <Label htmlFor="senhaRestauracao">Senha de restauração deste computador</Label>
          <Input
            id="senhaRestauracao"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={ocupado}
          />
          <p className="text-xs text-slate-500 mt-1">
            É a mesma senha usada para restaurar backups. Ela protege os dados que já existem
            aqui.
          </p>
        </div>
      )}

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{erro}</p>
      )}

      <Button
        className="w-full"
        disabled={
          ocupado || codigo.length !== 6 || !endereco.trim() || (exigeSenha && !senha)
        }
        onClick={trazer}
      >
        {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {ocupado ? 'Trazendo os dados…' : 'Trazer os dados'}
      </Button>
      {ocupado && (
        <p className="text-xs text-slate-500 text-center">
          Pode demorar alguns minutos em lojas com muito histórico. Não feche o sistema.
        </p>
      )}
    </div>
  )
}

const FormConectar: FC = () => {
  const [endereco, setEndereco] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  async function conectar() {
    setOcupado(true)
    setErro(null)
    const r = await window.api.multicaixa.conectarComoTerminal(endereco, codigo, nome)
    if (!r.success) {
      setErro(r.error)
      setOcupado(false)
      return
    }
    setPronto(true)
    setOcupado(false)
  }

  if (pronto) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Conectado. O sistema precisa reiniciar para passar a trabalhar como caixa adicional.
        </p>
        <Button className="w-full" onClick={() => window.api.multicaixa.reiniciarApp()}>
          Reiniciar agora
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        No computador principal, abra Configurações → Multicaixa, ligue a opção e gere um código
        de conexão. Este computador não guardará dados: ele consulta o principal a cada tela, e
        precisa estar em contato com ele para funcionar.
      </p>

      <CamposConexao
        endereco={endereco}
        setEndereco={setEndereco}
        codigo={codigo}
        setCodigo={setCodigo}
        ocupado={ocupado}
      />

      <div>
        <Label htmlFor="nome">Nome deste caixa (opcional)</Label>
        <Input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value.slice(0, 60))}
          placeholder="Caixa 2"
          disabled={ocupado}
        />
      </div>

      {erro && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{erro}</p>
      )}

      <Button
        className="w-full"
        disabled={ocupado || codigo.length !== 6 || !endereco.trim()}
        onClick={conectar}
      >
        {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {ocupado ? 'Conectando…' : 'Conectar'}
      </Button>
    </div>
  )
}

export default ModalConfigurarMaquina

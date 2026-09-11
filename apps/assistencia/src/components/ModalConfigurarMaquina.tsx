import { FC, useEffect, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { AlertTriangle, ArrowLeft, Download, Loader2, MonitorSmartphone, X } from 'lucide-react'
import { CLASSE_IP, CLASSE_PORTA } from '@/utils/mascaras'

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

/**
 * Campos comuns às duas operações: endereço, porta e código de 6 dígitos.
 *
 * ── Por que o endereço tem máscara ──────────────────────────────────────────
 * Era campo de texto livre. Quem digita está lendo um número na tela do OUTRO
 * computador, muitas vezes agachado atrás do balcão, e precisava acertar na mão
 * os três pontos do endereço e os dois-pontos da porta. Errar um deles devolve
 * "não foi possível falar com o caixa principal", que não diz qual caractere
 * está errado — e aí a pessoa confere o número, que está certo, e desiste.
 *
 * Agora são só dígitos: os pontos aparecem sozinhos e a porta é campo separado.
 *
 * ── Por que a porta continua existindo, e vazia ─────────────────────────────
 * Ela é fixa (4877) em praticamente toda instalação, então o normal é não
 * encostar nela: vazia, quem resolve é o `normalizarEndereco` lá no processo
 * principal, que aplica a porta configurada nesta máquina.
 *
 * ⚠️ O campo não some porque a tela do computador principal MOSTRA a porta ao
 * lado do endereço. Escondê-la deixaria à vista um número que não tem onde ser
 * digitado — e numa loja onde ela foi mudada, não haveria saída pela interface.
 */
const CamposConexao: FC<{
  endereco: string
  setEndereco: (v: string) => void
  porta: string
  setPorta: (v: string) => void
  codigo: string
  setCodigo: (v: string) => void
  ocupado: boolean
}> = ({ endereco, setEndereco, porta, setPorta, codigo, setCodigo, ocupado }) => (
  <div className="space-y-3">
    <div>
      <Label htmlFor="endereco">Endereço do outro computador</Label>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <IMaskInput
          id="endereco"
          {...CLASSE_IP}
          value={endereco}
          onAccept={(v: string) => setEndereco(v)}
          disabled={ocupado}
        />
        <IMaskInput
          id="porta"
          {...CLASSE_PORTA}
          value={porta}
          onAccept={(v: string) => setPorta(v)}
          disabled={ocupado}
          aria-label="Porta"
        />
      </div>
      <p className="text-xs text-slate-500 mt-1">
        Os dois números aparecem juntos na tela do computador principal, no formato
        192.168.0.10:4877. Digite só os números; se a porta for a de sempre, pode deixar em branco.
      </p>
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

/**
 * Junta o que os dois campos têm, no formato que o processo principal espera.
 *
 * Porta em branco sai de fora de propósito: `normalizarEndereco` completa com a
 * porta desta instalação, e mandar "192.168.0.10:" faria a URL não abrir.
 */
function enderecoCompleto(ip: string, porta: string): string {
  const limpo = ip.trim()
  const p = porta.trim()
  return p ? `${limpo}:${p}` : limpo
}

const FormClonar: FC = () => {
  const [endereco, setEndereco] = useState('')
  const [porta, setPorta] = useState('')
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
    const r = await window.api.multicaixa.receberBanco(enderecoCompleto(endereco, porta), codigo, senha)
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
        porta={porta}
        setPorta={setPorta}
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
  const [porta, setPorta] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  async function conectar() {
    setOcupado(true)
    setErro(null)
    const r = await window.api.multicaixa.conectarComoTerminal(enderecoCompleto(endereco, porta), codigo, nome)
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
        porta={porta}
        setPorta={setPorta}
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

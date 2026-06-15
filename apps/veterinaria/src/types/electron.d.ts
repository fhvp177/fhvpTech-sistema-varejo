// Tipos da API exposta pelo preload via contextBridge.
// Mantido em sync com electron/preload.ts. A vet usa os canais GENÉRICOS de auth
// do @fhvptech/core (usuario, papel 'dono' | 'funcionario').

// Injetado em build-time pelo electron.vite.config.ts a partir de package.json.version
declare const __APP_VERSION__: string

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
}

type CobrancaPix = {
  txid: string
  clienteId: string
  valorCentavos: number
  diasContratados: number
  status: 'pendente' | 'paga' | 'expirada'
  qrcode: string
  qrcodeBase64: string
  criadaEm: string
  expiraEm: string
  pagaEm?: string
  chaveLicencaGerada?: string
}

type SessaoUsuario = {
  id: number
  nome: string
  ativo: number
  papel: 'dono' | 'funcionario'
  email: string | null
  tem_pin: number
}

interface Window {
  api: {
    licenca: {
      validar: () => Promise<RespostaIPC<StatusLicenca>>
      ativar: (chave: string) => Promise<RespostaIPC<StatusLicenca>>
      obterClienteId: () => Promise<RespostaIPC<string | null>>
      criarCobranca: (dados: {
        diasContratados?: number
        valorCentavos?: number
      }) => Promise<RespostaIPC<CobrancaPix>>
      consultarCobranca: (txid: string) => Promise<RespostaIPC<CobrancaPix>>
    }
    auth: {
      obterStatus: () => Promise<
        RespostaIPC<{ pinConfigurado: boolean; autoLockMinutos: number }>
      >
      listarUsuariosParaLogin: () => Promise<
        RespostaIPC<
          Array<{ id: number; nome: string; papel: 'dono' | 'funcionario'; tem_pin: number }>
        >
      >
      login: (
        usuarioId: number,
        pin: string
      ) => Promise<RespostaIPC<{ ok: boolean; sessao?: SessaoUsuario | null }>>
      logout: () => Promise<RespostaIPC>
      sessaoAtual: () => Promise<RespostaIPC<SessaoUsuario | null>>
      elevar: (pin: string) => Promise<RespostaIPC<{ ok: boolean; donoId: number | null }>>
      cadastrarPinPrimeiroUso: (usuarioId: number, pin: string) => Promise<RespostaIPC>
      alterarPin: (
        usuarioId: number,
        pinAtual: string,
        pinNovo: string
      ) => Promise<RespostaIPC>
      solicitarRecuperacao: (email: string) => Promise<RespostaIPC<{ enviado: boolean }>>
      redefinirComCodigo: (
        email: string,
        codigo: string,
        novoPin: string
      ) => Promise<RespostaIPC<{ ok: boolean; sessao?: SessaoUsuario | null }>>
      setarAutoLock: (minutos: number) => Promise<RespostaIPC>
    }
  }
}

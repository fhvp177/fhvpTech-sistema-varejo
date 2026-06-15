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

type Tutor = {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  data_cadastro: string
  pets_count: number
}

type Pet = {
  id: number
  tutor_id: number
  nome: string
  especie: string | null
  raca: string | null
  nascimento: string | null
  data_cadastro: string
}

type Servico = { id: number; nome: string; preco: number; ativo: number; data_cadastro: string }

type Produto = {
  id: number
  nome: string
  preco: number
  estoque: number
  ativo: number
  data_cadastro: string
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
    usuarios: {
      listar: () => Promise<RespostaIPC<SessaoUsuario[]>>
      criar: (dados: { nome: string; email?: string | null }) => Promise<
        RespostaIPC<{ id: number; nome: string }>
      >
      atualizar: (
        id: number,
        dados: { nome?: string; email?: string | null }
      ) => Promise<RespostaIPC>
      alternarAtivo: (id: number, ativo: boolean) => Promise<RespostaIPC>
      alterarPapel: (id: number, papel: 'dono' | 'funcionario') => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      redefinirPin: (id: number, novoPin: string) => Promise<RespostaIPC>
    }
    tutores: {
      listar: () => Promise<RespostaIPC<Tutor[]>>
      criar: (dados: {
        nome: string
        telefone?: string | null
        email?: string | null
      }) => Promise<RespostaIPC<{ id: number }>>
      atualizar: (
        id: number,
        dados: { nome?: string; telefone?: string | null; email?: string | null }
      ) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    pets: {
      listar: (tutorId: number) => Promise<RespostaIPC<Pet[]>>
      criar: (
        tutorId: number,
        dados: {
          nome: string
          especie?: string | null
          raca?: string | null
          nascimento?: string | null
        }
      ) => Promise<RespostaIPC<{ id: number }>>
      atualizar: (
        id: number,
        dados: {
          nome?: string
          especie?: string | null
          raca?: string | null
          nascimento?: string | null
        }
      ) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    servicos: {
      listar: () => Promise<RespostaIPC<Servico[]>>
      criar: (dados: { nome: string; preco: number }) => Promise<RespostaIPC<{ id: number }>>
      atualizar: (id: number, dados: { nome?: string; preco?: number }) => Promise<RespostaIPC>
      alternarAtivo: (id: number, ativo: boolean) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    produtos: {
      listar: () => Promise<RespostaIPC<Produto[]>>
      criar: (dados: {
        nome: string
        preco: number
        estoque?: number
      }) => Promise<RespostaIPC<{ id: number }>>
      atualizar: (
        id: number,
        dados: { nome?: string; preco?: number; estoque?: number }
      ) => Promise<RespostaIPC>
      alternarAtivo: (id: number, ativo: boolean) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
  }
}

/**
 * Identidade da máquina e o passe de vaga (limite de dispositivos por loja).
 *
 * O que estes testes seguram, e por quê:
 *
 * ★ A DIGITAL DO HARDWARE NUNCA VAI PARA O DISCO. Guardar o valor calculado
 *   dentro da pasta de dados parece economia de uma chamada por abertura, e
 *   faria a cópia da pasta carregar a digital da máquina de origem. As duas
 *   passariam a ser a mesma máquina aos olhos do servidor, que é exatamente o
 *   que este recurso existe para impedir. Lido do FONTE: nenhum teste de
 *   comportamento fica vermelho se alguém "otimizar" isso.
 *
 * ★ SILÊNCIO NÃO É "NÃO". Internet caída, servidor fora, resposta estranha:
 *   nada disso pode fechar a loja. Só um 403 explícito fecha.
 *
 * ★ A VAGA É PEDIDA ANTES DE GRAVAR A CHAVE. Ao contrário, a instalação
 *   ficaria com licença válida no disco e sistema fechado, que é o estado mais
 *   confuso possível para quem está instalando.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  configurarPlataforma,
  limparPlataforma
} from '@fhvptech/core/electron/plataforma'
import {
  identificadorLocal,
  limparNomeDeMaquina,
  montarDigital,
  nomeDaMaquina
} from '@fhvptech/core/electron/dispositivo'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ_CORE = join(AQUI, '../../../../packages/core/src/electron')
const FONTE_DISPOSITIVO = readFileSync(join(RAIZ_CORE, 'dispositivo.ts'), 'utf8')
const FONTE_LICENCA = readFileSync(join(RAIZ_CORE, 'licenca.ts'), 'utf8')

let pasta: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'dispositivo-'))
  configurarPlataforma({
    pastaDados: () => pasta,
    pastaTemp: () => pasta,
    versao: () => '1.40.0'
  })
})

afterEach(() => {
  limparPlataforma()
  rmSync(pasta, { recursive: true, force: true })
})

// ── A digital do hardware ────────────────────────────────────────────────────

describe('montarDigital', () => {
  it('some quando nada do hardware presta', () => {
    // Estado VÁLIDO: a máquina entra identificada só pelo sorteio. Recusar a
    // instalação porque o Windows não respondeu seria punir o cliente por um
    // driver.
    expect(montarDigital([])).toBe('')
    expect(montarDigital(['', null, undefined])).toBe('')
    expect(montarDigital(['abc'])).toBe('')
  })

  it('descarta o que placa sem série gravada devolve', () => {
    expect(montarDigital(['To be filled by O.E.M.'])).toBe('')
    expect(montarDigital(['Default string', 'None', 'null'])).toBe('')
    expect(montarDigital(['00000000-0000-0000-0000-000000000000'])).toBe('')
    expect(montarDigital(['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'])).toBe('')
  })

  it('★ duas máquinas com placas "sem número" não viram a mesma máquina', () => {
    // Se o lixo passasse, metade das placas baratas compartilharia digital, e a
    // loja inteira caberia numa vaga só.
    const a = montarDigital(['To be filled by O.E.M.', 'SERIE-DA-MAQUINA-A'])
    const b = montarDigital(['To be filled by O.E.M.', 'SERIE-DA-MAQUINA-B'])
    expect(a).not.toBe(b)
  })

  it('é estável entre execuções e não devolve o dado cru', () => {
    const uma = montarDigital(['4C4C4544-0037-3110-8054-C7C04F464331', 'PF2ABCDE'])
    const outra = montarDigital(['4C4C4544-0037-3110-8054-C7C04F464331', 'PF2ABCDE'])
    expect(uma).toBe(outra)
    expect(uma).toMatch(/^[a-f0-9]{32}$/)
    expect(uma).not.toContain('PF2ABCDE')
  })

  it('não se importa com espaço nem com maiúscula', () => {
    expect(montarDigital(['  serie-da-placa  '])).toBe(montarDigital(['SERIE-DA-PLACA']))
  })

  it('máquinas diferentes dão digitais diferentes', () => {
    expect(montarDigital(['serie-da-placa-a'])).not.toBe(montarDigital(['serie-da-placa-b']))
  })
})

// ── O identificador sorteado ─────────────────────────────────────────────────

describe('identificadorLocal', () => {
  it('nasce na primeira execução e não muda depois', () => {
    const primeiro = identificadorLocal()
    expect(primeiro).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(existsSync(join(pasta, 'dispositivo.json'))).toBe(true)
    expect(identificadorLocal()).toBe(primeiro)
  })

  it('arquivo corrompido não impede de abrir: sorteia outro', () => {
    writeFileSync(join(pasta, 'dispositivo.json'), 'isto não é json', 'utf8')
    expect(identificadorLocal()).toMatch(/^[A-Za-z0-9-]{8,64}$/)
  })

  it('identificador de formato estranho é descartado', () => {
    writeFileSync(join(pasta, 'dispositivo.json'), JSON.stringify({ id: 'x' }), 'utf8')
    const id = identificadorLocal()
    expect(id).not.toBe('x')
    expect(id.length).toBeGreaterThanOrEqual(8)
  })

  it('★ o arquivo NÃO guarda a digital do hardware', () => {
    identificadorLocal()
    const salvo = readFileSync(join(pasta, 'dispositivo.json'), 'utf8')
    expect(Object.keys(JSON.parse(salvo)).sort()).toEqual(['criadoEm', 'id'])
  })
})

describe('limparNomeDeMaquina', () => {
  it('tira caractere de controle, que é o que vem de nome estranho', () => {
    const sujo = 'CAIXA' + String.fromCharCode(0) + String.fromCharCode(27) + '01'
    const limpo = limparNomeDeMaquina(sujo)
    const temControle = Array.from(limpo).some(
      (ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127
    )
    expect(temControle).toBe(false)
    expect(limpo).toContain('CAIXA')
  })

  it('corta no tamanho que cabe na tabela', () => {
    expect(limparNomeDeMaquina('X'.repeat(300))).toHaveLength(60)
  })

  it('nome vazio ou estranho vira um rótulo legível', () => {
    expect(limparNomeDeMaquina('')).toBe('Máquina sem nome')
    expect(limparNomeDeMaquina('   ')).toBe('Máquina sem nome')
    expect(limparNomeDeMaquina(undefined)).toBe('Máquina sem nome')
    expect(limparNomeDeMaquina(42)).toBe('Máquina sem nome')
  })

  it('cabe numa linha de tabela e não traz caractere de controle', () => {
    const nome = nomeDaMaquina()
    expect(nome.length).toBeGreaterThan(0)
    expect(nome.length).toBeLessThanOrEqual(60)
    const temControle = Array.from(nome).some(
      (ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127
    )
    expect(temControle).toBe(false)
  })
})

// ── Guardas lidas do FONTE ───────────────────────────────────────────────────

describe('as regras que nenhum teste de comportamento pega', () => {
  it('★ a digital do hardware nunca é gravada em disco', () => {
    // O único writeFileSync do módulo é o do identificador sorteado, e o que
    // ele grava não pode incluir a digital.
    const gravacoes = FONTE_DISPOSITIVO.match(/writeFileSync\([^)]*\)/g) ?? []
    expect(gravacoes).toHaveLength(1)
    expect(gravacoes[0]).toContain('caminho')
    expect(gravacoes[0]).not.toContain('digital')
  })

  it('★ a digital fica só na memória, recalculada a cada execução', () => {
    expect(FONTE_DISPOSITIVO).toMatch(/let digitalEmMemoria/)
    // Cache em disco entraria como leitura do arquivo de identidade dentro da
    // função da digital. Ela não pode saber que o arquivo existe.
    const corpo = FONTE_DISPOSITIVO.slice(
      FONTE_DISPOSITIVO.indexOf('export function digitalDoHardware'),
      FONTE_DISPOSITIVO.indexOf('function caminhoIdentidade')
    )
    expect(corpo).not.toContain('readFileSync')
  })

  it('★ a ativação pede a vaga ANTES de gravar a chave', () => {
    const corpo = FONTE_LICENCA.slice(FONTE_LICENCA.indexOf('export async function ativarLicenca'))
    const pedido = corpo.indexOf('await pedirVaga(')
    const gravacao = corpo.indexOf('writeFileSync(caminhoLicenca()')
    expect(pedido).toBeGreaterThan(-1)
    expect(gravacao).toBeGreaterThan(pedido)
  })

  it('★ só um 403 explícito vira recusa; falha de rede devolve nada', () => {
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('async function pedirVaga'),
      FONTE_LICENCA.indexOf('async function reconferirVaga')
    )
    expect(corpo).toMatch(/resposta\.status === 403/)
    // O catch da função não pode inventar uma recusa a partir de erro de rede.
    const catchDoPedido = corpo.slice(corpo.lastIndexOf('} catch {'))
    expect(catchDoPedido).toContain('return null')
    expect(catchDoPedido).not.toContain("'nao'")
  })

  it("★ resposta que não é 403 nem sucesso também não bloqueia", () => {
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('async function pedirVaga'),
      FONTE_LICENCA.indexOf('async function reconferirVaga')
    )
    expect(corpo).toMatch(/if \(!resposta\.ok\) return null/)
  })

  it('★ o passe vale só para a instalação que o pediu', () => {
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('function lerPasse'),
      FONTE_LICENCA.indexOf('function escreverPasse')
    )
    expect(corpo).toMatch(/bruto\.deviceId !== identificadorLocal\(\)/)
  })

  it('o passe é gravado cifrado, como o heartbeat', () => {
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('function escreverPasse'),
      FONTE_LICENCA.indexOf('function origemDestaMaquina')
    )
    expect(corpo).toMatch(/criptografar\(JSON\.stringify\(passe\)\)/)
  })

  it('licença vencida fala de licença, não de computador', () => {
    // A consulta ao passe só acontece depois de a licença passar. Mandar o
    // lojista falar de máquina quando o problema é a validade faria ele
    // resolver a coisa errada.
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('export function validarLicenca('),
      FONTE_LICENCA.indexOf('export function extrairClienteIdLocal')
    )
    expect(corpo).toMatch(/if \(status\.valida\) \{\s*\n\s*const passe = lerPasse\(\)/)
  })

  it('o terminal do multicaixa se declara como terminal', () => {
    const corpo = FONTE_LICENCA.slice(
      FONTE_LICENCA.indexOf('function origemDestaMaquina'),
      FONTE_LICENCA.indexOf('async function pedirVaga')
    )
    expect(corpo).toMatch(/modoMulticaixa\(\) === 'terminal' \? 'terminal' : 'principal'/)
  })
})

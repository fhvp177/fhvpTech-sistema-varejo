/**
 * Regra de firewall da porta do multi-caixa.
 *
 * O que se testa é a montagem do comando, e não o Windows. Dois motivos:
 *
 * 1. **Escopo.** Uma regra ampla demais abriria a máquina em rede pública.
 *    Aqui se fixa o contrário: entrada, TCP, uma porta, um programa, e só nos
 *    perfis privado e de domínio.
 * 2. **Injeção.** O caminho do programa entra na regra. Se os argumentos
 *    fossem concatenados numa string de shell, uma pasta chamada
 *    `Loja & Cia` viraria execução de comando. Passar lista impede isso, e o
 *    teste registra a exigência.
 */
import { describe, expect, it } from 'vitest'
import {
  argumentosConsulta,
  argumentosCriacao,
  argumentosRemocao,
  comandoElevado,
  consultarRegra,
  NOME_REGRA
} from '@fhvptech/core/electron/multicaixa/firewall'

const PROGRAMA = 'C:\\Program Files\\FHVP Tech Varejo\\FHVP Tech Varejo.exe'

describe('a regra criada', () => {
  const args = argumentosCriacao(4877, PROGRAMA)

  it('libera só entrada, só TCP, só a porta do multi-caixa', () => {
    expect(args).toContain('dir=in')
    expect(args).toContain('protocol=TCP')
    expect(args).toContain('localport=4877')
    expect(args).toContain('action=allow')
  })

  it('vale só para a rede da loja, nunca para rede pública', () => {
    // Sem isto, o PC ficaria alcançável em qualquer Wi-Fi aberto por onde
    // passasse — o caso do notebook que vai e volta.
    expect(args).toContain('profile=private,domain')
    expect(args.join(' ')).not.toContain('public')
  })

  it('amarra a regra a este programa', () => {
    expect(args).toContain(`program=${PROGRAMA}`)
  })

  it('recusa porta impossível em vez de montar comando torto', () => {
    expect(() => argumentosCriacao(80, PROGRAMA)).toThrow(/Porta inválida/)
    expect(() => argumentosCriacao(99999, PROGRAMA)).toThrow(/Porta inválida/)
    expect(() => argumentosCriacao(4877.5, PROGRAMA)).toThrow(/Porta inválida/)
  })

  it('mantém intacto um caminho com caractere perigoso', () => {
    // Cada argumento é um item da lista, então & e aspas viajam como texto e
    // nunca como sintaxe de shell.
    const arriscado = 'C:\\Users\\Loja & Cia\\app".exe'
    const perigosos = argumentosCriacao(4877, arriscado)

    expect(perigosos).toContain(`program=${arriscado}`)
    expect(perigosos.filter((a) => a.startsWith('program='))).toHaveLength(1)
  })

  it('usa o mesmo nome na consulta, criação e remoção', () => {
    // Nome divergente deixaria regra órfã acumulando a cada atualização.
    for (const lista of [argumentosConsulta(), args, argumentosRemocao()]) {
      expect(lista).toContain(`name=${NOME_REGRA}`)
    }
  })
})

describe('a chamada elevada', () => {
  it('pede elevação ao Windows e espera terminar', () => {
    const { programa, argumentos } = comandoElevado(['advfirewall', 'firewall'])

    expect(programa).toBe('powershell')
    const script = argumentos[argumentos.length - 1]
    expect(script).toContain('-Verb RunAs') // é o que abre a caixa do escudo
    expect(script).toContain('-Wait') // sem isto, a conferência rodaria antes de terminar
    expect(script).toContain('-WindowStyle Hidden')
  })

  it('envolve cada argumento em aspas simples', () => {
    const script = comandoElevado(argumentosCriacao(4877, PROGRAMA)).argumentos.slice(-1)[0]

    expect(script).toContain("'name=FHVP Tech - Multi-caixa'")
    expect(script).toContain(`'program=${PROGRAMA}'`)
  })

  // O teste mais importante do arquivo: isto roda como ADMINISTRADOR. Uma pasta
  // chamada "Loja d'Ana" fecharia a aspa e o resto viraria comando elevado.
  it('neutraliza aspa simples no caminho, que fecharia a string', () => {
    const traicoeiro = "C:\\Users\\Loja d'Ana; Remove-Item C:\\ -Recurse\\app.exe"

    const script = comandoElevado(argumentosCriacao(4877, traicoeiro)).argumentos.slice(-1)[0]

    // A aspa vira duas — escape do PowerShell — e o ponto e vírgula continua
    // sendo texto dentro da string, nunca separador de comando.
    expect(script).toContain("d''Ana")
    expect(script).not.toContain("d'Ana;")
  })

  /**
   * Desfaz o escape do PowerShell. Se o que sai daqui é igual ao que entrou,
   * então o argumento é DADO e não sintaxe — que é a única definição útil de
   * "não escapou".
   *
   * Contar ocorrências de texto perigoso no comando não serve: um argumento
   * corretamente escapado CONTÉM aquele texto, só que dentro de uma string. Foi
   * assim que a primeira versão deste teste deu alarme falso.
   */
  function argumentoDeVolta(entrada: string): string {
    const script = comandoElevado([entrada]).argumentos.slice(-1)[0]
    const inicio = script.indexOf('-ArgumentList ') + '-ArgumentList '.length
    const token = script.slice(inicio, script.lastIndexOf(' -Verb RunAs'))
    return token.slice(1, -1).replace(/''/g, "'")
  }

  it('entrega ao netsh exatamente o texto recebido, seja ele qual for', () => {
    for (const arriscado of [
      "a' -Verb RunAs; calc; '",
      "C:\\Users\\Loja d'Ana\\app.exe",
      'name=Loja & Cia',
      "'; Remove-Item C:\\ -Recurse; '",
      '$(calc)',
      'aspas "duplas" no meio'
    ]) {
      expect(argumentoDeVolta(arriscado), `argumento alterado: ${arriscado}`).toBe(arriscado)
    }
  })
})

describe('consulta do estado', () => {
  const naoWindows = process.platform !== 'win32'

  it.skipIf(naoWindows)('reconhece regra existente', async () => {
    const estado = await consultarRegra(async () => ({
      codigo: 0,
      saida: `Nome da Regra: ${NOME_REGRA}\nHabilitada: Sim`
    }))

    expect(estado).toBe('liberado')
  })

  it.skipIf(naoWindows)('reconhece ausência de regra', async () => {
    const estado = await consultarRegra(async () => ({
      codigo: 1,
      saida: 'Nenhuma regra corresponde aos critérios especificados.'
    }))

    expect(estado).toBe('bloqueado')
  })

  it.skipIf(naoWindows)('diz "não sei" quando o netsh falha', async () => {
    // Melhor não saber do que afirmar "bloqueado" e mandar o lojista caçar um
    // problema que talvez não exista.
    const estado = await consultarRegra(async () => {
      throw new Error('netsh não encontrado')
    })

    expect(estado).toBe('indeterminado')
  })

  it('não afirma nada fora do Windows', async () => {
    if (naoWindows) {
      expect(await consultarRegra(async () => ({ codigo: 0, saida: NOME_REGRA }))).toBe(
        'indeterminado'
      )
    } else {
      // No Windows a consulta realmente consulta — coberto pelos casos acima.
      expect(await consultarRegra(async () => ({ codigo: 0, saida: NOME_REGRA }))).toBe('liberado')
    }
  })
})

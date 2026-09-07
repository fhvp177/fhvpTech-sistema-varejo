/**
 * O fechamento às cegas não pode virar teatro.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 * Contar às cegas quer dizer digitar o que se encontrou SEM VER o que o sistema
 * esperava. Se o esperado estiver disponível antes, a pessoa não conta: confere.
 * O número bate sempre, a quebra nunca aparece, e o controle passa a existir só
 * no nome.
 *
 * A defesa está em três camadas, e este teste guarda as três:
 *
 *   1. o BANCO não tem função que devolva o esperado de um turno aberto
 *   2. o CANAL não expõe nada parecido ao renderer
 *   3. a TELA de contagem não desenha número esperado nenhum
 *
 * ⚠️ A camada 3 sozinha não bastaria: bastaria alguém chamar o canal pelo
 * console. E a 1 sozinha não bastaria se alguém acrescentasse a função depois.
 * É por isso que a guarda cobra as três juntas.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', '..')
const RAIZ = join(SRC, '..')

function semComentarios(fonte: string): string {
  return fonte.replace(/(?<![\w'"])\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const TURNOS = semComentarios(readFileSync(join(RAIZ, 'electron', 'db', 'queries', 'turnos.ts'), 'utf8'))
const IPC = semComentarios(readFileSync(join(RAIZ, 'electron', 'ipc', 'financeiro.ts'), 'utf8'))
const PRELOAD = semComentarios(readFileSync(join(RAIZ, 'electron', 'preload.ts'), 'utf8'))
const TELA = semComentarios(readFileSync(join(SRC, 'pages', 'Caixa.tsx'), 'utf8'))

describe('o esperado só existe depois da contagem', () => {
  it('★ nenhuma função do banco devolve o esperado de um turno aberto', () => {
    /*
     * O esperado é calculado DENTRO de `fecharTurno`, depois de a contagem já
     * ter chegado como argumento. Qualquer função nova que responda "quanto
     * deveria ter na gaveta?" abre o buraco.
     */
    const exportadas = [...TURNOS.matchAll(/export function (\w+)/g)].map((m) => m[1])
    expect(exportadas.length, 'a varredura quebrou — nenhuma função encontrada').toBeGreaterThan(4)

    const suspeitas = exportadas.filter((n) => /esperad|previst|conferenc|deveria/i.test(n))
    expect(suspeitas, 'função que revela o esperado cedo demais').toEqual([])

    // e o cálculo tem que continuar acontecendo dentro do fechamento
    const fechar = TURNOS.slice(TURNOS.indexOf('export function fecharTurno'))
    expect(fechar, 'o esperado deixou de ser calculado no fechamento').toContain('valor_esperado')
  })

  it('★ nenhum canal expõe o esperado ao renderer', () => {
    const canais = [...IPC.matchAll(/registrarCanal\('([^']+)'/g)].map((m) => m[1])
    expect(canais.length).toBeGreaterThan(8)
    const suspeitos = canais.filter((c) => /esperad|previst|deveria/i.test(c))
    expect(suspeitos, 'canal que entrega o esperado antes da contagem').toEqual([])

    // o preload também não pode inventar um atalho
    expect(PRELOAD).not.toMatch(/esperad|previsto/i)
  })

  it('★ a tela de contagem não mostra número esperado', () => {
    /*
     * O diálogo pede o que foi CONTADO e mais nada. Se um dia alguém colocar
     * ali um "esperado: R$ X" para "ajudar", este teste fica vermelho — e a
     * ajuda é exatamente o que destrói o recurso.
     */
    const inicio = TELA.indexOf('Conferir {fechando?.nome}')
    const fim = TELA.indexOf('Fechamento do caixa')
    expect(inicio, 'o diálogo de contagem sumiu').toBeGreaterThan(-1)
    /*
     * ⚠️ E ele tem UM campo só: dinheiro.
     *
     * Decisão do dono em 06/09, e ele tem razão: pedir para o vendedor digitar
     * quanto entrou de cartão e PIX é trabalho sem resultado — não existe pilha
     * de PIX na gaveta para conferir. Pior, um campo que sempre bate ensina a
     * preencher qualquer número, e é a mesma mão que preenche o do dinheiro.
     */
    expect(TELA, 'a contagem voltou a pedir cartão e PIX')
      .not.toContain('FORMAS_CONTAGEM')
    expect(fim, 'o diálogo de resultado sumiu').toBeGreaterThan(inicio)

    /*
     * ⚠️ A guarda cobra os DADOS, não as palavras. A primeira versão procurava
     * "diferença" e ficou vermelha por causa da frase que EXPLICA ao operador
     * que a diferença só aparece depois — texto que é justamente o que se quer
     * ali. O que não pode existir é o número: os campos que o carregam.
     */
    const dialogoContagem = TELA.slice(inicio, fim)
    for (const campo of ['valor_esperado', 'diferenca_dinheiro', 'resultado.', 'resultado?.']) {
      expect(dialogoContagem, `a contagem passou a desenhar ${campo}`).not.toContain(campo)
    }
  })

  it('★ a diferença só é desenhada no resultado, depois de fechar', () => {
    const resultado = TELA.slice(TELA.indexOf('Fechamento do caixa'))
    expect(resultado).toContain('diferenca_dinheiro')
    expect(resultado).toContain('valor_esperado')
  })
})

describe('quem confirma e o que confirmar significa', () => {
  it('★ aceitar a diferença exige gerente', () => {
    // Quem conferiu não pode ser quem aceita a própria quebra.
    const confirmar = IPC.slice(IPC.indexOf("registrarCanal('caixa:confirmarTurno'"))
    expect(confirmar.slice(0, 400)).toContain('requerDono()')
  })

  it('★ confirmar é ACEITAR, não "eu vi"', () => {
    // O texto do botão é parte do controle: "confirmar" deixaria a pessoa achar
    // que só marcou presença. Ela está assumindo o dinheiro que faltou.
    expect(TELA).toContain('Aceitar a diferença')
  })

  it('★ diferença não-zero exige justificativa escrita', () => {
    /*
     * Sem isto, aceitar vira automático em duas semanas e o controle morre sem
     * ninguém perceber que morreu.
     */
    expect(TELA).toContain("resultado?.diferenca_dinheiro !== 0 && justificativa.trim() === ''")
  })

  it('★ turno confirmado não se altera mais', () => {
    const confirmar = TURNOS.slice(TURNOS.indexOf('export function confirmarTurno'))
    expect(confirmar).toContain('já foi confirmado')
  })

  it('★ o lançamento manual é só do dono', () => {
    /*
     * É a única porta por onde entra dinheiro sem origem em venda ou conta.
     * Aberta ao vendedor, ela vira o jeito de encobrir uma quebra: basta lançar
     * um "ajuste" do tamanho da falta.
     */
    const lancar = IPC.slice(IPC.indexOf("registrarCanal(\n    'financeiro:lancar'"))
    expect(lancar.slice(0, 400)).toContain('requerDono()')
  })
})

/**
 * Inventário e classificação dos canais IPC.
 *
 * Este arquivo faz duas coisas que valem por muitos testes de comportamento:
 *
 * 1. **Rede de segurança do refactor do roteador.** O conjunto de canais
 *    registrados tem que continuar idêntico ao classificado em
 *    `multicaixa/canais.ts`. Canal que some quebra a tela que o chama — e
 *    quebra em runtime, não na compilação, porque a ponte é por string.
 *
 * 2. **Trava de decisão.** Todo canal precisa estar classificado entre "atende
 *    o segundo caixa" e "nunca sai da máquina". Criar um canal novo faz este
 *    teste falhar até alguém decidir de que lado ele fica — que é exatamente o
 *    momento certo de pensar nisso.
 *
 * ── Por que ler o fonte em vez de importar os módulos ────────────────────────
 * Chamar `registrarHandlersVendas()` de verdade arrastaria better-sqlite3, que
 * é addon nativo compilado pro Electron e não carrega no runtime dos testes
 * (mesma limitação anotada em backup/__tests__/migrations.test.ts). Ler o fonte
 * responde exatamente a pergunta que importa — "os mesmos canais ainda estão
 * registrados?" — sem precisar do banco.
 *
 * O padrão aceita as DUAS formas de registro, a antiga (`ipcMain.handle`) e a
 * do roteador (`registrarCanal`), para atravessar o refactor sem ser reescrito.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  canalAtendePelaRede,
  CANAIS_LOCAIS,
  CANAIS_REDE,
  CANAIS_REPETIVEIS,
  podeRepetir,
  TOTAL_CANAIS
} from '../multicaixa/canais'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ELECTRON_VAREJO = join(AQUI, '..')
const RAIZ_MONOREPO = join(AQUI, '..', '..', '..', '..')

/**
 * Os 2 módulos de licença do core que o `main.ts` do varejo importa. O core tem
 * um `ipc/auth.ts` próprio (11 canais) que o varejo NÃO usa — ele registra o
 * `electron/ipc/auth.ts` local. Por isso a lista é explícita: varrer a pasta
 * inteira do core traria canais que o varejo não tem.
 */
const MODULOS_CORE = [
  join(RAIZ_MONOREPO, 'packages', 'core', 'src', 'electron', 'ipc', 'licenca.ts'),
  join(RAIZ_MONOREPO, 'packages', 'core', 'src', 'electron', 'ipc', 'licenca-pagamento.ts')
]

const PADRAO_REGISTRO = /(?:ipcMain\.handle|registrarCanal)\s*\(\s*['"`]([^'"`]+)['"`]/g

function arquivosTs(dir: string): string[] {
  const encontrados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue
      encontrados.push(...arquivosTs(caminho))
      continue
    }
    if (nome.endsWith('.ts')) encontrados.push(caminho)
  }
  return encontrados
}

function canaisDoArquivo(caminho: string): string[] {
  return [...readFileSync(caminho, 'utf8').matchAll(PADRAO_REGISTRO)].map((m) => m[1])
}

function arquivosQueRegistram(): string[] {
  return [...arquivosTs(ELECTRON_VAREJO), ...MODULOS_CORE]
}

function coletarCanais(): string[] {
  return arquivosQueRegistram().flatMap(canaisDoArquivo)
}

describe('inventário de canais IPC', () => {
  // Sem esta guarda, um caminho errado faria a varredura devolver zero canal e
  // as comparações passariam por vacuidade — o pior tipo de teste verde.
  it('encontra os arquivos que registram canais', () => {
    expect(existsSync(ELECTRON_VAREJO)).toBe(true)
    for (const modulo of MODULOS_CORE) {
      expect(existsSync(modulo), `módulo do core sumiu: ${modulo}`).toBe(true)
      expect(canaisDoArquivo(modulo).length).toBeGreaterThan(0)
    }
    expect(arquivosTs(ELECTRON_VAREJO).length).toBeGreaterThan(20)
  })

  it('registra exatamente os canais classificados', () => {
    const encontrados = new Set(coletarCanais())
    const classificados = new Set<string>([...CANAIS_LOCAIS, ...CANAIS_REDE])

    const sumiram = [...classificados].filter((c) => !encontrados.has(c)).sort()
    const surgiram = [...encontrados].filter((c) => !classificados.has(c)).sort()

    expect(
      sumiram,
      'Canais classificados que não estão mais registrados. A tela que os chama ' +
        'quebra em runtime, não na compilação.'
    ).toEqual([])

    expect(
      surgiram,
      'Canais registrados que ninguém classificou. Decida em multicaixa/canais.ts ' +
        'se este canal atende o segundo caixa ou se nunca sai da máquina — até lá ' +
        'ele é recusado pela rede.'
    ).toEqual([])
  })

  it('não classifica o mesmo canal dos dois jeitos', () => {
    const locais = new Set<string>(CANAIS_LOCAIS)
    const nosDois = CANAIS_REDE.filter((c) => locais.has(c)).sort()

    expect(nosDois, 'canal em CANAIS_LOCAIS e CANAIS_REDE ao mesmo tempo').toEqual([])
  })

  it('não registra o mesmo canal duas vezes', () => {
    const todos = coletarCanais()
    const repetidos = [...new Set(todos.filter((c, i) => todos.indexOf(c) !== i))].sort()

    // O Electron lança "second handler for 'x'" só quando o app sobe; aqui o
    // erro aparece no CI, antes de virar tela branca na loja.
    expect(repetidos, 'canal registrado em dois lugares').toEqual([])
  })

  it('mantém a contagem de canais', () => {
    expect(new Set(coletarCanais()).size).toBe(TOTAL_CANAIS)
  })
})

describe('quem atende pela rede', () => {
  it('libera o que é dado da loja', () => {
    expect(canalAtendePelaRede('vendas:criar')).toBe(true)
    expect(canalAtendePelaRede('produtos:listar')).toBe(true)
    expect(canalAtendePelaRede('auth:login')).toBe(true)
  })

  it('barra backup, impressão, atualização e licença', () => {
    expect(canalAtendePelaRede('backup:restaurar')).toBe(false)
    expect(canalAtendePelaRede('impressao:imprimir')).toBe(false)
    expect(canalAtendePelaRede('atualizacao:instalar')).toBe(false)
    expect(canalAtendePelaRede('licenca:ativar')).toBe(false)
  })

  it('fecha por padrão para canal desconhecido', () => {
    // A regra que protege o futuro: canal criado amanhã não ganha acesso remoto
    // de graça — precisa ser classificado de propósito.
    expect(canalAtendePelaRede('canal:inventado')).toBe(false)
    expect(canalAtendePelaRede('')).toBe(false)
    expect(canalAtendePelaRede('vendas:')).toBe(false)
    expect(canalAtendePelaRede('VENDAS:CRIAR')).toBe(false)
  })
})

describe('canais que o terminal pode repetir sozinho', () => {
  it('todos atendem pela rede', () => {
    const forasteiros = CANAIS_REPETIVEIS.filter((c) => !canalAtendePelaRede(c)).sort()

    expect(forasteiros, 'canal repetível que nem sequer atende pela rede').toEqual([])
  })

  /**
   * Verbos que denunciam escrita, exigidos no INÍCIO do nome da ação.
   *
   * A lista é grosseira de propósito: é mais seguro barrar um canal de leitura
   * por engano — o operador só clica de novo — do que deixar passar uma escrita
   * e gravar a venda duas vezes.
   *
   * A âncora no início não é detalhe: sem ela,
   * `auth:listarVendedoresParaLogin` era acusado por causa do "Login" no fim,
   * embora seja leitura pura. Nome de escrita COMEÇA com o verbo.
   */
  const VERBOS_DE_ESCRITA =
    /^(criar|salvar|atualizar|deletar|remover|registrar|estornar|cancelar|pagar|importar|exportar|emitir|marcar|dispensar|definir|setar|alterar|redefinir|alternar|aplicar|configurar|enviar|elevar|login|logout|restaurar|gerar)/i

  it('nenhum tem nome de escrita', () => {
    const suspeitos = CANAIS_REPETIVEIS.filter((c) => VERBOS_DE_ESCRITA.test(c.split(':')[1])).sort()

    expect(
      suspeitos,
      'Este canal parece escrever. Repetir uma escrita depois de falha de rede ' +
        'pode gravar a mesma venda duas vezes — o pedido pode ter chegado e só ' +
        'a resposta ter se perdido. Tire de CANAIS_REPETIVEIS.'
    ).toEqual([])
  })

  it('fecha por padrão', () => {
    expect(podeRepetir('vendas:criar')).toBe(false)
    expect(podeRepetir('canal:inventado')).toBe(false)
    expect(podeRepetir('produtos:listar')).toBe(true)
  })
})

describe('canal que abre janela do sistema fica local', () => {
  /**
   * Encontra o canal dono de cada `dialog.show*`: é o `registrarCanal` mais
   * próximo acima da chamada.
   */
  function canaisComDialogo(): string[] {
    const achados = new Set<string>()
    for (const arq of arquivosTs(ELECTRON_VAREJO)) {
      const src = readFileSync(arq, 'utf8')
      const registros = [...src.matchAll(PADRAO_REGISTRO)]
      for (const dialogo of src.matchAll(/dialog\.show\w+/g)) {
        const dono = registros.filter((r) => r.index! < dialogo.index!).pop()
        if (dono) achados.add(dono[1])
      }
    }
    return [...achados].sort()
  }

  it('encontra os diálogos existentes', () => {
    expect(canaisComDialogo().length).toBeGreaterThan(0)
  })

  it('nenhum canal com diálogo atende pela rede', () => {
    const vazando = canaisComDialogo().filter(canalAtendePelaRede)

    expect(
      vazando,
      'Este canal abre uma janela do sistema, que aparece na máquina onde o ' +
        'processo roda — ou seja, no PC da loja. Chamado do segundo caixa, ele ' +
        'travaria esperando resposta enquanto a janela surge na frente de quem ' +
        'está no caixa. Mova para CANAIS_LOCAIS.'
    ).toEqual([])
  })
})

// Campo com formato TEM máscara. Regra da casa, e este teste é o guarda dela.
//
// ── Por que ele existe ───────────────────────────────────────────────────────
// A regra já foi combinada e já foi quebrada. A tela de Recibos nasceu com
// quatro campos de documento — dois CPF/CNPJ e dois RG — feitos com `<Input>`
// cru: aceitavam qualquer letra e qualquer quantidade de caracteres. Nada
// acusou. Typecheck limpo, build limpo, 829 testes verdes, e o defeito só
// apareceria no cadastro de um cliente meses depois, quando o dado já estivesse
// gravado errado.
//
// É exatamente o tipo de defeito que precisa de uma trava mecânica: ele não dá
// erro, não quebra tela, e depende de alguém lembrar. Este teste lembra por
// todo mundo — inclusive numa tela que ainda nem existe.
//
// ── Como ele decide ──────────────────────────────────────────────────────────
// Varre os .tsx da aplicação, acha cada `<Input` e olha a que campo ele está
// preso (pelo `id=` e pelo `value=`). Se o nome do campo é de um dado com forma
// conhecida — CPF, CNPJ, RG, CEP, telefone — o `<Input>` cru é reprovado: ali
// tem que estar um `IMaskInput` ou um dos componentes de `CamposDocumento`.
//
// Ele lê o FONTE, e não o DOM, porque em jsdom um campo sem máscara aceita o
// texto errado exatamente como um campo com máscara aceitaria o certo — o teste
// de comportamento não veria diferença sem simular tecla a tecla.

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(__dirname, '..', '..')

function arquivosTsx(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosTsx(caminho))
    } else if (nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

/**
 * Nomes de campo cujo dado TEM forma conhecida.
 *
 * `rg` está com fronteira de palavra para não casar com "registro", "orgao" e
 * companhia. `documento` entra porque é como o recibo chama o CPF/CNPJ.
 */
const CAMPOS_COM_FORMA = /\b(cpf|cnpj|cep|telefone|documento)\b|(^|[^a-z])rg([^a-z]|$)/i

/** Um `<Input ... />`, do abre-tag até o fecha. */
function blocosDeInput(fonte: string): string[] {
  const blocos: string[] = []
  let i = fonte.indexOf('<Input')
  while (i !== -1) {
    // Só o componente <Input>, não <InputOutraCoisa>.
    const seguinte = fonte[i + '<Input'.length]
    if (seguinte === ' ' || seguinte === '\n' || seguinte === '\r') {
      const fim = fonte.indexOf('/>', i)
      blocos.push(fonte.slice(i, fim === -1 ? i + 400 : fim))
    }
    i = fonte.indexOf('<Input', i + 1)
  }
  return blocos
}

/** O que o `<Input>` mostra: só `id=` e `value=` — placeholder não conta. */
function campoDoInput(bloco: string): string {
  const id = /id="([^"]+)"/.exec(bloco)?.[1] ?? ''
  const valor = /value=\{([^}]*)\}/.exec(bloco)?.[1] ?? ''
  return `${id} ${valor}`
}

describe('campo com formato tem máscara', () => {
  const arquivos = arquivosTsx(RAIZ_SRC)

  it('encontrou mesmo os arquivos da aplicação', () => {
    // Sem isto, um erro no caminho faria o teste passar varrendo pasta vazia.
    // A tela de Clientes é a sentinela: ela existe nos dois apps e é onde moram
    // os campos de CPF e CNPJ. Se a varredura não a alcança, o teste acima não
    // vale nada.
    expect(arquivos.length).toBeGreaterThan(20)
    expect(arquivos.some((a) => a.endsWith('Clientes.tsx'))).toBe(true)
    const clientes = readFileSync(arquivos.find((a) => a.endsWith('Clientes.tsx'))!, 'utf-8')
    expect(clientes, 'a sentinela deixou de ter campo de documento').toMatch(/id="cpf"/)
  })

  /*
   * ★ DINHEIRO e números de banco também têm forma — e foi por aqui que a regra
   * escapou.
   *
   * Em 06/09 o dono cobrou máscara pela terceira vez, e desta vez não era CPF
   * nem telefone: eram SALDO INICIAL, AGÊNCIA, CONTA, FUNDO DE TROCO e a
   * contagem do caixa. Todos passaram pela guarda de baixo porque ela só
   * conhecia documento. O campo de saldo aceitava letra.
   *
   * ⚠️ E dinheiro não se resolve com `type="number"`: o campo numérico do
   * navegador aceita ponto ou vírgula conforme o idioma da máquina, mostra
   * setinhas que ninguém quer, e no celular abre um teclado sem vírgula. Por
   * isso ele também conta como cru aqui.
   *
   * ⚠️ `valor` NÃO entra na lista, por mais tentador que seja: é o nome do prop
   * de meia dúzia de componentes desta casa (`valor.endereco_bairro`,
   * `valor.cidade`), e incluí-lo encheria a guarda de acusação falsa. Guarda que
   * grita à toa é guarda que alguém desliga.
   */
  const CAMPOS_DE_NUMERO =
    /\b(saldo|preco|preço|custo|troco|contado|agencia|agência|fundo|sangria|suprimento)\b/i

  it('★ dinheiro, agência e conta também têm máscara', () => {
    const culpados: string[] = []
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf-8')
      for (const bloco of blocosDeInput(fonte)) {
        const campo = campoDoInput(bloco)
        if (CAMPOS_DE_NUMERO.test(campo)) {
          culpados.push(`${arquivo.slice(RAIZ_SRC.length + 1)} → ${campo.trim()}`)
        }
      }
    }
    /*
     * ⚠️ Dívida conhecida, e escrita de propósito.
     *
     * A lista existe para a dívida ser CONTADA em vez de esquecida: campo novo
     * fora dela derruba o teste, e quem consertar um dos antigos vai ter que
     * apagar a linha daqui — que é o momento certo de comemorar.
     *
     * ── Preço e custo do produto saíram daqui em 10/09 ─────────────────────
     * Eram os dois mais temidos, pelo motivo certo: o formulário carregava o
     * preço do banco como número e lia de volta com `parseFloat`, então trocar
     * só o campo estragaria o preço de todo produto de todo cliente. Os TRÊS
     * lados mudaram juntos: a carga passou a `paraMascara`, a leitura a
     * `paraNumero`, e o campo vazio é barrado ANTES da conversão (porque
     * `paraNumero('')` é 0, e não NaN). O que prende isso é
     * `dinheiroComMascara.test.ts`, que reprova a leitura ingênua com o caso
     * real: "1.234,56" lido como 1,234.
     *
     * ── O que sobrou, e por quê ────────────────────────────────────────────
     * O preço da importação de XML. Ali a linha nasce do arquivo da nota, não
     * do banco, e a tela mexe em várias linhas de uma vez: é um caminho de
     * carga diferente, que merece a sua própria conferência.
     */
    const PENDENTES = ['components\\ModalImportarXml.tsx → l.preco']
    const novos = culpados.filter((c) => !PENDENTES.includes(c))

    expect(
      novos,
      'Estes campos guardam dinheiro ou número de banco num <Input> cru — dá para ' +
        'digitar letra. Use IMaskInput com CLASSE_DINHEIRO / CLASSE_AGENCIA / ' +
        'CLASSE_CONTA de utils/mascaras.ts.'
    ).toEqual([])

    // E se um pendente for consertado, esta lista precisa encolher junto —
    // senão ela vira folclore e ninguém sabe mais o que ainda falta.
    const resolvidos = PENDENTES.filter((p) => !culpados.includes(p))
    expect(
      resolvidos,
      'Estes campos já foram corrigidos: tire-os da lista PENDENTES acima.'
    ).toEqual([])
  })

  it('nenhum CPF, CNPJ, RG, CEP ou telefone em <Input> cru', () => {
    const culpados: string[] = []
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf-8')
      for (const bloco of blocosDeInput(fonte)) {
        const campo = campoDoInput(bloco)
        if (CAMPOS_COM_FORMA.test(campo)) {
          culpados.push(`${arquivo.slice(RAIZ_SRC.length + 1)} → ${campo.trim()}`)
        }
      }
    }

    expect(
      culpados,
      'Estes campos guardam dado com forma conhecida e estão num <Input> sem ' +
        'máscara — dá para digitar letra e qualquer tamanho. Use IMaskInput, ou ' +
        'os componentes CampoCpfCnpj / CampoRg de components/CamposDocumento.tsx.'
    ).toEqual([])
  })
})

// `CamposDocumento.tsx` nasceu na assistência, junto da tela de Recibos — a
// primeira que precisou de CPF/CNPJ e RG no mesmo formulário. O varejo ainda não
// tem campo de documento nenhum, e copiar o componente pra lá só pra ficar sem
// uso seria pior. Se um dia ele precisar, o teste acima cobra a máscara e o
// componente atravessa junto.
const CAMINHO_CAMPOS = join(RAIZ_SRC, 'components', 'CamposDocumento.tsx')
const temCamposDocumento = existsSync(CAMINHO_CAMPOS)

describe.runIf(temCamposDocumento)('os componentes de documento fazem o que prometem', () => {
  // Lido condicionalmente: `describe.runIf` decide se os testes RODAM, mas o
  // corpo do describe é executado de qualquer jeito na coleta — um readFileSync
  // solto aqui derruba a suíte inteira do app que não tem o arquivo.
  const fonte = temCamposDocumento ? readFileSync(CAMINHO_CAMPOS, 'utf-8') : ''

  it('CPF e CNPJ trocam de máscara pelo tamanho', () => {
    expect(fonte).toContain("mask: '000.000.000-00'")
    expect(fonte).toContain("mask: '00.000.000/0000-00'")
    // Sem o dispatch, a máscara dinâmica trava na primeira e o CNPJ não entra.
    expect(fonte).toContain('dispatch')
  })

  it('o RG aceita dígitos e o X final, e nada além disso', () => {
    // O X é o dígito verificador de São Paulo — é letra, e é legítimo. Barrar
    // letra nenhuma recusaria RG verdadeiro, que é pior que campo solto.
    expect(fonte).toContain('/^[0-9]{0,12}[xX]?$/')
  })

  it('usa IMaskInput, que preserva a posição do cursor', () => {
    // Reformatar no onChange joga o cursor pro fim a cada tecla e corrigir um
    // dígito no meio do número vira briga.
    expect(fonte).toContain('IMaskInput')
    expect(fonte).not.toContain('onChange={(e)')
  })
})

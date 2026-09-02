/**
 * O servidor web só entrega arquivo de dentro da pasta da interface.
 *
 * Este é o único ponto do servidor onde texto vindo de fora vira caminho de
 * disco. Do outro lado da porta estão o banco da loja, o arquivo de licença e
 * o `.env` com as chaves — tudo em pastas vizinhas.
 *
 * ── Os dois modos de falhar, e o segundo é o traiçoeiro ──────────────────────
 * Frouxo demais entrega o que não devia. Apertado demais devolve 404 para a
 * interface inteira — e esse aconteceu de verdade, em setembro de 2026: a
 * pasta chegava do ambiente com barra normal (`C:/loja/web`), o caminho
 * resolvido saía com barra invertida, e a comparação de prefixo dizia "fora da
 * pasta" para todo arquivo. O sintoma foi uma página em branco, sem um erro
 * sequer no servidor, porque o `index.html` era comparado à parte e passava.
 *
 * Por isso os testes vêm em pares: para cada coisa barrada, uma que passa.
 */
import { describe, expect, it } from 'vitest'
import { resolve, sep } from 'path'
import { arquivoDaInterface, raizDaInterface, tipoDoArquivo } from '../../servidor/interface'

/** Uma árvore imaginária: nada é escrito em disco. */
const RAIZ = resolve('/loja/web')
const EXISTENTES = new Set(
  [
    ['index.html'],
    ['assets', 'app-a1b2c3.js'],
    ['assets', 'estilo-d4e5f6.css'],
    ['assets', 'logo.png']
  ].map((partes) => resolve(RAIZ, ...partes))
)
const existe = (c: string): boolean => EXISTENTES.has(c)

describe('arquivos da interface servidos pelo servidor web', () => {
  it('a raiz do site entrega o index', () => {
    expect(arquivoDaInterface(RAIZ, '/', existe)).toBe(resolve(RAIZ, 'index.html'))
  })

  it('entrega os arquivos que a página pede', () => {
    expect(arquivoDaInterface(RAIZ, '/assets/app-a1b2c3.js', existe)).toBe(
      resolve(RAIZ, 'assets', 'app-a1b2c3.js')
    )
    expect(arquivoDaInterface(RAIZ, '/assets/estilo-d4e5f6.css', existe)).toBe(
      resolve(RAIZ, 'assets', 'estilo-d4e5f6.css')
    )
  })

  /**
   * O bug de setembro. A raiz chega escrita com barra normal — que é válido, e
   * é como se digita num arquivo de configuração — e mesmo assim tudo tem que
   * ser encontrado.
   */
  it('encontra os arquivos mesmo com a pasta escrita com barra normal', () => {
    const comBarraNormal = raizDaInterface('/loja/web'.replace(/\\/g, '/'))
    expect(arquivoDaInterface(comBarraNormal, '/assets/app-a1b2c3.js', existe)).not.toBeNull()
    expect(arquivoDaInterface(comBarraNormal, '/', existe)).not.toBeNull()
  })

  it('a pasta passada pelo ambiente vira caminho do sistema', () => {
    expect(raizDaInterface('/loja/web')).toBe(RAIZ)
    expect(raizDaInterface(undefined)).toBe(resolve('dist-web'))
  })

  it('não deixa sair da pasta da interface', () => {
    const fugas = [
      '/../.env',
      '/../../database.sqlite',
      '/assets/../../licenca.lic',
      '/assets/../../../Windows/win.ini',
      '/..%2f..%2fdatabase.sqlite',
      '/%2e%2e/%2e%2e/licenca.lic'
    ]
    for (const fuga of fugas) {
      expect(arquivoDaInterface(RAIZ, fuga, () => true), `${fuga} escapou`).toBeNull()
    }
  })

  it('recusa caminho malformado em vez de estourar', () => {
    // `%` solto quebra o decodeURIComponent; byte nulo trunca o caminho em
    // algumas camadas de sistema de arquivos ("app.js\0.txt" vira "app.js").
    expect(arquivoDaInterface(RAIZ, '/%E0%A4%A', () => true)).toBeNull()
    expect(arquivoDaInterface(RAIZ, '/assets/app.js\0.txt', () => true)).toBeNull()
  })

  it('arquivo que não existe é 404, não erro', () => {
    expect(arquivoDaInterface(RAIZ, '/assets/nao-existe.js', existe)).toBeNull()
  })

  /**
   * Uma pasta irmã cujo nome começa igual (`/loja/web-antigo`) fica FORA. Sem
   * o separador na comparação, o prefixo bateria e ela entraria.
   */
  it('pasta vizinha de nome parecido não entra', () => {
    expect(arquivoDaInterface(RAIZ, `/..${sep}web-antigo${sep}segredo.js`, () => true)).toBeNull()
  })

  it('cada arquivo desce com o tipo certo', () => {
    expect(tipoDoArquivo('/x/index.html')).toBe('text/html; charset=utf-8')
    expect(tipoDoArquivo('/x/app.js')).toBe('text/javascript; charset=utf-8')
    expect(tipoDoArquivo('/x/estilo.css')).toBe('text/css; charset=utf-8')
    expect(tipoDoArquivo('/x/LOGO.PNG')).toBe('image/png')
    expect(tipoDoArquivo('/x/coisa.qualquer')).toBe('application/octet-stream')
  })
})

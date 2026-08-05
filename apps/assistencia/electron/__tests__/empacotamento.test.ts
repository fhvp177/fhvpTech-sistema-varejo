// Instalador com o endereço de atualização errado é o pior defeito que este
// projeto pode enviar: a máquina funciona, não dá erro nenhum, e simplesmente
// nunca mais recebe correção. Foi o que prendeu dois notebooks na 1.32.0 —
// eles perguntavam ao GitHub, onde a última release era a 1.31.0, e ouviam a
// resposta correta de que já estavam atualizados.
//
// A regra que estes testes protegem: TODO empacotamento passa pelo
// dist-edicao.js, que é o único lugar que troca o publish para o canal do R2.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const raizApp = join(__dirname, '..', '..')
const ler = (rel: string): string => readFileSync(join(raizApp, rel), 'utf-8')

describe('empacotamento', () => {
  const scripts: Record<string, string> = JSON.parse(ler('package.json')).scripts

  it('nenhum script do npm empacota chamando o electron-builder direto', () => {
    // Sem `--config build-edicoes.config.js`, valem o `publish` do package.json
    // (GitHub, que não recebe mais release) e o EDICAO padrão, que é 'pro'.
    // Instalador com recursos pagos e feed morto.
    //
    // `install-app-deps` fica de fora de propósito: ele só recompila as
    // dependências nativas contra o ABI do Electron, não gera instalador
    // nenhum. É o que o `setup` e o `rebuild-native` usam.
    const culpados = Object.entries(scripts)
      .filter(([, cmd]) => /\belectron-builder\b(?!\s+install-app-deps)/.test(cmd))
      .map(([nome]) => nome)

    expect(culpados).toEqual([])
  })

  it('os atalhos antigos de empacotar param e explicam', () => {
    // Apagar os scripts não bastaria: `npm run dist:win` viraria "script não
    // encontrado", que não ensina nada a quem tem o comando na memória.
    for (const nome of ['dist', 'dist:win', 'dist:mac', 'dist:linux']) {
      expect(scripts[nome]).toBe('node scripts/dist-bloqueado.js')
    }
  })

  it('as duas edições passam pelo dist-edicao.js', () => {
    expect(scripts['dist:basico']).toBe('node scripts/dist-edicao.js basico')
    expect(scripts['dist:pro']).toBe('node scripts/dist-edicao.js pro')
  })

  it('o dist-edicao.js empacota com a config das edições', () => {
    // É esta linha que substitui o publish do GitHub pelo canal do R2 e grava
    // o app-update.yml certo dentro do instalador.
    const fonte = ler('scripts/dist-edicao.js')
    expect(fonte).toContain("'build-edicoes.config.js'")
  })

  it('a config das edições aponta o publish para o canal da edição', () => {
    const fonte = ler('build-edicoes.config.js')
    expect(fonte).toMatch(/provider:\s*'generic'/)
    expect(fonte).toContain('https://updates.fhvptech.com/assistencia/${edicao}')
  })
})

describe('canal de atualização em tempo de execução', () => {
  const atualizador = ler('electron/atualizador.ts')

  it('o app define o próprio canal a partir da edição do build', () => {
    // Cinto e suspensório do app-update.yml. Os dois podiam discordar — e
    // discordaram: binário com recursos do Pro e endereço apontando pro
    // GitHub. Mandando a mesma constante que liga os recursos decidir também
    // onde procurar versão nova, não há como divergir, e instalador gerado
    // torto se conserta sozinho ao abrir.
    expect(atualizador).toContain('setFeedURL')
    expect(atualizador).toContain('https://updates.fhvptech.com/assistencia/${__EDICAO__}')
  })

  it('a edição chega ao processo principal', () => {
    // `__EDICAO__` vivia só no define do renderer; o atualizador roda no
    // principal e leria `undefined`, virando o canal ".../undefined".
    const config = ler('electron.vite.config.ts')
    const blocoMain = config.slice(config.indexOf('main:'), config.indexOf('preload:'))
    expect(blocoMain).toContain('__EDICAO__')
  })
})

/**
 * Backup pré-atualização (`@fhvptech/core/electron/backup/preUpdateLogica`).
 *
 * ── O bug que estes testes existem para impedir ──────────────────────────────
 * O segundo caixa não tem banco de dados: os dados moram no PC principal, e o
 * boot pula `inicializarBackupManager()` quando a máquina é terminal. Só que o
 * handler `atualizacao:instalar` fazia o backup pré-update SEMPRE, e
 * `obterBackupManager()` não devolve erro — ele LANÇA.
 *
 * O estrago não foi uma mensagem feia. Foi que o roteador de IPC não converte
 * exceção em resposta (está escrito lá), então a rejeição atravessava até o
 * `await` do modal, que não tinha `catch`. A tela "Instalando a nova versão…"
 * ficava girando para sempre e o `quitAndInstall` na linha seguinte nunca
 * rodava. Resultado: o terminal ficou incapaz de se atualizar — não às vezes,
 * mas toda vez, em qualquer máquina em modo segundo caixa.
 *
 * ── Por que testar aqui e não o handler ──────────────────────────────────────
 * Mesmo motivo do `segredo.test.ts`: o handler arrasta `electron` e
 * `electron-updater`, que não carregam no runtime dos testes. A regra que
 * segura o bug é "esta função não lança, ela devolve" — e essa mora na lógica
 * pura, onde o teste alcança.
 *
 * O teste mais importante é o de número 2: uma fonte que LANÇA é literalmente
 * o `obterBackupManager()` do segundo caixa.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  executarBackupPreUpdateCom,
  type FonteBackup
} from '@fhvptech/core/electron/backup/preUpdateLogica'

/** Máquina normal: tem banco e o backup funciona. */
const fonteQueFunciona = (): FonteBackup => ({
  disponivel: () => true,
  executar: vi.fn(async () => ({ sucesso: true }))
})

/** Segundo caixa: não tem BackupManager, então não há o que fazer. */
const fonteDeTerminal = (): FonteBackup => ({
  disponivel: () => false,
  executar: vi.fn(async () => {
    throw new Error('não deveria ser chamado: esta máquina não tem banco')
  })
})

/** O caso real de antes do conserto: perguntar pelo manager estoura. */
const fonteQueLanca = (mensagem = 'BackupManager não inicializado.'): FonteBackup => ({
  disponivel: () => {
    throw new Error(mensagem)
  },
  executar: vi.fn(async () => ({ sucesso: true }))
})

describe('máquina que tem dados', () => {
  it('faz o backup e diz que fez', async () => {
    const fonte = fonteQueFunciona()

    await expect(executarBackupPreUpdateCom(fonte)).resolves.toEqual({ estado: 'feito' })
    expect(fonte.executar).toHaveBeenCalledOnce()
  })

  it('backup que falha não vira exceção, vira aviso', async () => {
    const fonte: FonteBackup = {
      disponivel: () => true,
      executar: async () => ({ sucesso: false, erro: 'disco cheio' })
    }

    // A política sempre foi "falha de backup não bloqueia a atualização". O que
    // muda é que agora ela CHEGA na tela em vez de sumir no console.
    await expect(executarBackupPreUpdateCom(fonte)).resolves.toEqual({
      estado: 'falhou',
      erro: 'disco cheio'
    })
  })

  it('falha sem motivo declarado ainda produz um texto exibível', async () => {
    const fonte: FonteBackup = {
      disponivel: () => true,
      executar: async () => ({ sucesso: false })
    }

    const resultado = await executarBackupPreUpdateCom(fonte)

    expect(resultado.estado).toBe('falhou')
    // Uma tarja de aviso com a palavra "undefined" é pior que não avisar.
    expect(resultado).not.toHaveProperty('erro', undefined)
    expect((resultado as { erro: string }).erro.length).toBeGreaterThan(0)
  })
})

describe('segundo caixa', () => {
  it('não tenta fazer backup de um banco que não existe', async () => {
    const fonte = fonteDeTerminal()

    await expect(executarBackupPreUpdateCom(fonte)).resolves.toEqual({
      estado: 'nao-se-aplica'
    })
    expect(fonte.executar).not.toHaveBeenCalled()
  })

  it('não se aplica NÃO é falha — o terminal não deve ser avisado de nada', async () => {
    // A distinção existe para a tarja "sem backup" não aparecer no segundo
    // caixa, onde a ausência de backup é o comportamento correto e não um
    // problema. Confundir os dois treinaria o lojista a ignorar o aviso.
    const resultado = await executarBackupPreUpdateCom(fonteDeTerminal())

    expect(resultado.estado).not.toBe('falhou')
  })
})

describe('a garantia que segura o bug', () => {
  it('fonte que LANÇA não derruba a atualização', async () => {
    // Este é o `obterBackupManager()` do segundo caixa, exatamente. Antes do
    // conserto, esta rejeição chegava crua no modal e travava a tela.
    const resultado = await executarBackupPreUpdateCom(fonteQueLanca())

    expect(resultado.estado).toBe('falhou')
    expect((resultado as { erro: string }).erro).toContain('BackupManager')
  })

  it('nenhuma fonte quebrada consegue rejeitar a promessa', async () => {
    // A propriedade que o handler depende: sempre volta um valor. Se um dia
    // alguém tirar o try/catch, este teste fica vermelho antes de a loja
    // descobrir com a tela travada.
    const quebradas: FonteBackup[] = [
      fonteQueLanca(),
      { disponivel: () => true, executar: async () => { throw new Error('banco sumiu') } },
      { disponivel: () => true, executar: (() => { throw new Error('nem promessa virou') }) as FonteBackup['executar'] },
      { disponivel: () => true, executar: async () => { throw 'texto pelado, sem Error' } },
      { disponivel: () => true, executar: async () => null as unknown as { sucesso: boolean } }
    ]

    for (const fonte of quebradas) {
      const resultado = await executarBackupPreUpdateCom(fonte)
      expect(resultado.estado, `fonte quebrada devolveu ${JSON.stringify(resultado)}`).toBe(
        'falhou'
      )
    }
  })
})

import { app } from 'electron'
import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { requerDono } from '../sessao'
import { conectarComoTerminal, resumoDeQuedas, terminalConectado } from '../multicaixa/terminal'
import { temSenhaConfigurada } from '@fhvptech/core/electron/backup/SenhaRestauracao'
import {
  gravarConfigMulticaixa,
  lerConfigMulticaixa
} from '@fhvptech/core/electron/multicaixa/config'
import {
  abrirClonagem,
  abrirPareamento,
  desligarServidor,
  estadoMulticaixa,
  fecharClonagem,
  fecharPareamento,
  liberarFirewallSeNecessario,
  ligarServidor,
  revogarTerminal
} from '../multicaixa/servico'
import { receberBancoDe } from '../multicaixa/receberClone'

/**
 * Canais de configuração do multi-caixa.
 *
 * Todos são LOCAIS: quem configura o multi-caixa é quem está na frente do caixa
 * principal. Deixá-los atender pela rede permitiria que um terminal pareasse
 * outro terminal, ou revogasse a si mesmo — decisões que pertencem a quem
 * administra a loja, não a quem está com o segundo caixa na mão.
 *
 * Além de locais, exigem gerente: ligar o multi-caixa expõe os dados da loja na
 * rede, e é decisão de quem responde por ela.
 */
export function registrarHandlersMulticaixa(): void {
  /**
   * Papel desta máquina e se ela está enxergando o caixa principal.
   *
   * Único canal do grupo SEM `requerDono`, e de propósito: quem precisa ver o
   * aviso de "sem conexão" é quem está operando o caixa, que costuma ser
   * vendedor. Exigir gerente esconderia o aviso justamente de quem está com o
   * cliente na frente.
   */
  registrarCanal('multicaixa:situacao', () => {
    try {
      const modo = lerConfigMulticaixa().modo
      return {
        success: true,
        data: {
          modo,
          conectado: terminalConectado(),
          // Só faz sentido no caixa adicional; no principal não há queda que registrar.
          quedas: modo === 'terminal' ? resumoDeQuedas() : null
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:estado', async () => {
    try {
      requerDono()
      return { success: true, data: await estadoMulticaixa() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:ligarServidor', async () => {
    try {
      requerDono()
      await ligarServidor()
      // Depois de subir, e não antes: se o servidor nem liga, não faz sentido
      // incomodar o lojista com a caixa de administrador.
      await liberarFirewallSeNecessario()
      return { success: true, data: await estadoMulticaixa() }
    } catch (error) {
      // Causa mais provável: outro programa já ocupa a porta. A mensagem do
      // sistema é críptica, então vale traduzir.
      const msg = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
        ? 'A porta já está em uso por outro programa neste computador.'
        : (error as Error).message
      return { success: false, error: msg }
    }
  })

  registrarCanal('multicaixa:desligarServidor', async () => {
    try {
      requerDono()
      await desligarServidor()
      return { success: true, data: await estadoMulticaixa() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /** Tentar de novo, quando o lojista recusou a caixa de administrador antes. */
  registrarCanal('multicaixa:liberarFirewall', async () => {
    try {
      requerDono()
      await liberarFirewallSeNecessario()
      return { success: true, data: await estadoMulticaixa() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:abrirPareamento', () => {
    try {
      requerDono()
      return { success: true, data: abrirPareamento() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:fecharPareamento', () => {
    try {
      requerDono()
      fecharPareamento()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ─── Clonagem ──────────────────────────────────────────────────────────────
  // Estes três NÃO exigem gerente logado, ao contrário de todos os acima, e o
  // motivo é o ovo e a galinha: a máquina de destino não tem banco, logo não
  // tem vendedor para listar, logo ninguém consegue logar nela. Exigir sessão
  // aqui tornaria a clonagem impossível justamente no caso em que ela serve.
  //
  // A proteção não vem da sessão e sim do outro lado: quem entrega os dados é a
  // máquina de ORIGEM, e lá o gerente precisa estar logado para gerar o código.
  registrarCanal('multicaixa:abrirClonagem', async () => {
    try {
      requerDono() // na ORIGEM há sessão, e entregar o banco é decisão do gerente
      return { success: true, data: await abrirClonagem() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:fecharClonagem', async () => {
    try {
      requerDono()
      await fecharClonagem()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Diz se esta máquina exigirá a senha de restauração para receber uma cópia.
   * A tela pergunta antes para só mostrar o campo quando ele for necessário —
   * numa instalação nova, pedir senha que não existe seria um beco sem saída.
   */
  registrarCanal('multicaixa:exigeSenhaParaReceber', () => {
    try {
      return { success: true, data: temSenhaConfigurada() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal(
    'multicaixa:receberBanco',
    async (endereco: string, codigo: string, senha: string) => {
    try {
      // Sem requerDono: é a máquina de destino, que pode estar recém-instalada.
      // Quem protege esta operação é a senha de restauração (quando existe) e o
      // código gerado pelo gerente na máquina de origem.
      const resultado = await receberBancoDe(
        String(endereco ?? ''),
        String(codigo ?? ''),
        lerConfigMulticaixa().porta,
        String(senha ?? '')
      )
      if (!resultado.sucesso) return { success: false, error: resultado.erro }
      return { success: true, data: { copiaDeSeguranca: resultado.copiaDeSeguranca } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
    }
  )

  /**
   * Saída de emergência: esta máquina deixa de ser caixa adicional.
   *
   * Existe porque sem ela um caixa removido no computador principal vira um
   * tijolo: ele abre em modo terminal, não alcança ninguém, e a tela de
   * reconfiguração fica DEPOIS do login — que ele nunca consegue fazer, porque
   * a lista de vendedores vem justamente de quem não responde.
   *
   * Sem `requerDono` pelo mesmo motivo: não há como logar nesta máquina.
   */
  registrarCanal('multicaixa:sairDoModoTerminal', () => {
    try {
      const config = lerConfigMulticaixa()
      gravarConfigMulticaixa({ ...config, modo: 'normal', servidor: null })
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('multicaixa:conectarComoTerminal', async (endereco: string, codigo: string, nome: string) => {
    try {
      // Também sem requerDono, e pelo mesmo motivo da clonagem: esta máquina não
      // tem banco nem vendedores. Quem autoriza é o gerente do outro lado, ao
      // gerar o código.
      const r = await conectarComoTerminal(String(endereco ?? ''), String(codigo ?? ''), String(nome ?? ''))
      if (!r.ok) return { success: false, error: r.erro }
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Aplicar o modo exige reiniciar: é no boot que se decide se o banco chega a
  // ser aberto. O renderer chama isto depois de conectar ou de receber a cópia.
  registrarCanal('multicaixa:reiniciarApp', () => {
    app.relaunch()
    app.quit()
    return { success: true, data: null }
  })

  registrarCanal('multicaixa:revogarTerminal', async (id: string) => {
    try {
      requerDono()
      revogarTerminal(String(id ?? ''))
      return { success: true, data: await estadoMulticaixa() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

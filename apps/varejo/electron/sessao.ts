// Sessão do usuário logado (qual vendedor abriu o app).
// Vive em memória do main process — some quando o app fecha e exige novo login.
// Nunca persistir em disco: PIN é a única garantia de "quem está aí" e cada
// abertura do app exige re-login.
//
// ── Vocabulário: 'dono' no código, "Gerente" na tela ──────────────────────────
// O papel com acesso total se chama `'dono'` no banco e em todo o código
// (`ehDono`, `requerDono`, `pinDono`). Na INTERFACE ele aparece como
// "Gerente", que é o termo do dia a dia da loja — quem administra nem sempre é
// o proprietário. Renomear no banco exigiria migration e mexeria nos dados de
// todas as lojas, sem ganho nenhum para quem usa; então a tradução acontece só
// no texto. Se for mexer aqui, lembre: o valor gravado continua sendo 'dono'.

import { origemAtual } from '@fhvptech/core/electron/roteador'
import { obterVendedor, type Vendedor } from './db/queries/vendedores'

// ── Uma sessão POR MÁQUINA, não uma por processo ─────────────────────────────
// Enquanto existia só o PC da loja, guardar o vendedor logado numa variável
// solta funcionava: uma máquina, uma pessoa, uma sessão.
//
// Com o segundo caixa isso vira um bug sério, e silencioso. As duas máquinas
// falam com o MESMO processo — o do PC. Se a sessão fosse uma só, o login feito
// no notebook substituiria o de quem está no caixa da loja. E como
// `vendas:criar` atribui a venda a `requerSessao().id`, a venda do caixa da
// loja passaria a sair no nome de quem está no notebook: comissão errada,
// relatório errado, e ninguém percebe.
//
// Então a sessão é guardada por ORIGEM — quem chamou. O roteador do core já
// carrega essa identidade em cada despacho: `'local'` para a janela desta
// máquina, ou o id do terminal pareado. Fora de qualquer despacho (backup
// automático, timer, código de boot) a origem é `'local'`, que é o padrão
// seguro e mantém o comportamento de sempre em quem só tem um caixa.
const sessaoPorOrigem = new Map<string, number>()

export function definirSessao(vendedorId: number): void {
  sessaoPorOrigem.set(origemAtual(), vendedorId)
}

export function limparSessao(): void {
  sessaoPorOrigem.delete(origemAtual())
}

/**
 * Encerra a sessão de uma origem específica, sem depender de quem está
 * chamando. É o que o PC usa ao revogar um terminal pareado — o acesso tem que
 * cair na hora, mesmo com o terminal desconectado.
 */
export function limparSessaoDaOrigem(origem: string): void {
  sessaoPorOrigem.delete(origem)
}

export function obterSessaoId(): number | null {
  return sessaoPorOrigem.get(origemAtual()) ?? null
}

export function obterSessao(): Vendedor | null {
  const vendedorId = obterSessaoId()
  if (vendedorId === null) return null
  const v = obterVendedor(vendedorId)
  // Se o vendedor logado foi removido/desativado por outro processo, a sessão
  // perde a validade. Limpa pra forçar novo login — só a de quem chamou, que as
  // outras máquinas podem estar com gente diferente logada.
  if (!v || v.ativo === 0) {
    limparSessao()
    return null
  }
  return v
}

export function ehDono(): boolean {
  return obterSessao()?.papel === 'dono'
}

// Garante que a operação só prossegue se quem está logado é gerente.
// Usado em handlers IPC sensíveis — chame antes da operação real.
export function requerDono(): void {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  if (v.papel !== 'dono') {
    throw new Error('Esta ação requer permissão do gerente da loja.')
  }
}

// Retorna a sessão atual ou lança se não houver. Útil pra handlers que
// precisam atribuir algo ao vendedor logado (vendas, auditoria futura).
export function requerSessao(): Vendedor {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  return v
}

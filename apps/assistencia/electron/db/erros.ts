// Tradução de erros técnicos do banco em mensagens que o lojista entende.
//
// Quando o usuário tenta excluir um registro que ainda é referenciado por outro
// (ex.: um produto que já aparece em vendas, um cliente com histórico, um
// fornecedor com produtos vinculados), o SQLite barra a operação com
// "FOREIGN KEY constraint failed". Isso PROTEGE os dados (não deixa apagar e
// orfanar o histórico), mas o texto cru é incompreensível pra quem está no caixa.
//
// Este helper roda a operação e, se o erro for justamente essa violação de
// vínculo, troca a mensagem por uma explicação clara. Qualquer outro erro é
// reerguido intacto, pra não esconder problemas de verdade.
export function comErroAmigavelDeVinculo<T>(fn: () => T, mensagem: string): T {
  try {
    return fn()
  } catch (e) {
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new Error(mensagem)
    }
    throw e
  }
}

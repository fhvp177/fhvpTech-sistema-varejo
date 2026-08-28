import type { Migration } from '@fhvptech/core/electron/db/migrations'
import { aplicar001ModuloBackup } from './001_modulo_backup'
import { aplicar002AtivarBackup } from './002_ativar_backup'
import { aplicar003HashSenhaRestauracao } from './003_hash_senha_restauracao'
import { aplicar004ClientesCpfNascimento } from './004_clientes_cpf_nascimento'
import { aplicar005Parcelas } from './005_parcelas'
import { aplicar006ParceladoStatus } from './006_parcelado_status'
import { aplicar007ValorPago } from './007_valor_pago'
import { aplicar008ClientesPj } from './008_clientes_pj'
import { aplicar009Vendedores } from './009_vendedores'
import { aplicar010DescontoVenda } from './010_desconto_venda'
import { aplicar011AuthPin } from './011_auth_pin'
import { aplicar012NormalizarAutoLock } from './012_normalizar_auto_lock'
import { aplicar013VendedoresAuth } from './013_vendedores_auth'
import { aplicar014TetoDesconto } from './014_teto_desconto'
import { aplicar015CleanupPinLegado } from './015_cleanup_pin_legado'
import { aplicar016Devolucoes } from './016_devolucoes'
import { aplicar017RecuperacaoCodigos } from './017_recuperacao_codigos'
import { aplicar018ClientesObservacao } from './018_clientes_observacao'
import { aplicar019EntradaVenda } from './019_entrada_venda'
import { aplicar020ProdutoCusto } from './020_produto_custo'
import { aplicar021ProdutoVariacoes } from './021_produto_variacoes'
import { aplicar022CategoriaUsaTamanhos } from './022_categoria_usa_tamanhos'
import { aplicar023RecalcularValorPagoParcelado } from './023_recalcular_valor_pago_parcelado'
import { aplicar024Notificacoes } from './024_notificacoes'
import { aplicar025CancelarVenda } from './025_cancelar_venda'
import { aplicar026ValorPagoAvista } from './026_valor_pago_avista'
import { aplicar027ContasPagar } from './027_contas_pagar'
import { aplicar028NotasEntrada } from './028_notas_entrada'
import { aplicar029ProdutoReferencia } from './029_produto_referencia'
import { aplicar030LojaIdentidadeLegada } from './030_loja_identidade_legada'
import { aplicar031FiscalNfce } from './031_fiscal_nfce'
import { aplicar032FiscalEndereco } from './032_fiscal_endereco'
import { aplicar033VendaFormaPagamento } from './033_venda_forma_pagamento'
import { aplicar034ClienteFiscal } from './034_cliente_fiscal'
import { aplicar035NotaModelo } from './035_nota_modelo'
import { aplicar036PinTamanho } from './036_pin_tamanho'
import { aplicar027ProdutoTipo } from './os/027_produto_tipo'
import { aplicar028OrdensServico } from './os/028_ordens_servico'
import { aplicar029OsNatureza } from './os/029_os_natureza'
import { aplicar030OsCategoria } from './os/030_os_categoria'
import { aplicar031OsFotos } from './os/031_os_fotos'
import { aplicarAt001NfseServico } from './os/at_001_nfse_servico'
import { aplicarAt002Recibos } from './os/at_002_recibos'
import { aplicarAt003ReciboUf } from './os/at_003_recibo_uf'
import { aplicarAt004SenhaRestauracao } from './os/at_004_senha_restauracao'
import { aplicarAt005Emprestimos } from './os/at_005_emprestimos'

// Lista de migrations, na ordem de aplicação — herdadas do varejo e mantidas
// IDÊNTICAS de propósito: o backup de um cliente do varejo restaura direto
// aqui, e portar um fix vira copiar-colar. Novidades da assistência (ex.: OS)
// entram como migrations NOVAS por cima, nunca editando as antigas. O runner
// (executarMigrations) vive em @fhvptech/core/electron/db/migrations; aqui fica
// só o conteúdo, que é domínio deste app. Cada nicho terá a sua própria lista.
//
// ⚠️ POR QUE HÁ DOIS 027, DOIS 028, DOIS 029, DOIS 030 E DOIS 031.
// Os dois apps criaram migrations 027+ ao mesmo tempo e sem saber um do outro: o
// varejo numerou Contas a Pagar/notas de entrada/fiscal, a assistência numerou
// tipo de produto/OS. Isso NÃO quebra nada — o runner casa por `nome`, que é
// único nos dois conjuntos ('027_contas_pagar' ≠ '027_produto_tipo'), e o número
// é só convenção de leitura. Renumerar seria pior que conviver: o nome já está
// carimbado na tabela `_migrations` dos bancos existentes, e trocá-lo faria a
// migration rodar de novo.
//
// Os arquivos das duas famílias ficam em pastas separadas (raiz = herdado do
// varejo, ./os = desta assistência) pra que a duplicidade seja óbvia ao abrir a
// pasta, e não uma pegadinha.
//
// REGRA PRA DAQUI PRA FRENTE: migration nova que vier do varejo entra no bloco
// de cima com o nome original. Migration nova só da assistência entra no bloco
// de baixo com nome prefixado `at_` e numeração própria (ex.:
// 'at_001_nfse_servico') — assim as duas numerações nunca mais se cruzam, por
// mais que o varejo avance para 036, 037 e adiante.
export const MIGRATIONS: Migration[] = [
  { nome: '001_modulo_backup', aplicar: aplicar001ModuloBackup },
  { nome: '002_ativar_backup', aplicar: aplicar002AtivarBackup },
  { nome: '003_hash_senha_restauracao', aplicar: aplicar003HashSenhaRestauracao },
  { nome: '004_clientes_cpf_nascimento', aplicar: aplicar004ClientesCpfNascimento },
  { nome: '005_parcelas', aplicar: aplicar005Parcelas },
  { nome: '006_parcelado_status', aplicar: aplicar006ParceladoStatus },
  { nome: '007_valor_pago', aplicar: aplicar007ValorPago },
  { nome: '008_clientes_pj', aplicar: aplicar008ClientesPj },
  { nome: '009_vendedores', aplicar: aplicar009Vendedores },
  { nome: '010_desconto_venda', aplicar: aplicar010DescontoVenda },
  { nome: '011_auth_pin', aplicar: aplicar011AuthPin },
  { nome: '012_normalizar_auto_lock', aplicar: aplicar012NormalizarAutoLock },
  { nome: '013_vendedores_auth', aplicar: aplicar013VendedoresAuth },
  { nome: '014_teto_desconto', aplicar: aplicar014TetoDesconto },
  { nome: '015_cleanup_pin_legado', aplicar: aplicar015CleanupPinLegado },
  { nome: '016_devolucoes', aplicar: aplicar016Devolucoes },
  { nome: '017_recuperacao_codigos', aplicar: aplicar017RecuperacaoCodigos },
  { nome: '018_clientes_observacao', aplicar: aplicar018ClientesObservacao },
  { nome: '019_entrada_venda', aplicar: aplicar019EntradaVenda },
  { nome: '020_produto_custo', aplicar: aplicar020ProdutoCusto },
  { nome: '021_produto_variacoes', aplicar: aplicar021ProdutoVariacoes },
  { nome: '022_categoria_usa_tamanhos', aplicar: aplicar022CategoriaUsaTamanhos },
  { nome: '023_recalcular_valor_pago_parcelado', aplicar: aplicar023RecalcularValorPagoParcelado },
  { nome: '024_notificacoes', aplicar: aplicar024Notificacoes },
  { nome: '025_cancelar_venda', aplicar: aplicar025CancelarVenda },
  { nome: '026_valor_pago_avista', aplicar: aplicar026ValorPagoAvista },
  { nome: '027_contas_pagar', aplicar: aplicar027ContasPagar },
  { nome: '028_notas_entrada', aplicar: aplicar028NotasEntrada },
  { nome: '029_produto_referencia', aplicar: aplicar029ProdutoReferencia },
  { nome: '030_loja_identidade_legada', aplicar: aplicar030LojaIdentidadeLegada },
  { nome: '031_fiscal_nfce', aplicar: aplicar031FiscalNfce },
  { nome: '032_fiscal_endereco', aplicar: aplicar032FiscalEndereco },
  { nome: '033_venda_forma_pagamento', aplicar: aplicar033VendaFormaPagamento },
  { nome: '034_cliente_fiscal', aplicar: aplicar034ClienteFiscal },
  { nome: '035_nota_modelo', aplicar: aplicar035NotaModelo },
  { nome: '036_pin_tamanho', aplicar: aplicar036PinTamanho },

  // ── Migrations PRÓPRIAS da assistência (arquivos em ./os) ──
  { nome: '027_produto_tipo', aplicar: aplicar027ProdutoTipo },
  { nome: '028_ordens_servico', aplicar: aplicar028OrdensServico },
  { nome: '029_os_natureza', aplicar: aplicar029OsNatureza },
  { nome: '030_os_categoria', aplicar: aplicar030OsCategoria },
  { nome: '031_os_fotos', aplicar: aplicar031OsFotos },
  // Daqui pra frente, migration só da assistência usa o prefixo `at_` com
  // numeração própria — assim ela nunca colide com a do varejo, que segue em
  // 036, 037…
  { nome: 'at_001_nfse_servico', aplicar: aplicarAt001NfseServico },
  { nome: 'at_002_recibos', aplicar: aplicarAt002Recibos },
  { nome: 'at_003_recibo_uf', aplicar: aplicarAt003ReciboUf },
  { nome: 'at_004_senha_restauracao', aplicar: aplicarAt004SenhaRestauracao },
  { nome: 'at_005_emprestimos', aplicar: aplicarAt005Emprestimos },
]

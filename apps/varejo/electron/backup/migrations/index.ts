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

// Lista de migrations do varejo, na ordem de aplicação. O runner genérico
// (executarMigrations) vive em @fhvptech/core/electron/db/migrations; aqui fica
// só o conteúdo, que é domínio deste app. Cada nicho terá a sua própria lista.
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
]

# FHVP Tech — Assistência Técnica

Sistema desktop offline de gestão para **assistência técnica** (informática, impressoras, instalação de internet e câmeras/CFTV): venda de produtos (eletrônicos em geral) **e** prestação de serviços. Nicho do monorepo FHVP Tech, alugado mensalmente com o mesmo licenciamento dos demais apps.

## Origem: cópia podável do varejo

Este app **nasceu como cópia integral de `apps/varejo`** (Fase 0, 2026-07-04) — o caminho oposto da veterinária, que nasceu magra sobre o core. Motivo: assistência técnica ≈ varejo + módulo de Ordem de Serviço; PDV, estoque, clientes, crediário, estornos, relatórios, sino de notificações, impressão e backup são reaproveitados quase por inteiro.

### Regras que mantêm a cópia saudável

1. **Schema e migrations IDÊNTICOS ao varejo.** Novidades deste nicho (ex.: tabelas de OS) entram como **migrations novas por cima**, nunca editando as herdadas. Consequências desejadas: o backup de um cliente do varejo restaura direto aqui, o diff entre os apps continua legível e portar um fix é copiar-colar.
2. **Poda cirúrgica, não reforma.** Funcionalidade removida = remover só o ponto de entrada na UI; o encanamento (banco, IPC, queries) fica como caminho morto idêntico ao varejo.
3. Mover código para `@fhvptech/core` só quando for claramente compartilhável **e** barato.

### O que já foi podado (Fase 1)

- **Grade de tamanhos P–GG**: saiu o botão-toggle do modal de categorias (único ponto de entrada). Todo o encanamento de variações permanece.
- **Aniversário de cliente**: saiu do formulário de Clientes, do card do Dashboard e do sino. No UPDATE de cliente, o `data_nascimento` existente no banco é preservado (protege dados de backup restaurado).

### Identidade (Fase 2)

- Vocabulário: o papel não-dono se chama **"Técnico"** na interface. **Os identificadores de código continuam `vendedor`/`vendedores`** (tabela, canais IPC, variáveis) de propósito — só o texto visível mudou.
- Assistente de IA, guia de boas-vindas, cupom e relatórios já falam a língua do nicho; o fallback do cupom é neutro (sem o legado GN Modas do varejo).
- Paleta de cores: a mesma azul do varejo (decisão do dono do produto).

## Identidade técnica (isolamento do varejo)

| Item | Valor |
|---|---|
| Package | `@fhvptech/assistencia` |
| appId | `com.fhvp.assistencia` |
| productName | `FHVP Tech Assistência Técnica` |
| userData | `%APPDATA%\FHVP Tech Assistencia` (candidato único em `pastaDados.ts`) |
| Releases (electron-updater) | repo GitHub `fhvpTech-sistema-assistencia` (criar antes da 1ª release) |

Stack: Electron + React + TypeScript + Tailwind + shadcn/ui + SQLite (`node:sqlite`), IPC seguro via contextBridge no `preload.ts`, empacotamento com electron-builder. A arquitetura em camadas, o backup e o motor de licença são os mesmos do monorepo (ver `packages/core` e o `ARCHITECTURE.md` do varejo para o histórico completo).

## Próxima fase (Fase 3): módulo de Ordem de Serviço

O coração novo do nicho: serviço como cidadão de primeira classe no banco (sem "produtos-fantasma"), ciclo de OS unificado bancada/externo, garantia e comprovantes. Na importação do backup do cliente real: zerar `usa_tamanhos` das categorias e reclassificar os serviços-fantasma históricos.

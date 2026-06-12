# @fhvptech/core

Núcleo compartilhado entre os apps de cada nicho (`apps/varejo`, `apps/veterinaria`, …).

**Ainda vazio** — esta é a Fase 0 (só o esqueleto do monorepo). Os módulos serão movidos para cá
incrementalmente, um por vez, mantendo `apps/varejo` buildando entre cada passo.

## O que entra aqui (núcleo)

- `atualizador` (electron-updater), `licenca` + integração com o backend Fly/EfiPay
- `auth` / `sessao` (PIN, hierarquia dono-vendedor)
- `backup/**` (inclui o *runner* de migrations — não as migrations de conteúdo)
- `db/conexao`, `email`, infra do chat
- UI kit: `components/ui` + telas de plataforma (Login, LicençaBloqueada, Restauração,
  ConfigSegurança, vendedores, PIX, recuperação de PIN)

## O que NÃO entra (fica em cada app)

- Domínio: produtos, clientes, vendas, devoluções, etiquetas, dashboard, schema + migrations de conteúdo
- `chat/ferramentas.ts` (as ferramentas consultam o domínio de cada nicho)

## Consumo

Importado **por fonte** via subpath exports (sem pré-compilar; o `electron-vite` de cada app bundla):

```ts
import { ... } from '@fhvptech/core/electron/backup'
import { ... } from '@fhvptech/core/ui/Login'
```

> Primeiro módulo a migrar (Fase 1): `backup/**` — é o mais isolado, serve pra validar o encanamento.

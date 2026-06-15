import type { Migration } from '@fhvptech/core/electron/db/migrations'
import { aplicar001AuthSeed } from './001_auth_seed'

// Migrations de conteúdo da veterinária (ALTERs/ajustes/sementes, na ordem de
// aplicação). O schema base (tabelas) é criado por criarTabelas (schema.ts); as
// migrations cuidam de dados e mudanças incrementais. O runner genérico que
// aplica esta lista vem do @fhvptech/core.
export const MIGRATIONS: Migration[] = [
  { nome: '001_auth_seed', aplicar: aplicar001AuthSeed }
]

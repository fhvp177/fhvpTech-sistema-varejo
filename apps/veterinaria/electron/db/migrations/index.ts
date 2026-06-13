import type { Migration } from '@fhvptech/core/electron/db/migrations'

// Migrations de conteúdo da veterinária (ALTERs/ajustes futuros, na ordem de
// aplicação). Vazio por enquanto: o schema base é criado por criarTabelas
// (schema.ts). O runner genérico que aplica esta lista vem do @fhvptech/core.
export const MIGRATIONS: Migration[] = []

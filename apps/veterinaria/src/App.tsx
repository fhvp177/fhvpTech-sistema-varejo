import { Button } from '@fhvptech/core/ui/button'

// Casca mínima: prova que o app da veterinária roda consumindo o @fhvptech/core
// (este botão vem do UI kit compartilhado). As telas reais entram nos próximos
// passos.
export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-2xl font-bold">FHVP Tech — Veterinária 🐾</h1>
      <p className="text-muted-foreground">Casca rodando sobre o @fhvptech/core compartilhado.</p>
      <Button>Botão do UI kit compartilhado</Button>
    </div>
  )
}

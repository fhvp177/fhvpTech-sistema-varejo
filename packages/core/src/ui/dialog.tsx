import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // `[&>*]:min-w-0` — este diálogo é um GRID, e item de grid nasce com
      // `min-width: auto`, que significa "não encolha abaixo do seu conteúdo".
      // Uma tabela larga (ou qualquer texto que não quebre) empurrava o filho
      // além do `max-w-lg` e o conteúdo era pintado FORA da caixa branca, por
      // cima da tela de trás. Zerando o mínimo, o filho encolhe até a largura do
      // diálogo e quem tem que se virar é o conteúdo dele — quebrando linha ou
      // rolando, se tiver um `overflow-x-auto` por perto.
      //
      // Não dá pra resolver com `overflow: hidden` aqui: os seletores de cliente
      // e afins abrem lista pra fora do diálogo de propósito, e cortar isso
      // trocaria um bug visual por outro. (Por isso esses seletores desenham a
      // lista em PORTAL — ver ClienteSeletor/CidadeSeletor: assim ela não é
      // recortada pela rolagem que este diálogo agora tem.)
      //
      // `max-h-[90vh] overflow-y-auto` — o diálogo é centralizado com
      // `translate-y-[-50%]`, então um conteúdo mais alto que a janela cresce
      // pros DOIS lados: some o cabeçalho em cima e o rodapé com os botões
      // embaixo, sem rolagem que alcance nenhum dos dois. Aconteceu toda vez que
      // uma seção retrátil foi aberta dentro de um formulário já comprido.
      //
      // Fica AQUI, e não em cada diálogo, porque essa era exatamente a causa da
      // reincidência: cada tela nova nascia desprotegida e só ganhava
      // `max-h`/`overflow` depois que alguém via o defeito na tela. Com o teto
      // no componente base, todo diálogo do monorepo já nasce se contendo.
      // ── ⭐ Ele FLUTUA, também na tela estreita ─────────────────────────────
      // Abaixo de 640px o diálogo não tinha canto arredondado nenhum
      // (`sm:rounded-lg`) e, com `w-full`, encostava nas duas bordas: virava
      // uma faixa branca colada de lado a lado, sem começo nem fim.
      //
      // Agora o canto é de 16px, sobra um recuo de 16px de cada lado e a
      // sombra é a de coisa que flutua. Acima de 640px NADA muda — e a janela
      // do aplicativo instalado nunca é menor que isso.
      //
      // ⚠️ O recuo vem de `w-`, e não de `max-w-`: as chamadas do monorepo
      // passam `max-w-sm`, `max-w-md`, `max-w-[560px]`… e a última classe do
      // mesmo grupo vence. Vindo de `max-w`, cada uma delas apagaria o recuo.
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl duration-200 [&>*]:min-w-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:w-full sm:rounded-lg sm:p-6 sm:shadow-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// ⚠️ NÃO tornar cabeçalho/rodapé `sticky` sem antes trocar o DialogContent de
// `grid` para `flex flex-col`. Foi tentado: dentro de um container grid, o bloco
// que gruda se prende à ÁREA DA CÉLULA dele, não à janela de rolagem — o rodapé
// foi parar no meio do formulário, com campos aparecendo por baixo dos botões.
// Enquanto o diálogo for grid, o certo é rolar o conteúdo inteiro.
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
}

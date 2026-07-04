// Declarações de módulo para imports de imagem resolvidos pelo Vite no build.
// (Apenas tipos — o Vite já transforma esses imports em URL em runtime.)
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}

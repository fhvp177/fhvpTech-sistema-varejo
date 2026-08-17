// Flags de edição injetadas em build-time pelo electron.vite.config.ts, para o
// processo PRINCIPAL. O renderer tem as dele em src/types/electron.d.ts.
//
// São constantes literais no build, então o bundler elimina o código desligado
// em vez de apenas escondê-lo: no Básico, o multicaixa não existe no binário.

declare const __FEAT_MULTICAIXA__: boolean
/** Tapume de obra da maquininha integrada — false até a feature ficar pronta. */
declare const __FEAT_PAGAMENTO__: boolean

/** 'basico' | 'pro' — a edição com que este binário foi gerado. */
declare const __EDICAO__: string

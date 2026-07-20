// URL do backend (Fly). Uma função só, pra os handlers fiscais poderem apontar
// pra um backend LOCAL em desenvolvimento — onde a integração da ACBr roda
// contra o sandbox — sem tocar em produção.
//
// Em produção a env não existe e cai no Fly de sempre. `chat.ts` e `auth.ts`
// seguem com a constante deles (não quis mexer no que já funciona); isto é só
// pras rotas novas da nota fiscal.
const FLY_PADRAO = 'https://licenca-gnmodas.fly.dev'

export function urlBackend(): string {
  const override = process.env.FHVP_BACKEND_URL
  return (override && override.trim()) || FLY_PADRAO
}

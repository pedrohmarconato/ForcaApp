# Deploy do PWA (web) na Vercel

O app roda como PWA via `expo export -p web` publicado na Vercel. O deploy por
git está **desligado** (`git.deploymentEnabled: false` — a integração quebrava
em todo commit); publica-se manualmente com a CLI.

## Fluxo

```bash
vercel deploy --prod        # build roda NA VERCEL (buildCommand do vercel.json)
```

O `buildCommand` é `npx expo export -p web && node scripts/verify-web-bundle.mjs`.

## De onde vêm as EXPO_PUBLIC_*

O babel **inlina** `EXPO_PUBLIC_*` no bundle no momento do build. Como o build
roda na Vercel, as variáveis precisam estar no **painel do projeto Vercel**
(Settings → Environment Variables, ambiente Production):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL` → `https://forca-api.cadastrai.com/api`

## A trava que impede publicar com env errada

`scripts/verify-web-bundle.mjs` roda encadeado no build e **falha o deploy** se:

- nenhum bundle contém `forca-api.cadastrai.com` (env ausente/errada → o
  apiClient cairia silenciosamente no fallback localhost), ou
- algum endereço de LAN (`192.168.x.x`) vazou para o JS publicado (build feito
  com `.env` de desenvolvimento).

Para conferir localmente antes de subir: `npx expo export -p web && node
scripts/verify-web-bundle.mjs`.

## Decisões registradas

- **Sem service worker por enquanto** (PWA manifest-only): instalável e com
  atalho na tela de início, mas sem cache offline — offline mostra erro de
  rede. Follow-up se o offline virar requisito; um SW mal configurado cacheando
  resposta autenticada é risco maior que o benefício hoje.
- Sessão web fica em `localStorage` (limitação conhecida, documentada em
  `src/services/auth/secureStorage.ts`); headers de segurança (CSP etc.) são
  tratados em PR próprio de hardening.

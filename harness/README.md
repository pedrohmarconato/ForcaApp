# Harness visual — correções da sessão de treinamento

Harness reproduzível (sem credenciais de produção) para inspecionar a UI REAL
da sessão em Chrome a 390×844. A app exportada fala com um stub Supabase local
que devolve fixtures determinísticas — nada de produção é tocado.

## Como rodar

```bash
# 1. Exporta a app web com o env do harness (URL/anon stub)
EXPO_PUBLIC_SUPABASE_URL=http://localhost:8787 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=harness-anon-key \
  npx expo export --platform web --output-dir /tmp/forcaapp-session-fix-web

# 2. Sobe o servidor (estático + SPA fallback + stub Supabase)
cd harness && node server.mjs /tmp/forcaapp-session-fix-web

# 3. Abre no Chrome (390×844) e faz login com QUALQUER email/senha
#    (o stub aceita tudo — ex.: demo@forca.app / demo123)
open http://localhost:8787
```

## Capturas esperadas (390×844)

1. **Tela de sessão ativa** — após o login, navegar direto para
   `http://localhost:8787/home/active-session/sess-v1` (deep link com SPA
   fallback): player + barra de progresso + botão "Ver andamento". A fixture
   tem a série 1 feita, o ex-3 cortado por replan e o ex-4 recusado.
2. **Modal de andamento** — tocar "Ver andamento": fila rolável com
   concluídas/atual/pendentes (conteúdo abaixo da dobra).
3. **Após "Pular descanso"** — completar a série ativa (ex.: 8 reps × 40 kg),
   esperar o descanso aparecer e tocar "Pular descanso": o próximo card fica
   visível imediatamente.

## O que o stub responde

| Endpoint | Resposta |
| --- | --- |
| `/auth/v1/token`, `/auth/v1/signup`, `/auth/v1/user` | sessão fake (`user-1`), qualquer credencial |
| `/rest/v1/profiles` | perfil com `onboarding_completed: true` |
| `/rest/v1/training_plans` | plano ativo `plan-1` |
| `/rest/v1/planned_sessions` (detalhe `sess-v1`) | 4 exercícios × 6 séries (fixture) |
| `/rest/v1/session_logs` (aberta) | log `log-1` com série 1 feita + skip ex-4 + corte ex-3 |
| `/rest/v1/rpc/save_set_log` etc. | echo determinístico |

## Nota

O harness (`harness/`) é infraestrutura de TESTE: não entra no bundle de
produção (nenhum import do app o referencia) e não expõe rota/debug entry.

---
phase: 03
slug: interc-mbio-de-modalidade-de-cardio
status: draft
# threats_open conta somente ameaças OPEN com severidade >= workflow.security_block_on.
threats_open: 2
asvs_level: 1
block_on: high
created: 2026-08-10
---

# Phase 03 - Security

> Contrato de segurança da fase: registro STRIDE, riscos aceitos e trilha de auditoria.
> Registro construído a partir dos blocos `<threat_model>` das 9 PLAN.md (todas as 9 têm um) e
> verificado contra o código vivo pelo `gsd-security-auditor` em 2026-08-10.

**Veredicto: OPEN_THREATS — 2 ameaças bloqueantes.** As duas dependem de UMA ação: aplicar a
migration `0036_guarda_set_log_troca_cardio.sql` em produção. Não há trabalho de código
pendente — o arquivo está escrito, revisado (0 achados critical) e testado. O que falta é ele
estar vivo no banco.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| App -> PostgREST/RPC | Cliente React Native chama `swap_session_exercise` e lê `session_logs`/`cardio_exercise_swaps` com o JWT do usuário. | `session_log_id`, `planned_exercise_id`, `to_modality`, nota livre do aluno. |
| RPC `SECURITY DEFINER` -> tabelas | `swap_session_exercise` roda elevada e escreve em `cardio_exercise_swaps` somente depois de todas as guardas. | Posse do log, pertencimento do exercício, métrica de cardio, existência de série já registrada. |
| Harness de integração -> Postgres local | `__tests__/integration/getSessionLogDetail.postgrest.test.ts` usa a chave `service_role` (admin de auth) para semear e limpar. | Trava de loopback impede qualquer travessia para staging ou produção. |
| RLS por usuário | Policies "own" em `session_logs`, `cardio_exercise_swaps` e `questionario_usuario`. | Dado de treino e de anamnese de outros usuários. |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering / Elevation of Privilege | `swap_session_exercise` com `planned_exercise_id` de outra sessão ou usuário | high | mitigate | Guarda de posse do exercício em `0034_troca_modalidade_cardio.sql:194-203`, preservada byte a byte em `0035:69-78` e `0036:91-103`. Migrations 0034 e 0035 vivas em homologação e produção. | closed |
| T-03-02 | Elevation of Privilege | `anon` executando `swap_session_exercise` ou `_forca_modalidade_cardio_valida` | high | mitigate | `revoke all ... from public, anon` seguido de `grant execute ... to authenticated` em `0034:242-246`, repetido em `0035:114-115` e `0036:158-159`, com asserção `has_function_privilege` no bloco final de cada migration. | closed |
| T-03-03 | Tampering | `to_modality` fora do catálogo persistida por drift silencioso | high | mitigate | `_forca_modalidade_cardio_valida` (`0034:48-65`) mais CHECK constraint (`0034:87-95`) e teste `__tests__/cardioSwapMigration.test.ts` (12/12) comparando literalmente com `CARDIO_MODALIDADES`. | closed |
| T-03-04 | Tampering | Troca aplicada a exercício que não é de cardio | medium | mitigate | Guarda cardio-only na RPC, estreitada por `0035:80-93` para depender só de `pe.metric`, removendo o sinal `muscle_group`, mais frouxo, da 0034. | closed |
| T-03-05 | Tampering | `swapExercise` com `toModality` fora do union em runtime | medium | mitigate | `isCardioModalidade` (`src/constants/cardioModalidades.ts:50`) descarta, sem coagir, valor não reconhecido vindo do servidor, em `src/services/sessionExecutionRepository.ts:15,243,340,910`. | closed |
| T-03-06 | Information Disclosure | `getModalidadesAceitas` chamado com `userId` arbitrário | low | accept | RLS "questionario select own" (`0008_questionario_usuario.sql:29-31`, `auth.uid() = usuario_id`) decide o retorno independente do parâmetro passado. Verificada presente. | closed |
| T-03-07 | Tampering | UI oferece modalidade fora da lista aceita por bug de filtro | low | accept | A validação real é a RPC, que recusa `to_modality` fora do catálogo com 22023; a UI trata o erro sem aplicar a troca. | closed |
| T-03-08 | Information Disclosure | `to_modality` de outro usuário via embed malformado | low | accept | Embed sobre `session_logs` já filtrado por `id` mais RLS "own"; a mesma RLS de `cardio_exercise_swaps` (`0034:117-135`) filtra o array embutido. | closed |
| T-03-09a | Tampering | Segundo entry point contornando a validação de posse | low | accept | `onSolicitarTroca` reaproveita `exerciseId` de exercício real do draft renderizado, não de input livre; a guarda de posse da RPC cobre qualquer caminho de UI. | closed |
| T-03-09b | Information Disclosure / Elevation of Privilege | Harness de integração usando `service_role` sobre a rede | high | mitigate | Trava de loopback hard-fail em `__tests__/integration/getSessionLogDetail.postgrest.test.ts:54-66`, avaliada no import antes de qualquer chamada de rede; chave lida só de env var, sem default; `testPathIgnorePatterns` exclui `__tests__/integration/` da suíte padrão (`npx jest --listTests` retorna 0 ocorrências). | closed |
| T-03-10a | Tampering | Motor puro `distanciaRealizadaSemanaM` | low | accept | Sem I/O e sem input externo; agrega apenas dado que `getCardioLogs` trouxe sob RLS "own". Nenhuma superfície nova. | closed |
| T-03-10b | Tampering | Reintrodução de `planned_sets.planned_exercise_id` | medium | mitigate | `grep -rn "planned_sets(set_order, planned_exercise_id" src/` retorna vazio, reverificado em 2026-08-10, mais o harness de integração real, que falha alto contra Postgres se o bug voltar — diferente da suíte mockada, que não pega essa classe de erro por construção. | closed |
| **T-03-11** | **Tampering** | **`swap_session_exercise` aceita troca com `set_logs` já gravado (G-03-5-servidor)** | **high** | **mitigate** | **Guarda `errcode P0005` em `0036_guarda_set_log_troca_cardio.sql:126-137`, correta e testada textualmente (8/8), mas NÃO aplicada em produção.** | **open** |
| **T-03-12** | **Elevation of Privilege** | **`anon` executando a `swap_session_exercise` recriada pela 0036** | **high** | **mitigate** | **`revoke/grant` em `0036:158-159`, parte da mesma `create or replace` que não está viva em produção. A versão hoje em produção (0035) tem o próprio par revoke/grant e continua protegida contra `anon`; o que falta é a guarda de `set_logs`.** | **open** |
| T-03-13 | Tampering | Bypass do gate client-side de UX | low | accept | Plan puramente cosmética; a autorização nunca dependeu dela. Gate em `SessionQueue.tsx:117-120` e `ActiveSessionScreen.tsx:364-367`, mesmo predicado do guard real em `activeSessionStore.ts:1518`. | closed |

*Status: open / closed / open below threshold (non-blocking).*
*Somente ameaças abertas com severidade high ou critical contam para `threats_open`.*

### Defeito de registro a corrigir antes da próxima fase

`T-03-09` e `T-03-10` foram cada um reutilizado por duas plans para ameaças diferentes, com
severidade e disposição opostas:

| ID reusado | Plan A | Plan B |
|------------|--------|--------|
| `T-03-09` | 03-04 — entry point contornando posse (low, accept) | 03-07 — `service_role` sobre a rede (high, mitigate) |
| `T-03-10` | 03-06 — motor puro sem I/O (low, accept) | 03-07 — reintrodução de coluna inexistente (medium, mitigate) |

Um lookup por ID neste registro é ambíguo. Desambiguados como `a` e `b` na tabela acima.
Ação sugerida: renumerar nas fontes, atribuindo IDs novos em `03-04-PLAN.md` e `03-06-PLAN.md`
e mantendo os de `03-07-PLAN.md`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-06 | A RLS "questionario select own" decide o retorno independente do `userId` recebido; o parâmetro só alimenta o filtro `.eq()`, a policy do banco é a autoridade. Verificada presente em `0008:29-31`. | Pedro Marconato (disposição aprovada no PLAN 03-02) | 2026-08-10 |
| AR-03-02 | T-03-07 | A validação real é a RPC, não a UI: modalidade fora do catálogo é recusada com 22023 antes de qualquer persistência. Um bug de filtro no componente não grava dado inválido. | Pedro Marconato (disposição aprovada no PLAN 03-03) | 2026-08-10 |
| AR-03-03 | T-03-08 | O embed é sobre `session_logs`, já filtrado por `id` e por RLS "own"; a mesma RLS de `cardio_exercise_swaps` filtra o array embutido. Não há caminho novo para dado alheio. | Pedro Marconato (disposição aprovada no PLAN 03-05) | 2026-08-10 |
| AR-03-04 | T-03-09a | O segundo entry point reaproveita `exerciseId` de um exercício real do draft renderizado, nunca de input de texto; a guarda de posse da RPC valida independentemente do caminho de UI. | Pedro Marconato (disposição aprovada no PLAN 03-04) | 2026-08-10 |
| AR-03-05 | T-03-10a | Motor puro, sem I/O e sem input externo além de dado já lido sob RLS "own". Nenhuma superfície de ataque nova é introduzida. | Pedro Marconato (disposição aprovada no PLAN 03-06) | 2026-08-10 |
| AR-03-06 | T-03-13 | Camada de UX. Um bypass cai exatamente no mesmo comportamento de recusa que já existe hoje, pelo guard client-side e pela RPC. Nenhum risco novo. | Pedro Marconato (disposição aprovada no PLAN 03-09) | 2026-08-10 |

---

## Verification Evidence

| Control | Evidence |
|---------|----------|
| Correção da coluna em `getSessionLogDetail` (T-03-10b) | GREEN reproduzido de forma independente em 2026-08-10: `npm run test:integration:pg` contra o stack local (`http://127.0.0.1:54321`) retornou `Test Suites: 1 passed` / `Tests: 1 passed`, sem nenhuma ocorrência de `42703`. Grep de regressão em `src/` vazio. |
| Trava de loopback do harness (T-03-09b) | `getSessionLogDetail.postgrest.test.ts:54-66` avalia a regex `^http://(127\.0\.0\.1\|localhost)(:\d+)?$` no import e lança antes de qualquer chamada de rede. `npx jest --listTests` retorna 0 ocorrências de `integration/`, confirmando a exclusão da suíte padrão. |
| Guarda P0005 no arquivo da 0036 (T-03-11) | `__tests__/cardioSwapGuardaSerieConcluida.test.ts` — 8/8. `git diff` sobre 0034 e 0035 vazio, confirmando que nenhuma guarda anterior foi tocada. `03-REVIEW.md` item 2 confirma comparação byte a byte contra a 0035. |
| Suíte completa após o merge da onda | `npx jest --ci` — 141 suítes, 1619 testes, exit 0. `npx tsc --noEmit` exit 0. |
| Code review da onda | `03-REVIEW.md` — 0 critical, 2 warning (cobertura do harness novo), 2 info. |
| Aplicação da 0036 em homologação | **Não verificada por esta auditoria.** Um operador externo relata ter aplicado em `forcaapp-staging` em 2026-08-10, com `pg_get_functiondef(...) like '%errcode = ''P0005''%'` retornando `true` via `--linked`. Nem o auditor nem o orquestrador confirmaram de forma independente. `AGENTS.md:48-49` segue registrando `0000 -> 0035` nos dois ambientes e está desatualizado. |
| Aplicação da 0036 em produção | **Não existe alegação de aplicação.** Tratada como não mitigada. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-10 | 15 | 13 | 2 | gsd-security-auditor (ASVS 1, block_on high) |

Notas desta auditoria:

- Sete ameaças fechadas por mitigação verificada no código vivo; seis fechadas ao serem
  registradas no Accepted Risks Log acima. O auditor as reportou OPEN apenas porque este
  arquivo ainda não existia — em todas as seis a defesa técnica declarada no `<threat_model>`
  foi verificada presente.
- As duas ameaças abertas são a mesma dependência operacional, não dois problemas distintos.
- Achado fora do escopo desta fase, registrado para não se perder: `03-09-PLAN.md`, seção
  "Deferred / Known Risks", documenta que as 36 migrations concedem `execute` em 58 funções
  mas nenhum `grant select/insert/update/delete` em tabela para o papel `authenticated`.
  Homologação e produção só funcionam por terem sido criadas sob o comportamento legado do
  Supabase; um projeto novo criado a partir destas migrations sobe quebrado com
  "permission denied for table planned_sessions", reproduzido no `03-UAT.md`. Afeta as 36
  migrations, não o REQ-06, e foi explicitamente excluído desta rodada pelo dono.
  Candidato a fase futura de hardening de grants.

---

## Como fechar T-03-11 e T-03-12

As duas caem com a mesma ação:

```
supabase link --project-ref zanqygwsgxkyjiuhrzju
scripts/supabase-preflight.sh prod && supabase db push    # digite PRODUCAO no prompt
```

Confirmação depois, somente leitura, sem semear dado em produção:

```sql
select pg_get_functiondef('public.swap_session_exercise(uuid, uuid, text, text)'::regprocedure)
       like '%errcode = ''P0005''%' as tem_guarda_p0005;   -- esperado: true
```

Em seguida atualizar `AGENTS.md:48-49` para `0000 -> 0036` nos ambientes aplicados e re-rodar
`/gsd-secure-phase 03`.

Enquanto isso não acontece, o comportamento que o `03-UAT.md` teste 5 comprovou explorável —
chamada direta à RPC gravando troca para exercício com série já concluída — continua
reproduzível em produção. O guard client-side (`activeSessionStore.ts:1518-1521`) segue como
primeira linha de defesa do fluxo normal do app, mas não cobre chamada direta à API, build sem
o guard, nem corrida entre dois dispositivos.

---

## Sign-Off

- [x] Todas as ameaças têm disposição (mitigate / accept / transfer)
- [x] Riscos aceitos documentados no Accepted Risks Log
- [ ] `threats_open: 0` confirmado — duas abertas (T-03-11, T-03-12), aguardando a aplicação da 0036 em produção
- [ ] `status: verified` no frontmatter

**Approval:** pending

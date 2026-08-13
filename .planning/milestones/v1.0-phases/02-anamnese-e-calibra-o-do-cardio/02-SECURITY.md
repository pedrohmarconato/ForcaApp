---
phase: 02
slug: anamnese-e-calibra-o-do-cardio
status: verified
# threats_open conta somente ameaças OPEN com severidade >= workflow.security_block_on.
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-08-09
verified: 2026-08-09
---

# Phase 02 - Security

> Contrato de segurança da fase: registro STRIDE, riscos aceitos e trilha de auditoria.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Aluno -> questionário local -> prompt da IA | Payload controlado pelo cliente cruza a fronteira do app e entra em chamadas pagas ao modelo somente após sanitização local. | Preferências e anamnese de treino; dados pessoais não confiáveis como instrução. |
| Arquivo de migration -> Supabase | A migration 0033 altera tabelas existentes e reescreve uma função `SECURITY DEFINER`; aplicação exige preflight por ambiente. | Três colunas tipadas de anamnese, histórico e função de snapshot. |
| Saída da IA -> validação local -> persistência | JSON probabilístico do modelo só pode ser persistido após schema e contratos semânticos locais. | Molde de treino, dose de cardio e regras de progressão. |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering / prompt injection | `cardio_pratica_atualmente` | low | mitigate | `_questionario_para_prompt` preserva somente `bool` estrito e troca valor malformado por `None` (`backend/app.py:367-369`); teste de serialização em `backend/tests/test_dose_cardio.py`. | closed |
| T-02-02 | Repudiation / desaparecimento silencioso | Chave entre payload e backend | high | mitigate | A mesma chave `cardio_pratica_atualmente` existe na tela, no tipo da API e no lookup do backend; testes de payload cobrem a trilha (`QuestionnaireScreen.tsx`, `questionnaireService.ts`, `dose_cardio.py`). | closed |
| T-02-03 | Information Disclosure | Novas colunas em `questionario_usuario` | low | accept | RLS por `auth.uid() = usuario_id` e grants somente para `authenticated` permanecem aplicáveis às colunas novas (`supabase/migrations/0008_questionario_usuario.sql:27-41`). | closed |
| T-02-04 | Tampering | `cardio_distancia_confortavel_km` fora da faixa | medium | mitigate | Faixa `0..50` no cliente, no CHECK da migration e na sanitização do backend (`QuestionnaireScreen.tsx`, migration 0033, `backend/app.py:371-378`). | closed |
| T-02-05 | Elevation of Privilege | `snapshot_questionario()` `SECURITY DEFINER` | medium | mitigate | `revoke all ... from public, anon` reaplicado logo após `create or replace`; RLS e grants anteriores preservados (`0033_anamnese_cardio_declarada.sql:107-132`). | closed |
| T-02-06 | Tampering / prompt injection | `cardio_objetivo` forjado | medium | mitigate | Somente chaves de `_TEXTO_OBJETIVO_CARDIO` sobrevivem à sanitização e viram texto fixo; valor cru forjado não entra em nenhum prompt (`backend/app.py:380-386,1623-1684`). | closed |
| T-02-07 | Denial of Service / cost | Distância sem limite e retry pago | low | accept after mitigation | Domínio numérico limitado a `0..50` em três camadas; não há texto livre nem crescimento ilimitado do prompt. O risco residual de um valor válido provocar um retry permanece aceito. | closed |
| T-02-08 | Tampering / output integrity | `delta_cardio_percentual.valor` acima do teto por nível (WR-03) | high | mitigate | Opção A adotada: toda regra é comparada a `TETO_PROGRESSAO_POR_NIVEL` antes da persistência e a violação usa o único retry dirigido já existente (`dose_cardio.py:275-338`, `app.py:2009-2065`). | closed |

*Status: open / closed / open below threshold (non-blocking).*
*Somente ameaças abertas com severidade high ou critical contam para `threats_open`.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-03 | A migration 0033 só adiciona colunas a uma tabela já protegida. Não cria rota, tabela ou papel novo; RLS e grants continuam limitando cada usuário à própria linha. O risco residual inerente ao armazenamento dos campos não amplia a fronteira de acesso entre usuários. | Pedro Marconato (disposição aprovada no PLAN 02-01) | 2026-08-09 |
| AR-02-02 | T-02-07 | Distância é numérica, limitada a `0..50` no cliente, banco e backend. Aceita-se o risco residual de valores válidos influenciarem a geração e eventualmente consumirem o único retry, pois tamanho e domínio permanecem estritamente limitados e a quota é contabilizada por tentativa. | Pedro Marconato (disposição aprovada no PLAN 02-03) | 2026-08-09 |

---

## Verification Evidence

| Control | Evidence |
|---------|----------|
| Progression ceiling contract | RED: `TestTetoProgressaoCardio::test_iniciante_reprova_progressao_acima_do_teto` e `test_teto_de_cardio_reprova_e_ganha_retry_dirigido` falharam antes da implementação. GREEN: 8 testes direcionados passaram; 91 testes de `test_dose_cardio.py` + `test_molde_validacao_resiliente.py` passaram. |
| Bounded retry | `test_teto_de_cardio_reprova_e_ganha_retry_dirigido` prova correção na segunda resposta; `test_duas_violacoes_do_teto_terminam_sem_loop` prova erro `molde_dose_cardio` após exatamente duas chamadas. |
| Prompt-boundary sanitization | Testes provam que valores forjados não aparecem no JSON do questionário e que valores válidos são preservados. |
| Backend regression | `python3 -m pytest backend/tests -q`: 598 passed, 1 warning preexistente de LibreSSL. |
| Independent code review | `code-reviewer`: aprovado, sem achados críticos, altos ou médios. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-09 | 8 | 4 | 4 | `gsd-security-auditor` - auditoria inicial |
| 2026-08-09 | 8 | 6 | 2 | `gsd-security-auditor` - revalidação após sanitização |
| 2026-08-09 | 8 | 8 | 0 | OpenCode - riscos aceitos registrados e evidências consolidadas |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-09

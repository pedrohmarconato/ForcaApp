---
id: backend-objetivos-string-500
created: 2026-08-17
source: 15-05 (preparação da Sessão 1 física — UAT local)
severity: blocking-usage
resolves_phase:
---

# POST /api/generate-plan retorna 500: normalizer produz objetivos como strings, wrapper espera dicts

## Sintoma

`POST /api/generate-plan` devolve 500 na geração de plano pelo caminho legacy.
Reproduzido no stack local em 2026-08-17 13:33 com o usuário UAT
`da7c5429-ed33-4163-9f74-0d8837c5a47a` (log: `/tmp/forcaapp-backend-local.log`).

## Os dois lados

- **Produz lista de STRINGS:** `backend/services/questionario_normalizer.py:226-232`
  — quando `objetivo` é string, vira `objetivos = [objetivo]`; se o payload já traz
  `objetivos`, a lista é preservada como veio (strings permanecem strings).
- **Consome como DICTS:** `backend/wrappers/treinador_especialista.py:416-421` —
  `_preparar_prompt` faz `obj.get('nome', 'N/A')` / `obj.get('prioridade', 'N/A')`
  sobre cada item, assumindo `{"nome": ..., "prioridade": ...}`.

Resultado: `AttributeError: 'str' object has no attribute 'get'` → wrapper
retorna `None` → Flask responde 500.

Nota: as linhas 422-423 do mesmo arquivo têm a assunção idêntica para
`restricoes`/`lesoes` (`rest.get('nome')`, `lesao.get('regiao')`), e o
normalizer (235-242) também não as converte em dicts — mesmo crash se o
payload mandar strings nesses campos.

## Traceback resumido (log local, 2026-08-17 13:33:33)

```
File "backend/wrappers/treinador_especialista.py", line 605, in gerar_plano
    prompt = self._preparar_prompt(dados_usuario)
File "backend/wrappers/treinador_especialista.py", line 421, in _preparar_prompt
    objetivos_str = "\n".join([f"- {obj.get('nome', ...)} ..." for obj in objetivos]) ...
AttributeError: 'str' object has no attribute 'get'
FlaskAPI - ERROR - Falha na geração do plano para o usuário da7c5429-... (wrapper retornou None)
"POST /api/generate-plan HTTP/1.1" 500 -
```

## Produção pode não passar por aqui — verificar antes de confiar

`backend/app.py:99` define `FORCA_USE_MOLDE_ARCHITECTURE` (default `false`);
com `true`, `app.py:1052` despacha a geração pelo caminho **molde**, que não
passa por `_preparar_prompt`. Se o backend hospedado em produção roda com a
flag ligada, o 500 é exclusivo do caminho legacy (local). Confirmar a flag do
ambiente de produção antes de priorizar o fix — não presumir.

## Por que não foi corrigido agora

A Plano 15-05 é UAT-only (checkpoint físico da Live Activity); mexer em
backend está fora do escopo declarado. A Sessão 1 foi viabilizada semear do
planejamento direto no Supabase LOCAL descartável, sem gerar plano por IA.

## Sugestão de fix (quando for a vez)

Decidir o contrato único — lista de strings OU lista de dicts `{nome,
prioridade}` — e alinhar normalizer e wrapper ao mesmo formato, com teste que
reproduza o traceback acima. Incluir cobertura para `restricoes`/`lesoes`
(422-423), que carregam a mesma assunção.

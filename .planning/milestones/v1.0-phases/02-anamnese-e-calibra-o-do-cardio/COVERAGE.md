# Phase 2 — API Coverage

No external API integration: fase estende questionário e prompt sobre infra já integrada.

Toda a Fase 2 (REQ-04, REQ-05) é interna ao repositório: novas colunas em `questionario_usuario`
(Supabase, já integrado), novos campos de UI (React Native/Expo, já integrado) e uma instrução
nova no prompt que já é montado e enviado à API Anthropic existente (`_montar_chamada_do_molde`,
já em produção desde a Fase 1/migrations anteriores). Nenhum pacote novo, nenhum serviço externo
novo, nenhuma rota HTTP nova. Confirmado em `02-RESEARCH.md` (`## Standard Stack` e
`## Package Legitimacy Audit`).

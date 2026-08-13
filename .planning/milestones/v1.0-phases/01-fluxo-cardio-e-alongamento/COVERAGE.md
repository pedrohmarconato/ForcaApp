# Phase 1 — API Coverage

No external API integration: fase consome infra Claude/Supabase já integrada; nenhuma
superfície externa nova.

## Detalhe

- **REQ-01** (decimal do cardio): só client-side (React Native) + Supabase já configurado
  (`set_logs.actual_distance_m numeric`, RPC `save_set_log` já existente). Nenhuma chamada
  nova a serviço externo.
- **REQ-02** (prescrito × realizado): leitura nova sobre tabelas Supabase já existentes
  (`planned_sessions`/`planned_exercises`/`planned_sets`), via o cliente Supabase já
  configurado no app (`src/config/supabaseClient.js`). Nenhuma tabela, RPC ou endpoint novo.
- **REQ-03** (alongamento guiado): expande `backend/data/catalogo_exercicios.json` (dado
  estático versionado, sem I/O em runtime) e reforça o prompt já enviado à API Anthropic via
  `backend/wrappers/` — a integração com a API de IA já existe (`/api/generate-plan`,
  `/api/consolidate-chat`); esta fase só muda o CONTEÚDO do prompt e do catálogo, não a
  integração em si.

Nenhum pacote novo (npm/pip) é instalado nesta fase — confirmado em RESEARCH.md
("Package Legitimacy Audit: Não aplicável").

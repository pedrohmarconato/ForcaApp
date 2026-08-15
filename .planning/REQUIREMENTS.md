# Requirements — Milestone v1.2 "App de iPhone instalável via site (PWA)"

Escopo: elevar o PWA em produção (Vercel) a app de primeira classe no iPhone —
instalável pelo site, sem App Store e sem conta Apple — para ~20 usuários
(família/alunos). Decisão de contorno (pesquisa 2026-08-14): distribuição nativa
fora da App Store no Brasil exige Apple Developer pago; dono optou por não pagar.
Pesquisa completa em `.planning/research/` (SUMMARY.md, commit 95e5f40).

## v1.2 Requirements

### Instalação e identidade (INST)

- [ ] **INST-01**: Aluno instala o ForcaApp pela Tela de Início e o app abre
  standalone — splash screen iOS correta (sem flash branco), ícone e nome próprios.

- [x] **INST-02**: Usuário leigo instala sozinho pela página `/instalar` do app:
  passo a passo com detecção de iOS/Safari e de "já instalado".

### Offline e atualização (OFF)

- [x] **OFF-01**: O app instalado abre sem rede (app shell via service worker);
  o outbox offline-first do v1.0 segue como única camada de retry de dados — o SW
  nunca intercepta chamadas Supabase/PostgREST/API.

- [x] **OFF-02**: Versão nova chega com aviso não-bloqueante (nunca reload forçado
  durante sessão de treino) e os headers de cache da Vercel impedem usuário preso
  em versão velha (`sw.js`/manifest com no-cache).

### Push (PUSH)

- [x] **PUSH-01**: Infra de push ponta a ponta — botão "Ativar notificações" com
  gesto síncrono do usuário, tabela `push_subscriptions` no Supabase (RLS por
  usuário), envio via `pywebpush` no Flask existente; spike técnico prévio de
  expiração/HTTP 410 antes da implementação (decisão da pesquisa).

- [x] **PUSH-02**: Aluno recebe lembrete de treino no dia/horário configurado.

- [x] **PUSH-03**: Aluno recebe notificação quando o replanejamento semanal fica
  pronto (gatilho no job existente do Flask).

- [ ] **PUSH-04**: Badge no ícone do app com pendência de treino (gated por
  permissão de push concedida).

- [x] **PUSH-05**: Tocar na notificação de treino abre o app direto na tela da
  sessão para registrar reps/peso — 1 toque do bloqueio ao registro.

### Sessão de treino (SESS)

- [ ] **SESS-01**: Durante a sessão de treino ativa, a tela do iPhone não bloqueia
  (Screen Wake Lock, Safari iOS 16.4+) — treino, timer e campos de reps/peso ficam
  sempre visíveis, sem desbloquear; o lock é liberado ao fim da sessão. Origem:
  pedido do dono ("ver o treino e registrar sem desbloquear o celular") — o
  equivalente web do `expo-keep-awake` já usado no alvo nativo.

### Runtime web (WEB)

- [ ] **WEB-01**: Nenhum diálogo/botão mudo no alvo web — shim central de Alert
  (mesmo padrão de `haptics.ts`/`secureStorage.ts`), migração dos 12 call sites em
  6 arquivos e auditoria completa da classe (`grep Alert\.` zerado ou justificado).

## Future Requirements

- Persistent Storage API para blindar o outbox contra evicção (deferido: com PWA
  instalado a evicção já é branda; sem relato real de perda).

- Cartão de treino vivo na tela bloqueada (Live Activity) com botões de série —
  porta que só reabre com app nativo + Apple Developer pago (US$ 99/ano); mesmo
  nativo, digitação livre de peso no bloqueio não existe (limite da Apple).

- Detecção Safari vs Chrome iOS na página `/instalar` (não selecionado pelo dono).
- Herdados do v1.1: limpeza da tabela `cardio_goals` órfã; GRANT DML para
  `authenticated` nas migrations; texto literal do erro de produção do debug
  `typeerror-envio-series-treino`.

## Out of Scope

- Registrar reps/peso NA notificação/tela bloqueada sem abrir o app — API nativa
  (Live Activities/ações interativas), inexistente para PWA; substituído por
  SESS-01 (tela nunca bloqueia durante o treino) + PUSH-05 (1 toque para a sessão).

- Distribuição nativa (Ad Hoc/TestFlight/marketplace alternativo do TCC CADE) —
  todas exigem Apple Developer pago; decisão do dono de não pagar (2026-08-14).

- SDK de push de terceiros (OneSignal etc.) — iOS 16.4+ implementa Web Push padrão;
  infra própria via `pywebpush` no Flask existente.

- Service worker interceptando chamadas de dados (Supabase/API) — duplicaria a
  camada de retry do outbox validado no v1.0 (pitfall confirmado na pesquisa).

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| INST-01 | Phase 10 | Pending |
| INST-02 | Phase 12 | Complete |
| OFF-01 | Phase 11 | Complete |
| OFF-02 | Phase 11 | Complete |
| PUSH-01 | Phase 13 | Complete |
| PUSH-02 | Phase 13 | Complete |
| PUSH-03 | Phase 13 | Complete |
| PUSH-04 | Phase 13 | Pending |
| PUSH-05 | Phase 13 | Complete |
| SESS-01 | Phase 9 | Pending |
| WEB-01 | Phase 9 | Pending |

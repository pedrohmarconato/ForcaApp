# Fase 16 — Plano 11 — Task 1: Proveniência do build (registro literal)

Registrado por um executor de continuação, retomando após um `npm run resign`
que já havia rodado e terminado com sucesso (exit 0, `** BUILD SUCCEEDED **`,
instalado no aparelho) numa sessão anterior cujo transcript foi perdido antes
de registrar a proveniência. Este arquivo é o registro de proveniência exigido
pelo `acceptance_criteria` da Task 1 de `16-11-PLAN.md`, produzido por
inspeção direta do build já instalado — não presumido.

**IMPORTANTE:** este arquivo cobre SÓ a Task 1 (`type="auto"`) desta plano. A
Task 2 (`type="checkpoint:human-verify" gate="blocking"`) é uma sessão física
no aparelho do dono e NÃO foi executada, simulada, nem aprovada por este
registro. Nenhuma resposta do dono está refletida aqui.

## (a) Commit e estado da árvore

- Build instalado às 15:07 (bundleID `com.pmarconato.forcaapp`, UDID
  `4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7`, "iPhone de Pedro Henrique", iPhone
  13). Build finalizado 15:08:00 (per log de build referenciado no prompt
  desta continuação).
- No momento deste registro, `HEAD` está em `b05e4b2e3859db7525a6b3e7db66d48d1ad2ec19`
  (`b05e4b2`, "docs(phase-16): update tracking after wave 1"), commitado em
  `2026-08-18T12:29:08-03:00` — ou seja, ANTES da janela do build (15:06-15:08),
  então o build instalado no aparelho é consistente com este HEAD (nenhum
  commit novo aconteceu entre o commit e a instalação).
- `git status --short` no momento deste registro: **NÃO está limpo.** Único
  item:
  ```
   M .planning/STATE.md
  ```
  Essa alteração é pré-existente (rastreamento do orquestrador de fases —
  `.planning/STATE.md`, 4 inserções/4 remoções), NÃO é código-fonte do app, e
  NÃO estava presente durante a janela do build (15:06-15:08) — é um artefato
  de tracking desta sessão de continuação, gerado depois do build já
  instalado. Isto é relatado literalmente, sem presumir "árvore limpa" onde
  não está.

## (b) Strings da Plano 16-10 no bytecode Hermes do bundle instalado

Bundle inspecionado (o que está DENTRO do `.app` já instalado, não uma
rebuild): `/Users/phmarconato/Library/Developer/Xcode/DerivedData/ForcaApp-cmcqxhovmczojncrjtybnwlvfjjs/Build/Products/Release-iphoneos/ForcaApp.app/main.jsbundle`
(`file`: "Hermes JavaScript bytecode, version 96"; mtime 18/08 15:06, dentro
da janela do build).

Strings exatas buscadas foram lidas diretamente do código-fonte
(`src/store/activeSessionStore.ts:1235-1301`), não de memória:

- `stepLoad`: `console.warn('[activeSession] carga (stepper) não persistida (não-fatal):', e)`
- `setDuration`: `console.warn('[activeSession] duração não persistida (não-fatal):', e)`

**Achado:** busca ingênua por bytes UTF-8 não encontrou nenhuma das strings
(nem as novas da 16-10, nem as antigas de 16-08 — `setReps`/`setLoad`), porque
o Hermes bytecode armazena strings com acento em UTF-16 (LE ou BE), não UTF-8.
Refazendo a busca em UTF-16:

- `carga (stepper) não persistida (não-fatal):` — **FOUND**, 1 ocorrência.
  Contexto decodificado ao redor do match:
  `'e registrada):[activeSession] carga (stepper) não persistida (não-fatal):[activeSession] carga não pers'`
- `duração não persistida (não-fatal):` — **FOUND**, 1 ocorrência. Contexto
  decodificado ao redor do match:
  `'a (não-fatal):[activeSession] duração não persistida (não-fatal):[activeSession] esforço perceb'`

Ambas as strings literais introduzidas pela Plano 16-10 (Task 1: `stepLoad`;
Task 2: `setDuration`) estão presentes no `main.jsbundle` já instalado no
aparelho, em sequência com os warns vizinhos (`setLoad`, `setEffort`) exatamente
como no código-fonte atual (`activeSessionStore.ts:1221-1337`) — consistente
com um bundle remontado a partir do HEAD atual, não um bundle stale de antes
da 16-10.

## (c) Ambiente Supabase do build instalado

Per constraint do prompt desta continuação, `.env` NÃO foi lido (leitura
negada por sandbox). Evidência vem EXCLUSIVAMENTE do bytecode do bundle já
instalado — mais fraca que a verificação de `16-09-SUMMARY.md`, que checou o
`.env` ativo diretamente. Nenhuma anon key foi impressa ou buscada.

Busca no bundle por:
- `zanqygwsgxkyjiuhrzju` (ref do projeto de produção, per `15-04-PLAN.md`/`STATE.md`): **NOT FOUND** em nenhum lugar do bundle.
- Ocorrências de `192.168.15.77`: duas URLs literais encontradas —
  `http://192.168.15.77:5001/api` e `http://192.168.15.77:54321`.
- `http://localhost:9999` também presente (porta padrão do GoTrue local do
  Supabase CLI).

A porta `54321` é a porta padrão do API gateway do stack local do Supabase
CLI (`supabase start`). Isso, somado à ausência total da ref de produção
`zanqygwsgxkyjiuhrzju` em qualquer string do bundle, é evidência consistente
com **Supabase LOCAL via LAN** (host `192.168.15.77:54321`) — o mesmo
ambiente já registrado em `16-09-SUMMARY.md`/`16-10-SUMMARY.md` e na memória
do projeto (`base-local-e-contas-uat.md`: "build do device usa Supabase LOCAL
via LAN 192.168.15.77").

Não é uma confirmação direta de `EXPO_PUBLIC_SUPABASE_URL` (que exigiria ler
o `.env`, indisponível nesta sessão) — é inferência a partir de strings
embutidas no bundle já compilado. Reportado como **local-via-LAN, evidência
de bundle** (mais fraca que 16-09, que teve leitura direta do `.env`), não
como UNCONFIRMED, dado que a ausência da ref de produção e a presença da
porta 54321 apontam consistentemente na mesma direção.

## Escopo desta Task 1

`npm run resign` NÃO foi executado novamente por este executor — já havia
rodado e terminado com sucesso numa sessão anterior (exit 0, 8 estágios,
`** BUILD SUCCEEDED **`, instalado às 15:07, gate `verify-native-skeleton.sh`
passou 2 rodadas consecutivas, per fatos estabelecidos no prompt desta
continuação). Este arquivo apenas completa o registro de proveniência que a
sessão anterior não deixou gravado antes de perder o transcript.

A Task 2 (sessão física do dono) permanece pendente — ver
`16-11-PLAN.md` para o runbook completo. CMD-01/CMD-02 permanecem
`Gaps Found` em `REQUIREMENTS.md`; nada nesta plano os marca como completos.

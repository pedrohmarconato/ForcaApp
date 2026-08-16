---
id: backend-supabase-producao-no-aparelho
created: 2026-08-16
source: 14-06 (Sessão 1 física)
severity: blocking-usage
resolves_phase:
---

# Apontar o app do aparelho para o Supabase em produção

## Decisão do dono (2026-08-16, literal)

> "registrar que iremos usar o supabase em producao conectado ao banco original
> depois vamos completar a fase 14"

## O problema observado

Durante a Sessão 1 física (Plano 14-06), o app instalado no iPhone abriu
normalmente, mas o login não completa.

Causa, diagnosticada na sessão:

1. `.env` define `EXPO_PUBLIC_SUPABASE_URL` apontando para `127.0.0.1:54321`.
   Dentro do iPhone, `127.0.0.1` é o próprio aparelho — não o Mac
   (`192.168.15.77`). No navegador funcionava porque o navegador roda no Mac.
2. O Supabase local nem estava em execução: nada escutando em `:54321`
   (`lsof -nP -iTCP:54321 -sTCP:LISTEN` retornou vazio).

## Por que apontar para o Mac não resolve

O milestone v1.3 existe para o dono treinar com o celular na academia. Backend
em `localhost` ou no IP da LAN do Mac só funciona com o Mac ligado e o aparelho
na mesma Wi-Fi — não atende ao caso de uso.

## O que fazer

Apontar `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` para o
projeto Supabase hospedado, conectado ao banco original.

Pendência conhecida a resolver junto: a CLI do Supabase está autenticada na
conta errada (registrado em memória do projeto antes desta fase).

## Fora de escopo da Fase 14

A Fase 14 entrega a fundação nativa (NAT-01, NAT-02): o app compila, instala,
abre no aparelho e o round-trip de App Groups funciona. Nada disso depende do
login. Este item foi separado deliberadamente para não expandir o escopo da
fase em silêncio.

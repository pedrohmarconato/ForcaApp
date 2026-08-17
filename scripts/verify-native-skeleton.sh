#!/usr/bin/env bash
# scripts/verify-native-skeleton.sh — trava de regressão do esqueleto nativo
# (target de widget + módulos Expo locais).
#
# Por que existe: `expo prebuild --clean` regenera `ios/` do zero a cada
# execução. Se o target `session-widget` (via @bacons/apple-targets) ou os
# módulos `native-info`/`live-activity` (autolinked) pararem de sobreviver a um --clean —
# por drift de config, plugin quebrado, ou edição acidental fora do padrão
# esperado — o sintoma só aparece na hora do build físico, potencialmente
# no meio de uma sessão com o dono (Plano 14-06/14-07). Este script prova
# as sete condições ANTES disso, em 1 comando, e roda 2x consecutivas
# sem alteração de estado para confirmar que o resultado é estável.
#
# Também guarda contra o Pitfall 5 (RESEARCH.md): nenhuma entitlement de
# push (aps-environment) pode vazar para nenhum target antes da hora — só
# a Plano 14-05, depois de um spike aprovado, pode introduzir isso.
#
# A checagem (e) foi adicionada depois de um bug real: native-info passava
# em (d) — autolinking o "encontrava" no disco — mas nunca era compilado no
# projeto Xcode porque faltava apple.podspecPath/package.json/dependência de
# workspace. (e) prova o resultado terminal (ios/Podfile.lock), não só a
# descoberta, para os dois módulos locais.
#
# A checagem (f) foi adicionada depois de outro bug real (Plano 14-04):
# scripts/resign.sh buildava em configuração Debug, que NÃO embute
# main.jsbundle (só roda com um Metro dev server). O app instalava e abria
# no device, mas nenhuma linha de JS executava — provado empiricamente na
# Plano 14-06. (f) é uma checagem estática e barata (grep em resign.sh, sem
# build) porque provar de verdade que main.jsbundle está embutido exigiria
# rodar um build Release inteiro (minutos) dentro deste gate, que roda a
# cada `npm run resign` — trade-off inaceitável para uma checagem que já
# roda 2x por chamada. A checagem estática não prova o bundle em si, mas
# prova que a config que o gera (Release) não regrediu para Debug.
#
# Uso:
#   bash scripts/verify-native-skeleton.sh
#   npm run verify:native
#
# Saída 0 = esqueleto nativo íntegro, reproduzível, sem regressão. Saída
# != 0 = alguma das sete checagens falhou; a mensagem ABORTADO diz qual
# e como corrigir.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# As sete checagens (a)-(g). Chamadas duas vezes (rodada 1 e rodada 2),
# sem nenhuma mudança de arquivo entre elas, para provar idempotência.
# ---------------------------------------------------------------------------
rodar_checagens() {
  local rodada="$1"

  # (a) prebuild --clean precisa terminar sem erro.
  if ! npx expo prebuild -p ios --clean --non-interactive >/tmp/verify-native-skeleton-prebuild.log 2>&1; then
    vermelho "ABORTADO: [rodada ${rodada}] expo prebuild -p ios --clean falhou."
    echo "  Veja: /tmp/verify-native-skeleton-prebuild.log" >&2
    echo "  Corrija o erro de prebuild e rode de novo: npx expo prebuild -p ios --clean" >&2
    exit 1
  fi

  # (b) o target session-widget precisa sobreviver ao --clean.
  if ! grep -q session-widget ios/*.xcodeproj/project.pbxproj 2>/dev/null; then
    vermelho "ABORTADO: [rodada ${rodada}] target session-widget não sobreviveu ao --clean."
    echo "  Confira targets/session-widget/expo-target.config.js e o plugin" >&2
    echo "  \"@bacons/apple-targets\" em app.json (expo.plugins)." >&2
    exit 1
  fi

  # (c) nenhum .entitlements gerado pode conter aps-environment. Usa `find`
  # (não glob) porque o target de widget grava seu entitlements dentro de
  # ios/.targets/<slug>/ — um diretório oculto que ios/*/*.entitlements não
  # alcança.
  local arquivo_entitlements
  while IFS= read -r arquivo_entitlements; do
    if grep -q aps-environment "$arquivo_entitlements" 2>/dev/null; then
      vermelho "ABORTADO: [rodada ${rodada}] aps-environment vazou para ${arquivo_entitlements}."
      echo "  Nenhum plano antes da Plano 14-05 (spike de App Group aprovado)" >&2
      echo "  pode declarar essa capability. Remova de app.json/expo-target.config.js." >&2
      exit 1
    fi
  done < <(find ios -name '*.entitlements')

  # (d) os módulos locais precisam aparecer no autolinking do iOS.
  local autolinking
  autolinking="$(npx expo-modules-autolinking search --platform ios 2>/dev/null)"
  if ! grep -q native-info <<<"$autolinking" || ! grep -q live-activity <<<"$autolinking"; then
    vermelho "ABORTADO: [rodada ${rodada}] native-info e/ou live-activity não foram autolinked."
    echo "  Confira os expo-module.config.json e que os módulos" >&2
    echo "  estão sob o nativeModulesDir default (./modules)." >&2
    exit 1
  fi

  # (e) autolinking "search" só prova que o módulo foi ENCONTRADO no disco —
  # não que ele foi de fato COMPILADO no projeto. O bug real (fase 14) foi
  # exatamente esse: native-info passava em (d) mas nunca aparecia no
  # Podfile.lock porque faltava apple.podspecPath/package.json/dependência
  # no workspace, então NativeInfoModule não existia em tempo de execução
  # no device. Por isso (e) checa o resultado terminal do `pod install`
  # (ios/Podfile.lock) para o módulo local restante, não só a descoberta.
  #
  # AppGroupSpikeModule foi removido da lista nesta checagem na Plano 14-07:
  # o spike D-09 terminou PASS e `modules/app-group-spike/` (módulo
  # descartável, único propósito era esse spike) foi deletado por inteiro —
  # não há mais um módulo com esse nome para o autolinking encontrar, então
  # mantê-lo aqui faria a checagem falhar sempre, não protegeria nada.
  local modulo_local
  for modulo_local in NativeInfoModule LiveActivityModule; do
    if ! grep -q "^  ${modulo_local}:" ios/Podfile.lock 2>/dev/null; then
      vermelho "ABORTADO: [rodada ${rodada}] ${modulo_local} não está linkado em ios/Podfile.lock."
      echo "  Módulo presente em disco (checagem d) mas nunca compilado no" >&2
      echo "  projeto Xcode gerado — confira apple.podspecPath no" >&2
      echo "  expo-module.config.json do módulo, o .podspec correspondente e" >&2
      echo "  a entrada de dependência (\"*\") em package.json/workspaces." >&2
      exit 1
    fi
  done

  # (f) scripts/resign.sh precisa continuar buildando em -configuration
  # Release. Ver o bloco de comentário acima da função para o porquê. Não
  # depende de ios/ nem do prebuild desta rodada — é uma checagem estática
  # do próprio script, mas roda dentro do loop por simplicidade (é
  # instantânea; não há custo em rodar 2x).
  if grep -q -- "-configuration Debug" scripts/resign.sh 2>/dev/null; then
    vermelho "ABORTADO: [rodada ${rodada}] scripts/resign.sh voltou a usar -configuration Debug."
    echo "  Debug não embute main.jsbundle — o app instala e abre, mas nenhuma" >&2
    echo "  linha de JS roda (precisa de Metro). Troque para -configuration" >&2
    echo "  Release (e o find em DerivedData correspondente para" >&2
    echo "  *Release-iphoneos*)." >&2
    exit 1
  fi
  if ! grep -q -- "-configuration Release" scripts/resign.sh 2>/dev/null; then
    vermelho "ABORTADO: [rodada ${rodada}] scripts/resign.sh não declara -configuration Release."
    echo "  Confira a etapa 4/8 de scripts/resign.sh." >&2
    exit 1
  fi

  # (g) os três LiveActivityIntents (Fase 16, CMD) precisam existir nos DOIS
  # targets — modules/live-activity/ios/ (perform() real, roda no processo
  # do app) e targets/session-widget/ (stub trivial, só para o
  # Button(intent:) compilar na extensão). Os pares NÃO são bytes-idênticos
  # por design nesta fase (ver Nota de arquitetura do 16-01-PLAN.md) — esta
  # checagem confirma só presença + declaração do struct, não diff de
  # conteúdo.
  local nome_intent
  for nome_intent in CompleteSetIntent SkipRestIntent AdjustRestIntent; do
    if ! grep -q "struct ${nome_intent}" "modules/live-activity/ios/${nome_intent}.swift" 2>/dev/null; then
      vermelho "ABORTADO: [rodada ${rodada}] ${nome_intent} não existe nos dois targets (app + extensão)."
      echo "  Falta modules/live-activity/ios/${nome_intent}.swift ou não declara" >&2
      echo "  \"struct ${nome_intent}\"." >&2
      exit 1
    fi
    if ! grep -q "struct ${nome_intent}" "targets/session-widget/${nome_intent}.swift" 2>/dev/null; then
      vermelho "ABORTADO: [rodada ${rodada}] ${nome_intent} não existe nos dois targets (app + extensão)."
      echo "  Falta targets/session-widget/${nome_intent}.swift ou não declara" >&2
      echo "  \"struct ${nome_intent}\"." >&2
      exit 1
    fi
  done

  amarelo "  Rodada ${rodada}: (a)-(g) OK."
}

echo "Verificando esqueleto nativo (session-widget + native-info + live-activity)..."

# Cada chamada aborta com "ABORTADO: [rodada N] ..." e exit 1 assim que
# encontrar uma falha — nenhuma das duas rodadas usa subshell, então a
# mensagem de erro chega ao terminal (não fica presa numa captura de
# variável) e o `set -e` propaga o exit imediatamente. Se as duas rodadas
# terminarem sem abortar, o resultado foi idêntico (PASS/PASS) nas duas
# execuções sem nenhuma mudança de estado entre elas.
rodar_checagens 1
rodar_checagens 2

verde "OK: esqueleto nativo sobrevive ao --clean (2x consecutivas)."
exit 0

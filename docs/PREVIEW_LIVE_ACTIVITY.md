# Preview do card de Live Activity no Xcode

Loop rápido para ver o card da Lock Screen sem instalar no device (sem os ~9
min de resign). Cobre os três estados: descanso, série em andamento e
pronto/tempo extra.

## Passo a passo

1. Abra `ios/ForcaApp.xcworkspace` no Xcode (não o `.xcodeproj`).
2. No navegador de arquivos (painel esquerdo), abra
   `targets/session-widget/WidgetLiveActivity.swift`.
3. Ligue o canvas: menu **Editor > Canvas**, ou o atalho **Option+Cmd+Return**.
4. O canvas mostra os previews declarados no fim do arquivo, dentro do bloco
   `#if DEBUG`. Use o seletor no topo do canvas (ou a lista de variantes) para
   trocar entre:
   - **Descanso — amarelo** — timer de descanso correndo, nome curto.
   - **Série — nome longo, azul** — steppers de reps/carga, nome de
     exercício longo (para checar truncamento do cabeçalho).
   - **Pronto — verde, tempo extra** — herói "PRONTO" com contador de
     overtime e a linha "A SEGUIR".
5. Editar o layout no arquivo atualiza o canvas sozinho. Se ele pausar
   (ícone de play no canto do preview), retome com **Option+Cmd+P**.
6. Erro de build do preview aparece dentro do próprio canvas — não precisa
   rodar o app nem gerar Live Activity real para ver a maioria dos problemas
   de layout.

## Aviso importante

O card real na tela bloqueada tem um **teto de altura imposto pelo sistema**
(a apresentação de Live Activity não cresce livremente). O preview do canvas
é a forma barata de ajustar o layout dentro desse teto antes de instalar no
iPhone — a validação final ainda é no device, mas a maior parte da iteração
de "cabe ou não cabe" já dá para resolver aqui.

## Por que os previews não aparecem no app instalado

Estão isolados sob `#if DEBUG` em `WidgetLiveActivity.swift`: a configuração
Release do target `session-widget` não define a flag `DEBUG`, então esse
bloco nunca compila para o binário de produção.

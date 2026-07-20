# Conferência visual — identidade "Força sem ruído"

Capturas das telas remodeladas na Direção visual 02.

| Arquivo | Tela |
| --- | --- |
| `01-login.png` | 01 Login |
| `04-hoje.png` | 04 Hoje |
| `06-perfil.png` | 06 Perfil |

## Como foram geradas

As telas foram renderizadas com `react-native-web` num ambiente headless
(preset `jest-expo/web`), com as fontes da marca embutidas e as regras de
estilo do RNW serializadas a partir do CSSOM. Em seguida, `chrome --headless`
fotografou o HTML resultante em 430×932.

Os dados exibidos nas capturas vêm de fixtures — servem para conferir a
linguagem visual, não para atestar números de produção.

> **Nota sobre o `expo start --web`**: o app não sobe no navegador porque o
> bundle web quebra com `Uncaught SyntaxError: Cannot use 'import.meta' outside
> a module`, vindo do build ESM do `zustand`. É condição preexistente (o
> `zustand` entrou no commit `c83ee55`, Fase 4) e não afeta iOS/Android —
> `npx expo export --platform ios` gera o bundle sem erro.

import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private let activityBackground = Color(red: 0.039, green: 0.039, blue: 0.039)
private let activitySecondary = Color(red: 0.545, green: 0.565, blue: 0.596)
/// IN-01 (review 2026-08-19): fallback do passo de carga quando o incremento
/// configurado do exercício não chega ao widget — o MESMO 2.5 que o app usa
/// como incremento default de carga. Extraído do literal duplicado nos dois
/// botões do stepper de carga da Lock Screen.
private let defaultLoadIncrementKg: Double = 2.5

// MARK: - Orçamento de altura do Lock Screen (correção de 2026-08-24)
//
// PESQUISA: a especificação de Live Activities da Human Interface Guidelines
// (developer.apple.com/design/human-interface-guidelines/components/system-experiences/live-activities)
// documenta a apresentação expandida de Lock Screen com faixa de altura
// 84–160pt (a mesma faixa aparece nas larguras de iPhone e iPad da tabela de
// especificações); 160pt é o topo dessa faixa e é o número citado de forma
// consistente pela comunidade técnica (Notificare, engenharia da Nature.com,
// etc.) como o ponto em que o sistema PASSA A CORTAR (clip), não encolher, o
// conteúdo que excede — nenhuma frase em prosa da HIG usa literalmente a
// palavra "corta" ao lado do número, mas o comportamento é unânime entre as
// fontes técnicas encontradas E bate com a evidência de campo: a foto do
// dono (iPhone 13, iOS 26, sem Dynamic Island — a Dynamic Island não muda o
// teto do Lock Screen, só a apresentação com tela desbloqueada) mede um
// envelope visível de ~162pt, a ~2pt do valor pesquisado. Por isso este
// arquivo usa 160pt como teto apurado e exige que a soma de cada estado
// fique pelo menos 10% abaixo dele (<=144pt) — ver
// __tests__/liveActivitySwiftContract.test.ts, describe "orçamento de altura
// do Lock Screen", que soma estas constantes com a MESMA fórmula usada aqui
// (altura de linha ≈ arredondar para cima de tamanho da fonte × 1.2) e falha
// se algum estado passar do teto.
//
// Larguras: a HIG cita ~14pt de margem do próprio sistema em cada borda,
// somados ao NOSSO `.padding()` (cardHorizontalPadding) — o resultado bate
// com a estimativa empírica já registrada no código antes desta correção
// ("~313pt úteis" para a coluna de conteúdo depois da barra de acento).
//
// Os botões −/+ do stepper (stepperGlyphSize) continuam em 44pt: é o piso de
// alvo de toque de acessibilidade geral da HIG (não há uma exceção
// documentada para Live Activity/WidgetKit) e é o MESMO piso que corrigiu o
// bug de campo anterior (botões sem tamanho travado comprimindo o número a
// zero) — não regride. Onde a conta abaixo aponta um botão abaixo de 44pt
// (as duas faixas de ação de largura total), o comentário da função explica
// o trade-off consciente.
private let cardHorizontalPadding: CGFloat = 16
private let cardVerticalPadding: CGFloat = 4
private let bodySpacing: CGFloat = 3
private let headerFontSize: CGFloat = 13
private let heroLabelFontSize: CGFloat = 11
private let heroBlockInnerSpacing: CGFloat = 2
private let restHeroSize: CGFloat = 42
private let readyHeroSize: CGFloat = 46
private let neonBlockPaddingTop: CGFloat = 4
private let neonBlockPaddingBottom: CGFloat = 4
private let stepperGroupHorizontalPadding: CGFloat = 10
private let stepperRowVerticalPadding: CGFloat = 8
private let stepperGlyphSize: CGFloat = 44
private let stepperValueFontSize: CGFloat = 28
private let stepperLabelFontSize: CGFloat = 10
private let actionButtonFontSize: CGFloat = 16
private let actionButtonVerticalPadding: CGFloat = 7

/// Acento neon derivado do ContentState (D-01/D-10). Switch fechado sobre as
/// quatro chaves com os canais RGB exatos dos hexes aprovados; `default`
/// cobre nil e string desconhecida — Activities legadas ou valores fora do
/// contrato convergem sempre para yellow, nunca para uma cor arbitrária.
private func neonAccent(for state: SessionActivityAttributes.ContentState) -> Color {
    switch state.neonColor {
    case "yellow":
        return Color(red: 235.0 / 255.0, green: 255.0 / 255.0, blue: 0.0 / 255.0)
    case "blue":
        return Color(red: 0.0 / 255.0, green: 229.0 / 255.0, blue: 255.0 / 255.0)
    case "green":
        return Color(red: 57.0 / 255.0, green: 255.0 / 255.0, blue: 20.0 / 255.0)
    case "red":
        return Color(red: 255.0 / 255.0, green: 49.0 / 255.0, blue: 49.0 / 255.0)
    default:
        return Color(red: 235.0 / 255.0, green: 255.0 / 255.0, blue: 0.0 / 255.0)
    }
}

private func prescriptionText(_ state: SessionActivityAttributes.ContentState) -> String {
    if state.isBodyweight {
        return "Peso corporal"
    }

    let min = state.targetRepsMin.map(String.init) ?? "—"
    let max = state.targetRepsMax.map(String.init) ?? "—"
    guard let load = state.targetLoadKg else {
        return "\(min)–\(max) reps"
    }
    return "\(min)–\(max) reps × \(String(format: "%g", load)) kg"
}

private func seriesText(_ state: SessionActivityAttributes.ContentState) -> String {
    "Série \(state.setIndex)/\(state.setTotal)"
}

/// Conteúdo da linha "A SEGUIR" (Fase 17, PRED-01): o MESMO valor que vai
/// nascer pré-preenchido quando essa série virar a atual (`suggestReps()`/
/// `suggestLoad()`), nunca o número cru da prescrição. Quando só
/// `nextExerciseName` existe (virada para bloco de cardio/alongamento, D-03
/// da Fase 15), mostra só o nome — sem detalhes de série.
///
/// Decisão aprovada (card mais alto, agosto/2026): usada SÓ em
/// `.readyOvertime` — na transição para a próxima série é o único momento em
/// que saber o que vem a seguir importa fisicamente (D-15). `.resting` não
/// chama mais esta função; o espaço que ela ocupava foi para o herói do
/// timer de descanso.
private func nextUpDetailText(_ state: SessionActivityAttributes.ContentState) -> String {
    guard let name = state.nextExerciseName else { return "" }
    guard let setIndex = state.nextSetIndex, let setTotal = state.nextSetTotal else {
        return name
    }
    var valor = state.nextIsBodyweight == true
        ? "peso corporal"
        : state.nextSuggestedReps.map { "\($0) reps" } ?? "—"
    if state.nextIsBodyweight != true, let load = state.nextSuggestedLoadKg {
        valor += ", \(String(format: "%g", load)) kg"
    }
    return "\(name) · Série \(setIndex)/\(setTotal) · \(valor)"
}

/// Muda de exercício na virada? É a ÚNICA transição que altera o que o dono
/// faz fisicamente (D-15) — só ela recebe destaque visual.
private func nextUpIsExerciseChange(_ state: SessionActivityAttributes.ContentState) -> Bool {
    state.nextExerciseName != nil && state.nextExerciseName != state.exerciseName
}

/// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo dono):
/// tipografia condensada em caixa alta com tracking, igual ao resto do card.
/// O destaque de mudança de exercício (D-15) é preservado só via COR — neon
/// no lugar de branco/activitySecondary — nunca mais via peso de fonte, já
/// que o peso agora é fixo (semibold) para bater com a especificação do
/// rótulo e do detalhe.
@ViewBuilder
private func nextUpLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    if state.nextExerciseName != nil {
        let destaque = nextUpIsExerciseChange(state)
        VStack(alignment: .leading, spacing: 2) {
            Text("A SEGUIR")
                .font(.system(size: 11, weight: .semibold).width(.condensed))
                .tracking(2.2)
                .foregroundColor(destaque ? neonAccent(for: state) : activitySecondary)
            Text(nextUpDetailText(state))
                .font(.system(size: 17, weight: .semibold).width(.condensed))
                .foregroundColor(destaque ? neonAccent(for: state) : .white)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

/// D-04 (Fase 15, Plano 15-07): `now` vem de `timeline.date` de um
/// `TimelineView` periódico no Lock Screen, para que o overtime reavalie a
/// cada tick do WidgetKit em vez de congelar no instante do último
/// `Activity.update`. No Dynamic Island (fora do escopo físico do dono, sem
/// hardware compatível), `now` continua vindo de `Date.now` no ponto de
/// chamada — comportamento inalterado ali.
private func overtimeText(_ state: SessionActivityAttributes.ContentState, now: Date) -> String {
    let elapsedSeconds = RestPhaseResolver.overtimeSeconds(restEndsAt: state.restEndsAt, now: now)
    return OvertimeFormatter.format(elapsedSeconds: elapsedSeconds)
}

@ViewBuilder
private func secondaryLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    switch state.phase {
    case .resting:
        Text(state.exerciseName)
            .font(.subheadline)
            .fontWeight(.regular)
            .foregroundColor(activitySecondary)
            .lineLimit(1)
            .truncationMode(.tail)
    case .measuring, .readyOvertime:
        Text(seriesText(state))
            .font(.subheadline)
            .fontWeight(.regular)
            .foregroundColor(.white)
            .lineLimit(1)
    case .blockOnly:
        EmptyView()
    }
}

/// Bloco de contagem regressiva compartilhado entre a Dynamic Island (via
/// primaryValue, região trailing — bloco `dynamicIsland:` no fim do
/// arquivo, NÃO TOCAR) e o herói do Lock
/// Screen redesenhado (lockScreenRestHero). Existe para que a chamada de
/// timer countsDown continue aparecendo exatamente 2 vezes no arquivo
/// (aqui + compactValue), mesmo com o Lock Screen ganhando uma apresentação
/// diferente da Dynamic Island (.title2 inalterado) — só os modificadores
/// mudam por chamador, a chamada em si nunca duplica. Apresentação do Lock
/// Screen: condensado preto sobre bloco neon preenchido (redesenho
/// "Identidade Forte", agosto/2026) — tamanho controlado por restHeroSize
/// (ver bloco de constantes de orçamento de altura no topo do arquivo).
private func restCountdownText(restEndsAt: Date) -> Text {
    Text(timerInterval: Date.now...restEndsAt, countsDown: true)
}

@ViewBuilder
private func primaryValue(_ state: SessionActivityAttributes.ContentState) -> some View {
    switch state.phase {
    case .resting:
        if let restEndsAt = state.restEndsAt {
            restCountdownText(restEndsAt: restEndsAt)
                .font(.title2)
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundColor(neonAccent(for: state))
                .lineLimit(1)
        } else {
            Text("—")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .lineLimit(1)
        }
    case .measuring:
        Text(prescriptionText(state))
            .font(.title2)
            .fontWeight(.bold)
            .monospacedDigit()
            .foregroundColor(.white)
            .minimumScaleFactor(0.8)
            .lineLimit(1)
    case .readyOvertime:
        Text("Pronto")
            .font(.title2)
            .fontWeight(.bold)
            .foregroundColor(neonAccent(for: state))
            .lineLimit(1)
    case .blockOnly:
        Text("\(state.blockLabel ?? "") \(state.blockIndex ?? 0)/\(state.blockTotal ?? 0)")
            .font(.caption2)
            .fontWeight(.regular)
            .foregroundColor(activitySecondary)
            .lineLimit(1)
            .truncationMode(.tail)
    }
}

@ViewBuilder
private func overtimeValue(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    Text(overtimeText(state, now: now))
        .font(.caption2)
        .fontWeight(.regular)
        .monospacedDigit()
        .foregroundColor(activitySecondary)
        .lineLimit(1)
}

// MARK: - Redesenho do Lock Screen (design aprovado, agosto/2026)
//
// As funções abaixo são NOVAS e exclusivas do Lock Screen. Não reaproveitam
// primaryValue()/secondaryLine()/overtimeValue() nas fases em que o estilo
// mudou de tamanho/fonte — só reaproveitam os helpers que continuam
// produzindo o MESMO valor/String (neonAccent, seriesText, prescriptionText,
// overtimeText, nextUpLine, restCountdownText). Isso garante que a Dynamic
// Island (bloco `dynamicIsland:` no fim do arquivo, intocada) continue
// renderizando exatamente como antes,
// já que primaryValue/secondaryLine/overtimeValue são os helpers que ela usa.

/// Barra vertical de acento neon — identidade visual comum às quatro fases
/// do Lock Screen redesenhado. Glow sutil via shadow, cor derivada do mesmo
/// neonAccent(for:) usado no resto do widget.
private func lockScreenAccentBar(_ neon: Color) -> some View {
    RoundedRectangle(cornerRadius: 1.5)
        .fill(neon)
        .frame(width: 3)
        .shadow(color: neon.opacity(0.5), radius: 6)
}

/// Cabeçalho comum "exercício · Série X/Y" das fases .resting/.measuring/
/// .readyOvertime. Na fase .measuring o nome do exercício HOJE não aparecia
/// no lock screen (secondaryLine só mostrava a série) — o redesenho junta
/// os dois na mesma linha, como já acontecia em .resting.
///
/// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo
/// dono): sai do cinza `.subheadline` medium e vira neon condensado em
/// caixa alta com tracking — mesma linguagem tipográfica dos heróis. `neon`
/// é recebido do chamador (já resolvido uma única vez por `lockScreenBody`)
/// em vez de recomputado aqui. Tamanho controlado por `headerFontSize`
/// (orçamento de altura, 2026-08-24) — valor inalterado (13pt), só ganhou
/// nome.
private func lockScreenHeaderLine(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    Text("\(state.exerciseName) · \(seriesText(state))")
        .font(.system(size: headerFontSize, weight: .semibold).width(.condensed))
        .tracking(1.6)
        .textCase(.uppercase)
        .foregroundColor(neon)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .truncationMode(.tail)
}

/// Herói do timer de descanso: mesmo Text(timerInterval:) de sempre
/// (restCountdownText), agora vivendo DENTRO do bloco neon preenchido
/// (lockScreenRestNeonBlock) — por isso o texto é preto, não mais a cor
/// neon (o bloco já é neon; texto neon sobre fundo neon não teria
/// contraste). Redesenho "Identidade Forte" (agosto/2026, variante D
/// aprovada pelo dono): tipografia condensada — sucede os 68pt
/// .rounded/glow do redesenho "card maior" anterior — porque não precisa
/// mais competir com a barra de acento lateral (removida desta fase: o
/// bloco preenchido já carrega a identidade visual). Não recebe mais `neon`
/// como parâmetro — a cor do texto é sempre preta dentro do bloco.
/// minimumScaleFactor(0.6) preservado como rede de segurança para Dynamic
/// Type grande — nunca deveria disparar em uso normal, já que o conteúdo é
/// sempre "MM:SS" monoespaçado.
///
/// ORÇAMENTO DE ALTURA (2026-08-24, correção do corte de card no iPhone 13/
/// iOS 26): tamanho controlado por `restHeroSize` — caiu de 76pt (rodada
/// "card maior") para 60pt (correção anterior, 2026-08-22/24) e agora para
/// 42pt nesta correção, porque a fase .measuring passou a caber tudo numa
/// única fileira de steppers (ver `lockScreenStepperRow`) e sobrou pouco
/// espaço para .resting/.readyOvertime dividirem — 42pt ainda é
/// nitidamente herói (3,2× o corpo de texto de 13pt do cabeçalho) e segue a
/// recomendação da HIG/WWDC23 ("Design dynamic Live Activities": "look for
/// ways to reduce the height of your design"). Ver o bloco de constantes no
/// topo do arquivo para a conta completa por estado.
@ViewBuilder
private func lockScreenRestHero(_ state: SessionActivityAttributes.ContentState) -> some View {
    if let restEndsAt = state.restEndsAt {
        restCountdownText(restEndsAt: restEndsAt)
            .font(.system(size: restHeroSize, weight: .heavy).width(.condensed))
            .monospacedDigit()
            .foregroundColor(.black)
            .contentTransition(.numericText())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
    } else {
        Text("—")
            .font(.system(size: restHeroSize, weight: .heavy).width(.condensed))
            .foregroundColor(.black)
            .lineLimit(1)
    }
}

/// Bloco neon preenchido do herói de descanso — a peça central do
/// redesenho "Identidade Forte" (agosto/2026): rótulo "DESCANSO" em preto
/// 62% de opacidade sobre o timer em preto sólido, dentro de um
/// `RoundedRectangle` preenchido com `neon`. Substitui a barra de acento
/// lateral (`lockScreenAccentBar`) desta fase — o bloco já é a identidade
/// visual, uma barra adicional seria redundante. Padding vertical
/// (neonBlockPaddingTop/Bottom) reduzido de 8/10 para 4/4 na correção de
/// orçamento de altura de 2026-08-24 — a folga entre o texto e a borda do
/// bloco ainda é perceptível, só não sobra.
private func lockScreenRestNeonBlock(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    VStack(alignment: .leading, spacing: heroBlockInnerSpacing) {
        Text("DESCANSO")
            .font(.system(size: heroLabelFontSize, weight: .heavy).width(.condensed))
            .tracking(2.2)
            .foregroundColor(Color.black.opacity(0.62))
        lockScreenRestHero(state)
    }
    .padding(.top, neonBlockPaddingTop)
    .padding(.horizontal, 16)
    .padding(.bottom, neonBlockPaddingBottom)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
        RoundedRectangle(cornerRadius: 16)
            .fill(neon)
    )
}

/// Botões ±30s de descanso (AdjustRestIntent) — mesmos intents de sempre,
/// ao lado do bloco neon. `.bordered` + tint branco translúcido = "borda
/// branca sutil" (D-especificação do redesenho "Identidade Forte"); o texto
/// recebe `.foregroundColor(.white)` explícito para não herdar a cor do
/// tint no rótulo do botão. Não entra no orçamento de altura por constante
/// própria: sua altura (dois botões `.controlSize(.small)` empilhados) fica
/// sempre abaixo da altura do bloco neon ao lado (restBlock), então nunca é
/// o termo que decide a altura da linha — ver comentário do bloco de
/// constantes no topo do arquivo.
private func lockScreenRestAdjustButtons() -> some View {
    VStack(spacing: 6) {
        Button(intent: AdjustRestIntent(deltaSeconds: -30)) {
            Text("-30s")
                .font(.system(size: 15, weight: .semibold).width(.condensed))
                .foregroundColor(.white)
        }
        Button(intent: AdjustRestIntent(deltaSeconds: 30)) {
            Text("+30s")
                .font(.system(size: 15, weight: .semibold).width(.condensed))
                .foregroundColor(.white)
        }
    }
    .buttonStyle(.bordered)
    .buttonBorderShape(.roundedRectangle(radius: 12))
    .controlSize(.small)
    .tint(Color.white.opacity(0.3))
}

/// Botão "PULAR DESCANSO" (SkipRestIntent) — largura total, fundo branco
/// translúcido explícito (em vez de `.borderedProminent`, para controlar o
/// raio com precisão via `RoundedRectangle` direto) — texto branco
/// condensado em caixa alta. `.buttonStyle(.plain)` remove o chrome padrão
/// do sistema para que só o `.background` desenhado abaixo apareça — o
/// MESMO motivo pelo qual a correção de 2026-08-24 migra "CONCLUIR SÉRIE"
/// (ver `lockScreenCompleteSetButton`) para este estilo em vez de
/// `.controlSize(.large)`: um botão desenhado à mão tem altura PROVÁVEL por
/// aritmética (fonte + padding declarados), enquanto `.controlSize` delega
/// a altura ao sistema, que não é somável no orçamento.
///
/// TRADE-OFF CONSCIENTE (orçamento de altura, 2026-08-24): com
/// `actionButtonFontSize`=16 e `actionButtonVerticalPadding`=7, a altura
/// total desta faixa é ~34pt — abaixo do piso geral de 44pt de alvo de
/// toque da HIG. Decisão deliberada: é uma faixa de LARGURA TOTAL (não um
/// glifo isolado), então a área de toque real (largura do card × 34pt)
/// continua generosa; reduzir os glifos −/+ do stepper abaixo de 44pt
/// (rejeitado — ver `stepperGlyphSize`) reabriria o bug de campo já
/// corrigido, então a folga que faltava veio daqui.
private func lockScreenSkipRestButton() -> some View {
    Button(intent: SkipRestIntent()) {
        Text("PULAR DESCANSO")
            .font(.system(size: actionButtonFontSize, weight: .heavy).width(.condensed))
            .tracking(1.8)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, actionButtonVerticalPadding)
    }
    .buttonStyle(.plain)
    .background(
        RoundedRectangle(cornerRadius: 14)
            .fill(Color.white.opacity(0.10))
    )
}

/// Botão "CONCLUIR SÉRIE" (CompleteSetIntent) — mesma receita de faixa de
/// largura total do `lockScreenSkipRestButton`, agora preenchida a `neon`
/// com texto preto (era a cor primária do card antes desta correção). Migra
/// de `.buttonStyle(.borderedProminent)` + `.controlSize(.large)` (altura
/// não somável, delegada ao sistema, estimada em ~50pt) para o mesmo
/// desenho manual — ver o comentário do trade-off de altura em
/// `lockScreenSkipRestButton`, que se aplica igualmente aqui.
private func lockScreenCompleteSetButton(neon: Color) -> some View {
    Button(intent: CompleteSetIntent()) {
        Text("CONCLUIR SÉRIE")
            .font(.system(size: actionButtonFontSize, weight: .heavy).width(.condensed))
            .tracking(1.8)
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .padding(.vertical, actionButtonVerticalPadding)
    }
    .buttonStyle(.plain)
    .background(
        RoundedRectangle(cornerRadius: 14)
            .fill(neon)
    )
}

/// Contorno do(s) grupo(s) de stepper da fase .measuring.
/// BUG DE CAMPO (2026-08-22, iPhone 13 / iOS 26): o modificador de vidro
/// líquido (Liquid Glass, novo no iOS 26), guardado atrás de um check de
/// disponibilidade de versão, compilava mas derrubava a subárvore inteira
/// em silêncio no motor de render de Live Activity — WidgetKit publica o
/// conteúdo via archive (runtime próprio, distinto do app principal), que
/// não sustenta esse material mesmo em device iOS 26 onde o app renderiza
/// normalmente. Resultado: os dois grupos de stepper (reps e carga)
/// sumiam do card, deixando um vão vazio entre a meta e o botão "Concluir
/// série". Nenhuma API sem runtime comprovado volta a este arquivo. (Este
/// comentário evita citar o nome literal do modificador/gate para não
/// colidir com o teste de contrato que proíbe essas strings no arquivo.)
///
/// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo
/// dono): o preenchimento translúcido plano (fallback pós-bug de campo) dá
/// lugar a um CONTORNO — `.stroke` em vez de `.fill` — para diferenciar
/// visualmente os steppers (editáveis, secundários) dos blocos neon
/// preenchidos (heróis de .resting/.readyOvertime, identidade primária).
/// Padding reduzido (stepperGroupHorizontalPadding=10, era 12;
/// stepperRowVerticalPadding=8, inalterado) na correção de orçamento de
/// altura de 2026-08-24 — folga de largura extra para caber reps E carga
/// na mesma fileira (ver `lockScreenStepperRow`).
private func lockScreenStepperGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
        .padding(.horizontal, stepperGroupHorizontalPadding)
        .padding(.vertical, stepperRowVerticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.14))
        )
}

/// Um metro editável (reps OU carga) dentro da fileira única de steppers —
/// ver `lockScreenStepperRow`. O valor e o rótulo de unidade ficam
/// EMPILHADOS (valor grande em cima, unidade pequena embaixo) em vez de
/// lado a lado: essa é a mudança que faz a fileira única caber na largura
/// do card (a coluna de valor+rótulo só precisa ser tão larga quanto o
/// MAIOR dos dois, não a SOMA dos dois) — ver a conta de largura no
/// comentário de `lockScreenStepperRow`. `.layoutPriority(1)` garante que,
/// sob pressão de largura, é o Spacer entre os dois metros que cede
/// primeiro, nunca o valor numérico (D-01 do bug de campo original:
/// "reps e carga precisam mostrar o número").
private func lockScreenStepperMetric(
    value: String,
    unit: String,
    isInherited: Bool
) -> some View {
    VStack(spacing: 0) {
        Text(value)
            .font(.system(size: stepperValueFontSize, weight: .heavy).width(.condensed))
            .monospacedDigit()
            .foregroundColor(.white)
            .opacity(isInherited ? 0.6 : 1.0)
            .contentTransition(.numericText())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        Text(unit)
            .font(.system(size: stepperLabelFontSize, weight: .semibold).width(.condensed))
            .tracking(1.4)
            .foregroundColor(activitySecondary)
            .lineLimit(1)
    }
    .layoutPriority(1)
}

/// Glifo −/+ do stepper (AdjustRepsIntent/AdjustLoadIntent). `.fixedSize()`
/// trava o tamanho relatado do Button no do label (stepperGlyphSize ×
/// stepperGlyphSize) — BUG DE CAMPO (2026-08-22/24, iPhone 13 / iOS 26): sem
/// isso, o HStack tratava o Button como flexível e ele crescia além do seu
/// conteúdo, comprimindo o valor numérico e o rótulo a largura zero (quatro
/// elipses de neon no aparelho, nenhum número). `stepperGlyphSize` = 44pt —
/// piso de acessibilidade geral da HIG, preservado sem regressão nesta
/// correção de orçamento de altura (só os elementos NÃO interativos do
/// card encolheram).
private func lockScreenStepperGlyph(_ symbol: String) -> some View {
    Text(symbol)
        .font(.title3)
        .fontWeight(.bold)
        .frame(width: stepperGlyphSize, height: stepperGlyphSize)
}

/// Fileira ÚNICA de steppers da fase .measuring — reps e carga voltam a
/// ficar na MESMA linha (correção de orçamento de altura, 2026-08-24, ver o
/// bloco de constantes no topo do arquivo). Antes desta correção (2026-08-24
/// mais cedo no mesmo dia), reps e carga ficavam EMPILHADOS porque a versão
/// anterior de "lado a lado" — dois grupos contornados inteiros, cada um
/// com valor e rótulo LADO A LADO — não cabia em ~313pt úteis. A diferença
/// desta versão: (1) valor e rótulo de cada metro ficam EMPILHADOS
/// (lockScreenStepperMetric), então a coluna de cada metro só precisa ser
/// tão larga quanto o maior dos dois, não a soma; (2) os dois metros
/// dividem UM contorno só (lockScreenStepperGroup), não dois, eliminando um
/// padding horizontal inteiro. Conta de largura (iPhone 13, 390pt):
/// 390 − 28 (margem de 14pt do sistema em cada borda, HIG) − 32
/// (cardHorizontalPadding nosso, 16pt cada lado) − 3 (barra de acento) − 10
/// (gap do HStack até a coluna) ≈ 317pt de coluna; menos ~20pt do padding
/// horizontal do grupo (stepperGroupHorizontalPadding×2) ≈ 297pt para a
/// fileira. Quatro botões fixos (stepperGlyphSize×4=176) deixam ~121pt para
/// os dois metros + gaps — folga suficiente até para carga decimal de 3
/// dígitos ("102.5") com o minimumScaleFactor(0.6) do valor absorvendo o
/// pior caso. Ganho de ALTURA: duas fileiras empilhadas custavam ~120pt
/// (2×60); uma fileira só custa ~62pt — a economia de ~58-68pt que fecha o
/// orçamento de .measuring (ver conta completa no relatório da correção).
private func lockScreenStepperRow(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    lockScreenStepperGroup {
        HStack(spacing: 6) {
            Button(intent: AdjustRepsIntent(deltaReps: -1)) {
                lockScreenStepperGlyph("−")
            }
            .fixedSize()
            lockScreenStepperMetric(
                value: state.currentReps.map(String.init) ?? "—",
                unit: "REPS",
                isInherited: state.isRepsInherited
            )
            Button(intent: AdjustRepsIntent(deltaReps: 1)) {
                lockScreenStepperGlyph("+")
            }
            .fixedSize()

            if !state.isBodyweight {
                Spacer(minLength: 4)
                Button(intent: AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg ?? defaultLoadIncrementKg))) {
                    lockScreenStepperGlyph("−")
                }
                .fixedSize()
                lockScreenStepperMetric(
                    value: state.currentLoadKg.map { String(format: "%g", $0) } ?? "—",
                    unit: "KG",
                    isInherited: state.isLoadInherited
                )
                Button(intent: AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg ?? defaultLoadIncrementKg)) {
                    lockScreenStepperGlyph("+")
                }
                .fixedSize()
            }

            Spacer(minLength: 0)
        }
        .tint(neon)
    }
}

/// Bloco neon preenchido do herói "PRONTO" — mesma peça visual do bloco de
/// descanso (`lockScreenRestNeonBlock`), com "PRONTO" e o tempo extra
/// (overtimeText, MESMA função usada pela Dynamic Island) alinhados pela
/// base num HStack. Ambos em preto — "PRONTO" sólido, o tempo extra a 62%
/// de opacidade para ficar secundário ao lado do herói.
///
/// ORÇAMENTO DE ALTURA (2026-08-24): tamanho de "PRONTO" controlado por
/// `readyHeroSize` — caiu de 64pt para 46pt, e o padding vertical do bloco
/// (neonBlockPaddingTop/Bottom, compartilhado com lockScreenRestNeonBlock)
/// caiu de 8/10 para 4/4. Ver o bloco de constantes no topo do arquivo.
private func lockScreenReadyNeonBlock(_ state: SessionActivityAttributes.ContentState, now: Date, neon: Color) -> some View {
    HStack(alignment: .bottom, spacing: 8) {
        Text("PRONTO")
            .font(.system(size: readyHeroSize, weight: .heavy).width(.condensed))
            .foregroundColor(.black)
            .lineLimit(1)
        Text(overtimeText(state, now: now))
            .font(.system(size: 22, weight: .heavy).width(.condensed))
            .monospacedDigit()
            .foregroundColor(Color.black.opacity(0.62))
            .lineLimit(1)
    }
    .padding(.top, neonBlockPaddingTop)
    .padding(.horizontal, 16)
    .padding(.bottom, neonBlockPaddingBottom)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
        RoundedRectangle(cornerRadius: 16)
            .fill(neon)
    )
}

/// D-04 (Fase 15, Plano 15-07): `state.phase` já foi resolvido pelo chamador
/// via `RestPhaseResolver.effectivePhase` a partir de `timeline.date` — este
/// switch nunca vê `.resting` sobrevivendo além de `restEndsAt`, mesmo com o
/// processo JS suspenso.
///
/// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo
/// dono) — sucede o redesenho anterior (D-04/"card maior"): os heróis de
/// `.resting` e `.readyOvertime` deixam de usar `lockScreenAccentBar` como
/// identidade — o bloco neon preenchido (`lockScreenRestNeonBlock` /
/// `lockScreenReadyNeonBlock`) já carrega a marca sozinho, então a barra
/// lateral saiu dessas duas fases. `.measuring` e `.blockOnly` não têm
/// bloco preenchido equivalente e continuam com a barra. `neon` é
/// resolvido uma única vez para a função inteira e reaproveitado nas
/// quatro fases — mesma cor que o resolvedor de acento sempre devolveria
/// para este state, só evita recomputar o switch fechado a cada uso.
///
/// ORÇAMENTO DE ALTURA (2026-08-24): o espaçamento vertical dos três
/// VStack de fase (`.resting`/`.measuring`/`.readyOvertime`) foi unificado
/// em `bodySpacing` (3pt, era 6pt em duas fases e 7pt na terceira) — ver o
/// bloco de constantes no topo do arquivo para a conta completa por
/// estado.
@ViewBuilder
private func lockScreenBody(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    let neon = neonAccent(for: state)
    switch state.phase {
    case .resting:
        // Redesenho "Identidade Forte": o bloco neon preenchido
        // (lockScreenRestNeonBlock) é o herói — rótulo "DESCANSO" +
        // timer condensado (restHeroSize), ambos em preto sobre o fundo
        // neon. Os botões ±30s (mesmos AdjustRestIntent de sempre) ficam
        // ao lado do bloco; "PULAR DESCANSO" (mesmo SkipRestIntent) vira
        // uma faixa de largura total abaixo — nenhuma ação sai do card,
        // só reorganiza.
        VStack(alignment: .leading, spacing: bodySpacing) {
            lockScreenHeaderLine(state, neon: neon)
            HStack(alignment: .top, spacing: 10) {
                lockScreenRestNeonBlock(state, neon: neon)
                lockScreenRestAdjustButtons()
            }
            lockScreenSkipRestButton()
        }
    case .measuring:
        // Redesenho "Identidade Forte" + correção de orçamento de altura
        // (2026-08-24): reps e carga voltam a dividir UMA fileira única
        // (lockScreenStepperRow) em vez de duas empilhadas — ver o
        // comentário completo (conta de largura e de altura) na própria
        // função. prescriptionText() continua fora desta fase (decisão da
        // rodada "card mais alto" preservada: a meta prescrita já está
        // embutida no valor editável do stepper). "CONCLUIR SÉRIE" migra
        // de `.controlSize(.large)` para a mesma faixa desenhada à mão do
        // botão "PULAR DESCANSO" (lockScreenCompleteSetButton) — altura
        // provável por aritmética em vez de delegada ao sistema.
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            VStack(alignment: .leading, spacing: bodySpacing) {
                lockScreenHeaderLine(state, neon: neon)
                // Reps sempre existem, inclusive bodyweight (D-09) — só a
                // carga é omitida para bodyweight, nunca as reps (ver
                // `if !state.isBodyweight` dentro de lockScreenStepperRow).
                lockScreenStepperRow(state, neon: neon)
                // Decisão aprovada: a dica de abrir o app para ajustar valores e
                // nextUpLine() saem desta fase — a ação principal é concluir a
                // série, sem distrações.
                lockScreenCompleteSetButton(neon: neon)
            }
        }
    case .readyOvertime:
        // Redesenho "Identidade Forte": mesmo bloco neon preenchido do
        // herói de descanso, agora com "PRONTO" (preto) + tempo extra
        // (preto 62% opacidade) alinhados pela base. nextUpLine() continua
        // só nesta fase (D-15: mudar de exercício é a única transição que
        // altera o que o dono faz fisicamente).
        VStack(alignment: .leading, spacing: bodySpacing) {
            lockScreenHeaderLine(state, neon: neon)
            lockScreenReadyNeonBlock(state, now: now, neon: neon)
            nextUpLine(state)
        }
    case .blockOnly:
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            primaryValue(state)
        }
    }
}

/// D-04 (Fase 15, Plano 15-07): retorna uma cópia de `state` com `phase`
/// substituída pela fase efetiva resolvida por `RestPhaseResolver` a partir
/// de `restEndsAt` e `now`. Os demais campos (reps, carga, próxima série)
/// não são tocados — apenas a apresentação temporal muda sozinha com o
/// tempo, nunca por mutação do draft.
private func effectiveState(
    _ state: SessionActivityAttributes.ContentState,
    now: Date
) -> SessionActivityAttributes.ContentState {
    var resolved = state
    resolved.phase = RestPhaseResolver.effectivePhase(
        receivedPhase: state.phase,
        restEndsAt: state.restEndsAt,
        now: now
    )
    return resolved
}

@ViewBuilder
private func compactValue(_ state: SessionActivityAttributes.ContentState) -> some View {
    if state.phase == .resting, let restEndsAt = state.restEndsAt {
        Text(timerInterval: Date.now...restEndsAt, countsDown: true)
            .font(.caption)
            .fontWeight(.bold)
            .monospacedDigit()
            .lineLimit(1)
    } else {
        Text("\(state.setIndex)/\(state.setTotal)")
            .font(.caption)
            .fontWeight(.bold)
            .monospacedDigit()
            .lineLimit(1)
    }
}

private func minimalSymbol(for state: SessionActivityAttributes.ContentState) -> String {
    switch state.phase {
    case .resting:
        return "timer"
    case .readyOvertime:
        return "checkmark"
    case .blockOnly:
        return "figure.run"
    case .measuring:
        return "bolt.fill"
    }
}

struct WidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivityAttributes.self) { context in
            // D-04 (Fase 15, Plano 15-07): TimelineView periódico reavalia a
            // fase efetiva e o overtime a cada tick do WidgetKit a partir de
            // timeline.date — o card sai sozinho de resting para
            // readyOvertime/Pronto ao vencer restEndsAt, mesmo com o
            // processo JS suspenso, sem update de Activity nem timeout JS.
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                lockScreenBody(effectiveState(context.state, now: timeline.date), now: timeline.date)
            }
            // ORÇAMENTO DE ALTURA (2026-08-24): `.padding()` (default,
            // ~16pt nas 4 bordas) trocado por padding horizontal/vertical
            // explícitos — cardHorizontalPadding mantém 16pt (largura não é
            // o problema reportado), cardVerticalPadding cai para 4pt. É a
            // NOSSA margem, somada por cima da margem de ~14pt que o
            // próprio sistema já reserva ao redor da Live Activity (HIG) —
            // reduzi-la não tira a respiração do conteúdo, só remove
            // redundância. Ver o bloco de constantes no topo do arquivo.
            .padding(.horizontal, cardHorizontalPadding)
            .padding(.vertical, cardVerticalPadding)
            .activityBackgroundTint(activityBackground)
            .activitySystemActionForegroundColor(Color.white)
            .widgetURL(URL(string: "forcaapp://home/active-session/\(context.attributes.sessionLogId)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    secondaryLine(context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    primaryValue(context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    switch context.state.phase {
                    case .readyOvertime:
                        overtimeValue(context.state, now: .now)
                    case .blockOnly:
                        Text("\(context.state.blockLabel ?? "") \(context.state.blockIndex ?? 0)/\(context.state.blockTotal ?? 0)")
                            .font(.caption2)
                            .fontWeight(.regular)
                            .foregroundColor(activitySecondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    case .measuring, .resting:
                        EmptyView()
                    }
                }
            } compactLeading: {
                compactValue(context.state)
            } compactTrailing: {
                compactValue(context.state)
            } minimal: {
                Image(systemName: minimalSymbol(for: context.state))
                    .foregroundColor(
                        context.state.phase == .resting
                            ? neonAccent(for: context.state)
                            : activitySecondary
                    )
            }
            .keylineTint(neonAccent(for: context.state))
        }
    }
}

// MARK: - Previews (canvas do Xcode — loop de iteração sem resign de dispositivo)
//
// API nativa de preview de Live Activity do WidgetKit — a macro de preview
// com os rótulos as:/using:/widget:/contentStates:, confirmada no
// WidgetKit.swiftinterface do SDK instalado — iOS 26.5, disponível a partir
// de iOS 17.0, que é o deploymentTarget do target session-widget. Cobre a
// apresentação de Lock Screen (`.content`) nas três fases visíveis ao dono —
// `.resting`, `.measuring`, `.readyOvertime` — cada uma num preview nomeado
// à parte, para trocar entre elas pelo seletor do canvas em vez de esperar
// ~9 min de resign no device físico.
//
// Guardado inteiro sob `#if DEBUG`: no project.pbxproj, o target
// session-widget define SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG só na
// configuração Debug — a configuração Release não define a flag — então
// este bloco nunca entra no binário de Release/App Store Connect, e não
// altera nenhum comportamento do card em produção.
#if DEBUG

/// Descanso, nome curto, acento amarelo (cor padrão) — cobre o bloco neon
/// preenchido (rótulo "DESCANSO" + timer condensado em restHeroSize, preto),
/// os chips ±30s ao lado e o botão "PULAR DESCANSO" de largura total. "A
/// SEGUIR" não aparece nesta fase (decisão aprovada, card mais alto
/// agosto/2026, preservada no redesenho "Identidade Forte"). Orçamento de
/// altura (2026-08-24): ~139pt calculados, ~21pt (13%) abaixo do teto de
/// 160pt apurado na pesquisa — ver bloco de constantes no topo do arquivo.
#Preview("Descanso — amarelo", as: .content, using: SessionActivityAttributes(sessionLogId: "preview-resting")) {
    WidgetLiveActivity()
} contentStates: {
    SessionActivityAttributes.ContentState(
        phase: .resting,
        exerciseName: "Supino reto",
        setIndex: 2,
        setTotal: 4,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetLoadKg: 40,
        isLoadInherited: false,
        isRepsInherited: false,
        isBodyweight: false,
        restEndsAt: Date().addingTimeInterval(75),
        nextExerciseName: "Rosca direta",
        nextSetIndex: 1,
        nextSetTotal: 3,
        nextSuggestedReps: 12,
        nextSuggestedLoadKg: 15,
        nextIsBodyweight: false,
        neonColor: "yellow"
    )
}

/// Série em andamento, nome LONGO (para checar truncamento do cabeçalho
/// condensado em caixa alta) e acento azul — cobre a fileira ÚNICA de
/// steppers (correção de 2026-08-24: reps e carga voltam a ficar lado a
/// lado, cada um com valor empilhado sobre o rótulo de unidade), glifos
/// −/+ de 44×44pt travados com `.fixedSize()`, e o botão "CONCLUIR SÉRIE"
/// como faixa preenchida a neon com texto preto (migrado de
/// `.controlSize(.large)`). prescriptionText não aparece nesta fase
/// (decisão aprovada, card mais alto agosto/2026, preservada no redesenho
/// "Identidade Forte"). Orçamento de altura (2026-08-24): ~126pt
/// calculados, ~34pt (21%) abaixo do teto de 160pt apurado na pesquisa —
/// era o estado mais estourado antes da correção (~240pt calculados, ~50%
/// acima do teto) e o único fotografado cortado no aparelho do dono.
#Preview("Série — nome longo, azul", as: .content, using: SessionActivityAttributes(sessionLogId: "preview-measuring")) {
    WidgetLiveActivity()
} contentStates: {
    SessionActivityAttributes.ContentState(
        phase: .measuring,
        exerciseName: "Elevação lateral unilateral com halteres no banco inclinado",
        setIndex: 3,
        setTotal: 5,
        targetRepsMin: 10,
        targetRepsMax: 12,
        targetLoadKg: 12,
        currentLoadKg: 12.5,
        isLoadInherited: false,
        loadIncrementKg: 2.5,
        currentReps: 11,
        isRepsInherited: true,
        isBodyweight: false,
        neonColor: "blue"
    )
}

/// Pronto/tempo extra, nome curto, peso corporal, acento verde — cobre o
/// bloco neon preenchido com "PRONTO" (readyHeroSize, condensado preto)
/// junto do contador de overtime (preto 62% opacidade, restEndsAt no
/// passado) e a linha "A SEGUIR" com o próximo exercício. Orçamento de
/// altura (2026-08-24): ~131pt calculados, ~29pt (18%) abaixo do teto de
/// 160pt apurado na pesquisa.
#Preview("Pronto — verde, tempo extra", as: .content, using: SessionActivityAttributes(sessionLogId: "preview-ready-overtime")) {
    WidgetLiveActivity()
} contentStates: {
    SessionActivityAttributes.ContentState(
        phase: .readyOvertime,
        exerciseName: "Agachamento",
        setIndex: 4,
        setTotal: 4,
        isLoadInherited: false,
        isRepsInherited: false,
        isBodyweight: true,
        restEndsAt: Date().addingTimeInterval(-42),
        nextExerciseName: "Prancha",
        nextSetIndex: 1,
        nextSetTotal: 3,
        nextIsBodyweight: true,
        neonColor: "green"
    )
}

#endif

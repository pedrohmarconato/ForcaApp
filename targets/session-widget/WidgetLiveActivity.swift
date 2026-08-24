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

@ViewBuilder
private func nextUpLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    if state.nextExerciseName != nil {
        let destaque = nextUpIsExerciseChange(state)
        VStack(alignment: .leading, spacing: 2) {
            Text("A SEGUIR")
                .font(.caption2)
                .fontWeight(.regular)
                .foregroundColor(destaque ? neonAccent(for: state) : activitySecondary)
            Text(nextUpDetailText(state))
                .font(.caption2)
                .fontWeight(destaque ? .bold : .regular)
                .foregroundColor(destaque ? neonAccent(for: state) : activitySecondary)
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
/// primaryValue, região trailing — 331-367, NÃO TOCAR) e o herói do Lock
/// Screen redesenhado (lockScreenRestHero). Existe para que a chamada de
/// timer countsDown continue aparecendo exatamente 2 vezes no arquivo
/// (aqui + compactValue), mesmo com o Lock Screen ganhando uma apresentação
/// (52pt, rounded, glow — crescido de 44pt para preencher o orçamento
/// vertical do card, Fase de redesenho "card maior" agosto/2026) diferente
/// da Dynamic Island (.title2 inalterado) — só os modificadores mudam por
/// chamador, a chamada em si nunca duplica.
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
// Island (331-367, intocada) continue renderizando exatamente como antes,
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
private func lockScreenHeaderLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    Text("\(state.exerciseName) · \(seriesText(state))")
        .font(.subheadline)
        .fontWeight(.medium)
        .foregroundColor(activitySecondary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .truncationMode(.tail)
}

/// Herói do timer de descanso: mesmo Text(timerInterval:) de sempre
/// (restCountdownText), com a apresentação nova — 52pt, .rounded, glow —
/// que não poderia entrar em primaryValue() sem também mudar a Dynamic
/// Island. Crescido de 44pt (redesenho "card maior", agosto/2026): é o
/// elemento lido de mais longe do card, então recebe a maior fatia do
/// orçamento vertical ganho. minimumScaleFactor(0.6) preservado como rede
/// de segurança para Dynamic Type grande — nunca deveria disparar em uso
/// normal, já que o conteúdo é sempre "MM:SS" monoespaçado.
@ViewBuilder
private func lockScreenRestHero(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    if let restEndsAt = state.restEndsAt {
        restCountdownText(restEndsAt: restEndsAt)
            .font(.system(size: 52, weight: .heavy, design: .rounded))
            .monospacedDigit()
            .foregroundColor(neon)
            .contentTransition(.numericText())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
    } else {
        Text("—")
            .font(.system(size: 52, weight: .heavy, design: .rounded))
            .foregroundColor(.white)
            .lineLimit(1)
    }
}

/// Fundo capsule dos grupos de stepper (reps/carga) da fase .measuring.
/// BUG DE CAMPO (2026-08-22, iPhone 13 / iOS 26): o modificador de vidro
/// líquido (Liquid Glass, novo no iOS 26), guardado atrás de um check de
/// disponibilidade de versão, compilava mas derrubava a subárvore inteira
/// em silêncio no motor de render de Live Activity — WidgetKit publica o
/// conteúdo via archive (runtime próprio, distinto do app principal), que
/// não sustenta esse material mesmo em device iOS 26 onde o app renderiza
/// normalmente. Resultado: os dois grupos de stepper (reps e carga)
/// sumiam do card, deixando um vão vazio entre a meta e o botão "Concluir
/// série". O preenchimento translúcido plano abaixo — que já era o
/// fallback pré-26 — vira o único estilo suportado; Live Activity não é
/// lugar de API sem runtime comprovado. (Este comentário evita citar o
/// nome literal do modificador/gate para não colidir com o teste de
/// contrato que proíbe essas strings no arquivo.)
private func lockScreenStepperGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.08))
        )
}

/// D-04 (Fase 15, Plano 15-07): `state.phase` já foi resolvido pelo chamador
/// via `RestPhaseResolver.effectivePhase` a partir de `timeline.date` — este
/// switch nunca vê `.resting` sobrevivendo além de `restEndsAt`, mesmo com o
/// processo JS suspenso.
///
/// Redesenho do Lock Screen (design aprovado, agosto/2026): as quatro fases
/// ganham barra de acento neon no leading (lockScreenAccentBar) e cabeçalho
/// "exercício · Série X/Y" comum (lockScreenHeaderLine, exceto .blockOnly,
/// que não tem semântica de série). `neon` é resolvido uma única vez para a
/// função inteira e reaproveitado nas quatro fases — mesma cor que o
/// resolvedor de acento sempre devolveria para este state, só evita
/// recomputar o switch fechado a cada uso dentro do mesmo case.
@ViewBuilder
private func lockScreenBody(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    let neon = neonAccent(for: state)
    switch state.phase {
    case .resting:
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            VStack(alignment: .leading, spacing: 5) {
                lockScreenHeaderLine(state)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    lockScreenRestHero(state, neon: neon)
                    Spacer(minLength: 8)
                    Button(intent: SkipRestIntent()) {
                        Text("Pular")
                            .fontWeight(.bold)
                            .foregroundColor(.black)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.large)
                    .tint(neon)
                }
                if let restEndsAt = state.restEndsAt {
                    ProgressView(timerInterval: Date.now...restEndsAt, countsDown: true)
                        .progressViewStyle(.linear)
                        .tint(neon)
                }
                HStack(spacing: 8) {
                    Button(intent: AdjustRestIntent(deltaSeconds: -30)) {
                        Text("-30s")
                    }
                    Button(intent: AdjustRestIntent(deltaSeconds: 30)) {
                        Text("+30s")
                    }
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .tint(neon)
                nextUpLine(state)
            }
        }
    case .measuring:
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            VStack(alignment: .leading, spacing: 5) {
                lockScreenHeaderLine(state)
                Text(prescriptionText(state))
                    .font(.footnote)
                    .fontWeight(.regular)
                    .foregroundColor(activitySecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                // Reps sempre existem, inclusive bodyweight (D-09) — só a carga é
                // omitida para bodyweight, nunca as reps. Os dois grupos ficam
                // lado a lado na mesma linha (design aprovado).
                HStack(spacing: 8) {
                    lockScreenStepperGroup {
                        HStack(spacing: 6) {
                            Button(intent: AdjustRepsIntent(deltaReps: -1)) {
                                Text("−")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .frame(width: 28, height: 28)
                            }
                            Text(state.currentReps.map(String.init) ?? "—")
                                .font(.system(.title2, design: .rounded))
                                .fontWeight(.bold)
                                .monospacedDigit()
                                .foregroundColor(.white)
                                .opacity(state.isRepsInherited ? 0.6 : 1.0)
                                .contentTransition(.numericText())
                                .minimumScaleFactor(0.8)
                                .lineLimit(1)
                            Button(intent: AdjustRepsIntent(deltaReps: 1)) {
                                Text("+")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .frame(width: 28, height: 28)
                            }
                        }
                    }
                    .tint(neon)
                    if !state.isBodyweight {
                        lockScreenStepperGroup {
                            HStack(spacing: 6) {
                                Button(intent: AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg ?? defaultLoadIncrementKg))) {
                                    Text("−")
                                        .font(.title3)
                                        .fontWeight(.bold)
                                        .frame(width: 28, height: 28)
                                }
                                Text("\(state.currentLoadKg.map { String(format: "%g", $0) } ?? "—") kg")
                                    .font(.system(.title2, design: .rounded))
                                    .fontWeight(.bold)
                                    .monospacedDigit()
                                    .foregroundColor(.white)
                                    .opacity(state.isLoadInherited ? 0.6 : 1.0)
                                    .contentTransition(.numericText())
                                    .minimumScaleFactor(0.8)
                                    .lineLimit(1)
                                Button(intent: AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg ?? defaultLoadIncrementKg)) {
                                    Text("+")
                                        .font(.title3)
                                        .fontWeight(.bold)
                                        .frame(width: 28, height: 28)
                                }
                            }
                        }
                        .tint(neon)
                    }
                }
                // Decisão aprovada: a dica de abrir o app para ajustar valores e
                // nextUpLine() saem desta fase — a ação principal é concluir a
                // série, sem distrações.
                Button(intent: CompleteSetIntent()) {
                    Text("Concluir série")
                        .fontWeight(.bold)
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.large)
                .tint(neon)
            }
        }
    case .readyOvertime:
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            VStack(alignment: .leading, spacing: 5) {
                lockScreenHeaderLine(state)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("PRONTO")
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .foregroundColor(neon)
                        .shadow(color: neon.opacity(0.5), radius: 8)
                        .lineLimit(1)
                    Text(overtimeText(state, now: now))
                        .font(.system(.title3, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(activitySecondary)
                        .lineLimit(1)
                }
                nextUpLine(state)
            }
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
            .padding()
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

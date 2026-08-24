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
/// "Identidade Forte", agosto/2026) — sucede a fase anterior (68pt,
/// .rounded, glow sobre fundo escuro) do mesmo redesenho "card maior".
/// Tamanho atual em lockScreenRestHero (60pt, reduzido de 76pt na correção
/// de orçamento de altura de 2026-08-24 — ver comentário lá).
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
/// em vez de recomputado aqui.
private func lockScreenHeaderLine(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    Text("\(state.exerciseName) · \(seriesText(state))")
        .font(.system(size: 13, weight: .semibold).width(.condensed))
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
/// BUG DE CAMPO (2026-08-22/24, iPhone 13 / iOS 26, correção do orçamento de
/// altura): caiu de 76 para 60pt na mesma rodada em que .measuring passou a
/// empilhar reps/carga em vez de lado a lado (ver comentário do case
/// .measuring em lockScreenBody) — a fase .measuring ficou mais alta com o
/// empilhamento, e .resting precisou ceder altura de volta para o card
/// caber no teto do sistema. 60pt ainda é hero (bem acima do texto padrão),
/// só não compete mais pelo mesmo espaço que .measuring passou a precisar.
@ViewBuilder
private func lockScreenRestHero(_ state: SessionActivityAttributes.ContentState) -> some View {
    if let restEndsAt = state.restEndsAt {
        restCountdownText(restEndsAt: restEndsAt)
            .font(.system(size: 60, weight: .heavy).width(.condensed))
            .monospacedDigit()
            .foregroundColor(.black)
            .contentTransition(.numericText())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
    } else {
        Text("—")
            .font(.system(size: 60, weight: .heavy).width(.condensed))
            .foregroundColor(.black)
            .lineLimit(1)
    }
}

/// Bloco neon preenchido do herói de descanso — a peça central do
/// redesenho "Identidade Forte" (agosto/2026): rótulo "DESCANSO" em preto
/// 62% de opacidade sobre o timer em preto sólido, dentro de um
/// `RoundedRectangle` preenchido com `neon`. Substitui a barra de acento
/// lateral (`lockScreenAccentBar`) desta fase — o bloco já é a identidade
/// visual, uma barra adicional seria redundante.
private func lockScreenRestNeonBlock(_ state: SessionActivityAttributes.ContentState, neon: Color) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text("DESCANSO")
            .font(.system(size: 11, weight: .heavy).width(.condensed))
            .tracking(2.2)
            .foregroundColor(Color.black.opacity(0.62))
        lockScreenRestHero(state)
    }
    .padding(.top, 8)
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
        RoundedRectangle(cornerRadius: 16)
            .fill(neon)
    )
}

/// Botões ±30s de descanso (AdjustRestIntent) — mesmos intents de sempre,
/// agora ao lado do bloco neon em vez de embutidos na mesma linha do timer.
/// `.bordered` + tint branco translúcido = "borda branca sutil" (D-especificação
/// do redesenho "Identidade Forte"); o texto recebe `.foregroundColor(.white)`
/// explícito para não herdar a cor do tint no rótulo do botão.
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
/// do sistema para que só o `.background` desenhado abaixo apareça.
private func lockScreenSkipRestButton() -> some View {
    Button(intent: SkipRestIntent()) {
        Text("PULAR DESCANSO")
            .font(.system(size: 18, weight: .heavy).width(.condensed))
            .tracking(1.8)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
    .background(
        RoundedRectangle(cornerRadius: 14)
            .fill(Color.white.opacity(0.10))
    )
}

/// Contorno dos grupos de stepper (reps/carga) da fase .measuring.
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
private func lockScreenStepperGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.14))
        )
}

/// Bloco neon preenchido do herói "PRONTO" — mesma peça visual do bloco de
/// descanso (`lockScreenRestNeonBlock`), com "PRONTO" e o tempo extra
/// (overtimeText, MESMA função usada pela Dynamic Island) alinhados pela
/// base num HStack. Ambos em preto — "PRONTO" sólido, o tempo extra a 62%
/// de opacidade para ficar secundário ao lado do herói.
private func lockScreenReadyNeonBlock(_ state: SessionActivityAttributes.ContentState, now: Date, neon: Color) -> some View {
    HStack(alignment: .bottom, spacing: 8) {
        Text("PRONTO")
            .font(.system(size: 64, weight: .heavy).width(.condensed))
            .foregroundColor(.black)
            .lineLimit(1)
        Text(overtimeText(state, now: now))
            .font(.system(size: 22, weight: .heavy).width(.condensed))
            .monospacedDigit()
            .foregroundColor(Color.black.opacity(0.62))
            .lineLimit(1)
    }
    .padding(.top, 8)
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
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
@ViewBuilder
private func lockScreenBody(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    let neon = neonAccent(for: state)
    switch state.phase {
    case .resting:
        // Redesenho "Identidade Forte": o bloco neon preenchido
        // (lockScreenRestNeonBlock) é o herói — rótulo "DESCANSO" +
        // timer 60pt condensado (76pt até a correção de orçamento de altura
        // de 2026-08-24), ambos em preto sobre o fundo neon. Os botões ±30s
        // (mesmos AdjustRestIntent de sempre) ficam ao lado do bloco;
        // "PULAR DESCANSO" (mesmo SkipRestIntent) vira uma faixa de largura
        // total abaixo — nenhuma ação sai do card, só reorganiza.
        VStack(alignment: .leading, spacing: 6) {
            lockScreenHeaderLine(state, neon: neon)
            HStack(alignment: .top, spacing: 10) {
                lockScreenRestNeonBlock(state, neon: neon)
                lockScreenRestAdjustButtons()
            }
            lockScreenSkipRestButton()
        }
    case .measuring:
        // Redesenho "Identidade Forte": os grupos de stepper (reps/carga)
        // trocam o preenchimento translúcido pelo contorno
        // (lockScreenStepperGroup) e separam o número do rótulo — "40 kg"
        // em uma única Text vira "40" + "KG" em duas, cada uma com sua
        // própria tipografia. prescriptionText() continua fora desta fase
        // (decisão da rodada "card mais alto" preservada: a meta prescrita
        // já está embutida no valor editável do stepper).
        //
        // BUG DE CAMPO (2026-08-22, iPhone 13 / iOS 26 — foto do aparelho no
        // estado .measuring): os Button de AdjustRepsIntent/AdjustLoadIntent
        // não tinham frame próprio — só o LABEL (a Text "−"/"+") recebia
        // `.frame(width: 44, height: 44)`. Sem nada travando o tamanho do
        // Button em si, o HStack tratava os dois botões como flexíveis e
        // eles cresciam para ocupar toda a largura do grupo, comprimindo o
        // valor numérico e o rótulo REPS/KG a largura zero
        // (minimumScaleFactor não segura compressão a zero, só reduz até um
        // piso). No aparelho: quatro elipses de neon gigantes, nenhum
        // número. Correção (2026-08-24): fixedSize no Button trava seu
        // tamanho relatado no de seu label (44×44), então ele para de
        // aceitar a proposta flexível do HStack; layoutPriority elevada no
        // valor garante que, mesmo sob pressão, o botão cede espaço antes
        // do número.
        //
        // Na mesma correção, reps e carga deixam de ficar lado a lado
        // (pouco espaço sobrava por grupo em ~313pt úteis) e passam a
        // ocupar uma linha inteira cada, empilhadas — decisão aprovada pelo
        // dono ("o card fica mais alto", já pedido antes). Cada linha:
        // botão esquerdo, valor com prioridade de layout, rótulo, Spacer,
        // botão direito.
        HStack(alignment: .top, spacing: 10) {
            lockScreenAccentBar(neon)
            VStack(alignment: .leading, spacing: 7) {
                lockScreenHeaderLine(state, neon: neon)
                // Reps sempre existem, inclusive bodyweight (D-09) — só a
                // carga é omitida para bodyweight, nunca as reps.
                VStack(spacing: 8) {
                    lockScreenStepperGroup {
                        HStack(spacing: 8) {
                            Button(intent: AdjustRepsIntent(deltaReps: -1)) {
                                Text("−")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .frame(width: 44, height: 44)
                            }
                            .fixedSize()
                            Text(state.currentReps.map(String.init) ?? "—")
                                .font(.system(size: 34, weight: .heavy).width(.condensed))
                                .monospacedDigit()
                                .foregroundColor(.white)
                                .opacity(state.isRepsInherited ? 0.6 : 1.0)
                                .contentTransition(.numericText())
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                                .layoutPriority(1)
                            Text("REPS")
                                .font(.system(size: 11, weight: .semibold).width(.condensed))
                                .tracking(2)
                                .foregroundColor(activitySecondary)
                            Spacer(minLength: 0)
                            Button(intent: AdjustRepsIntent(deltaReps: 1)) {
                                Text("+")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .frame(width: 44, height: 44)
                            }
                            .fixedSize()
                        }
                    }
                    .tint(neon)
                    if !state.isBodyweight {
                        lockScreenStepperGroup {
                            HStack(spacing: 8) {
                                Button(intent: AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg ?? defaultLoadIncrementKg))) {
                                    Text("−")
                                        .font(.title3)
                                        .fontWeight(.bold)
                                        .frame(width: 44, height: 44)
                                }
                                .fixedSize()
                                Text(state.currentLoadKg.map { String(format: "%g", $0) } ?? "—")
                                    .font(.system(size: 34, weight: .heavy).width(.condensed))
                                    .monospacedDigit()
                                    .foregroundColor(.white)
                                    .opacity(state.isLoadInherited ? 0.6 : 1.0)
                                    .contentTransition(.numericText())
                                    .minimumScaleFactor(0.7)
                                    .lineLimit(1)
                                    .layoutPriority(1)
                                Text("KG")
                                    .font(.system(size: 11, weight: .semibold).width(.condensed))
                                    .tracking(2)
                                    .foregroundColor(activitySecondary)
                                Spacer(minLength: 0)
                                Button(intent: AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg ?? defaultLoadIncrementKg)) {
                                    Text("+")
                                        .font(.title3)
                                        .fontWeight(.bold)
                                        .frame(width: 44, height: 44)
                                }
                                .fixedSize()
                            }
                        }
                        .tint(neon)
                    }
                }
                // Decisão aprovada: a dica de abrir o app para ajustar valores e
                // nextUpLine() saem desta fase — a ação principal é concluir a
                // série, sem distrações.
                Button(intent: CompleteSetIntent()) {
                    Text("CONCLUIR SÉRIE")
                        .font(.system(size: 19, weight: .heavy).width(.condensed))
                        .tracking(1.8)
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 14))
                .controlSize(.large)
                .tint(neon)
            }
        }
    case .readyOvertime:
        // Redesenho "Identidade Forte": mesmo bloco neon preenchido do
        // herói de descanso, agora com "PRONTO" (preto) + tempo extra
        // (preto 62% opacidade) alinhados pela base. nextUpLine() continua
        // só nesta fase (D-15: mudar de exercício é a única transição que
        // altera o que o dono faz fisicamente).
        VStack(alignment: .leading, spacing: 6) {
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
/// preenchido (rótulo "DESCANSO" + timer 60pt condensado, reduzido de 76pt
/// na correção de orçamento de altura de 2026-08-24, ambos em preto), os
/// chips ±30s ao lado e o botão "PULAR DESCANSO" de largura total. "A
/// SEGUIR" não aparece nesta fase (decisão aprovada, card mais alto
/// agosto/2026, preservada no redesenho "Identidade Forte").
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
/// condensado em caixa alta) e acento azul — cobre os dois grupos de
/// stepper CONTORNADOS e EMPILHADOS (correção de 2026-08-24: reps herdadas
/// a 60% de opacidade, carga não herdada, cada uma na sua própria linha em
/// vez de lado a lado), glifos −/+ de 44×44pt travados com `.fixedSize()`,
/// valor 34pt condensado com `.layoutPriority(1)` separado do rótulo
/// REPS/KG, e o botão "CONCLUIR SÉRIE" preenchido a neon com texto preto.
/// prescriptionText não aparece nesta fase (decisão aprovada, card mais
/// alto agosto/2026, preservada no redesenho "Identidade Forte").
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
/// bloco neon preenchido com "PRONTO" (64pt condensado preto) junto do
/// contador de overtime (preto 62% opacidade, restEndsAt no passado) e a
/// linha "A SEGUIR" com o próximo exercício.
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

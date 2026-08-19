import Foundation

/// Formatador Swift puro do microtexto de overtime da Live Activity — clampado
/// no teto visual de +59:59 (D-04). Extraído para fora da View (Fase 15,
/// Plano 15-07) para que este arquivo compile e seja testável isoladamente,
/// sem WidgetKit nem ActivityKit — ver `scripts/verify-live-activity-overtime.sh`.
enum OvertimeFormatter {
    /// Teto de exibição: 59 minutos e 59 segundos (3599s) — o mesmo limite que
    /// preserva a largura da região Micro do card (decisão registrada em
    /// STATE.md: "Overtime da Live Activity é texto manual +m:ss clampado em
    /// +59:59").
    static let capSeconds = 59 * 60 + 59

    /// Formata segundos transcorridos (podendo vir negativos por folga de
    /// arredondamento no chamador) em "+m:ss", clampando ao intervalo
    /// [0, capSeconds].
    static func format(elapsedSeconds: Int) -> String {
        let clamped = min(capSeconds, max(0, elapsedSeconds))
        return String(format: "+%d:%02d", clamped / 60, clamped % 60)
    }
}

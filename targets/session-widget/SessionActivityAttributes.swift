import ActivityKit
import Foundation

public enum SessionActivityPhase: String, Codable, Hashable {
    case measuring
    case resting
    case readyOvertime
    case blockOnly
}

public struct SessionActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var phase: SessionActivityPhase
        var exerciseName: String
        var setIndex: Int
        var setTotal: Int
        var targetRepsMin: Int?
        var targetRepsMax: Int?
        var targetLoadKg: Double?
        var isBodyweight: Bool
        var restEndsAt: Date?
        var blockLabel: String?
        var blockIndex: Int?
        var blockTotal: Int?
        // D-10: opcional ao fim — Activities publicadas pelo binário legado
        // (sem o campo) continuam decodificáveis; nil cai no fallback yellow.
        var neonColor: String?
    }

    var sessionLogId: String
}

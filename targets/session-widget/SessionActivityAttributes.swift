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
    }

    var sessionLogId: String
}

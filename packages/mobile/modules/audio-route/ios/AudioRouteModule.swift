import AVFoundation
import ExpoModulesCore

public class AudioRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    // WebRTC's voice chat audio session plays through the earpiece unless told otherwise.
    // The override lasts until the route changes, so callers apply it again once voice connects.
    Function("setSpeakerOn") { (on: Bool) in
      try AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }
  }
}

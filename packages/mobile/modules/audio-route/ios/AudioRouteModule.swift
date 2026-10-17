import AVFoundation
import ExpoModulesCore

public class AudioRouteModule: Module {
  private var ringer: AVAudioPlayer?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    // WebRTC's voice chat audio session plays through the earpiece unless told otherwise.
    // The override lasts until the route changes, so callers apply it again once voice connects.
    Function("setSpeakerOn") { (on: Bool) in
      try AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }

    // the speaker's default when voice starts: off with a headset voice chat can play through.
    // Before voice a Bluetooth headset can show as A2DP, its call link only comes with voice
    Function("hasHeadset") { () -> Bool in
      let headsets: Set<AVAudioSession.Port> = [
        .bluetoothHFP, .bluetoothA2DP, .bluetoothLE, .headphones, .usbAudio,
      ]
      return AVAudioSession.sharedInstance().currentRoute.outputs
        .contains { headsets.contains($0.portType) }
    }

    // apps can't play the phone's ringtone, a bundled ring stands in, silent with the ring switch.
    // In voice chat a call waiting beep instead.
    Function("startRinging") { (inCall: Bool) in
      let sound = inCall ? "beep" : "ring"
      guard self.ringer?.url?.deletingPathExtension().lastPathComponent != sound,
        let url = Bundle(for: AudioRouteModule.self)
          .url(forResource: "AudioRoute", withExtension: "bundle")
          .flatMap(Bundle.init(url:))?
          .url(forResource: sound, withExtension: "wav")
      else { return }
      self.ringer?.stop()
      let ringer = try AVAudioPlayer(contentsOf: url)
      ringer.numberOfLoops = -1
      ringer.play()
      self.ringer = ringer
    }

    Function("stopRinging") {
      self.ringer?.stop()
      self.ringer = nil
    }
  }
}

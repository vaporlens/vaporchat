import AVFoundation
import ExpoModulesCore

public class AudioRouteModule: Module {
  private var ringer: AVAudioPlayer?
  private var routeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onOutputsChange")

    // headsets connecting and going, and voice changing where audio plays
    OnStartObserving {
      self.routeObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil
      ) { [weak self] _ in self?.sendEvent("onOutputsChange") }
    }

    OnStopObserving {
      self.routeObserver.map(NotificationCenter.default.removeObserver)
      self.routeObserver = nil
    }

    // headsets show as microphones, where audio plays follows the one picked. Bluetooth ones only
    // once voice chat's audio session is on. Headsets first, the app names the built-in ones
    Function("outputs") { () -> [[String: String]] in
      let session = AVAudioSession.sharedInstance()
      let kinds: [AVAudioSession.Port: String] = [
        .bluetoothHFP: "bluetooth", .bluetoothLE: "bluetooth", .headsetMic: "wired",
        .usbAudio: "usb",
      ]
      var outputs = (session.availableInputs ?? []).compactMap { input in
        kinds[input.portType].map { ["id": input.uid, "kind": $0, "name": input.portName] }
      }
      // headphones without a microphone show only while audio plays through them, a headset's
      // shows there too
      if !outputs.contains(where: { $0["kind"] == "wired" }),
        let phones = session.currentRoute.outputs.first(where: { $0.portType == .headphones })
      {
        outputs.append(["id": phones.uid, "kind": "wired", "name": phones.portName])
      }
      if UIDevice.current.userInterfaceIdiom == .phone {
        outputs.append(["id": "earpiece", "kind": "earpiece", "name": ""])
      }
      outputs.append(["id": "speaker", "kind": "speaker", "name": ""])
      return outputs
    }

    // WebRTC's voice chat audio session plays through the earpiece unless told otherwise.
    // The speaker override lasts until the route changes, so callers apply it again once voice
    // connects
    Function("setOutput") { (id: String) in
      let session = AVAudioSession.sharedInstance()
      if id == "speaker" {
        try session.overrideOutputAudioPort(.speaker)
        return
      }
      try session.overrideOutputAudioPort(.none)
      // the phone's own microphone plays through the earpiece, none picked through the headphones
      try session.setPreferredInput(
        session.availableInputs?.first {
          id == "earpiece" ? $0.portType == .builtInMic : $0.uid == id
        })
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

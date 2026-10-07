package expo.modules.audioroute

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  private val audio
    get() = requireNotNull(appContext.reactContext)
      .getSystemService(Context.AUDIO_SERVICE) as AudioManager

  // off goes back to the default route, a headset when there is one
  private fun route(audio: AudioManager, speakerOn: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val speaker = audio.availableCommunicationDevices
        .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      if (speakerOn && speaker != null) audio.setCommunicationDevice(speaker)
      else audio.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = speakerOn
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AudioRoute")

    // WebRTC leaves the audio mode alone, voice chat routing (and the phone's echo cancellation)
    // needs the communication mode
    Function("setSpeakerOn") { on: Boolean ->
      val audio = audio
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      route(audio, on)
    }

    // ends the communication mode once voice is over, the volume keys control media again
    Function("reset") {
      val audio = audio
      route(audio, false)
      audio.mode = AudioManager.MODE_NORMAL
    }
  }
}

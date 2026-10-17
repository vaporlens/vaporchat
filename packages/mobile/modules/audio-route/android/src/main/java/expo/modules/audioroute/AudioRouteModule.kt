package expo.modules.audioroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  private val audio
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var ringtone: Ringtone? = null
  private var beeper: ToneGenerator? = null

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

    // the phone's ringtone on the ring volume, silent when the phone is. In voice chat the phone's
    // call waiting beep instead, in the call's audio, repeating until stopped
    Function("startRinging") { inCall: Boolean ->
      if (inCall) {
        ringtone?.stop()
        ringtone = null
        beeper = beeper ?: ToneGenerator(AudioManager.STREAM_VOICE_CALL, 80).apply {
          startTone(ToneGenerator.TONE_SUP_CALL_WAITING)
        }
        return@Function
      }
      beeper?.release()
      beeper = null
      ringtone = ringtone ?: RingtoneManager.getRingtone(
        context,
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      )?.apply {
        audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
        // older Androids play it once
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
        play()
      }
    }

    Function("stopRinging") {
      ringtone?.stop()
      ringtone = null
      beeper?.release()
      beeper = null
    }
  }
}

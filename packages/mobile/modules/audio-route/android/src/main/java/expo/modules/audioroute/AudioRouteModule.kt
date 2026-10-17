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

  // headsets that carry voice chat, Bluetooth ones over their call link (SCO). Bluetooth first
  private val headsetTypes = listOf(
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_HEADSET
  )

  private fun headset(audio: AudioManager): AudioDeviceInfo? {
    val devices = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.availableCommunicationDevices
    } else {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
    }
    return headsetTypes.firstNotNullOfOrNull { type -> devices.firstOrNull { it.type == type } }
  }

  // off plays through the headset when there is one, the earpiece otherwise
  private fun route(audio: AudioManager, speakerOn: Boolean) {
    val headset = if (speakerOn) null else headset(audio)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = if (speakerOn) {
        audio.availableCommunicationDevices
          .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      } else headset
      if (device != null) audio.setCommunicationDevice(device)
      else audio.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = speakerOn
      // wired headsets take over by themselves, Bluetooth ones only once asked for their call link.
      // Starts are counted, a reconnect asking again would outlast the one stop in reset
      val bluetooth = headset?.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
      @Suppress("DEPRECATION")
      if (!bluetooth) audio.stopBluetoothSco()
      else if (!audio.isBluetoothScoOn) audio.startBluetoothSco()
      @Suppress("DEPRECATION")
      audio.isBluetoothScoOn = bluetooth
    }
  }

  private fun clearRoute(audio: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = false
      @Suppress("DEPRECATION")
      audio.stopBluetoothSco()
      @Suppress("DEPRECATION")
      audio.isBluetoothScoOn = false
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
      clearRoute(audio)
      audio.mode = AudioManager.MODE_NORMAL
    }

    // the speaker's default when voice starts: off with a headset voice chat can play through
    Function("hasHeadset") { headset(audio) != null }

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

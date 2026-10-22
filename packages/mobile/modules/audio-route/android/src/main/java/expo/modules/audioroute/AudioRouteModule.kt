package expo.modules.audioroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  private val audio
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var ringtone: Ringtone? = null
  private var beeper: ToneGenerator? = null

  // what voice chat can play through, Bluetooth headsets over their call link (SCO). Headsets
  // first, in the order to prefer them
  private val kinds = linkedMapOf(
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO to "bluetooth",
    AudioDeviceInfo.TYPE_BLE_HEADSET to "bluetooth",
    AudioDeviceInfo.TYPE_WIRED_HEADSET to "wired",
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES to "wired",
    AudioDeviceInfo.TYPE_USB_HEADSET to "usb",
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE to "earpiece",
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER to "speaker"
  )

  private fun outputs(audio: AudioManager): List<AudioDeviceInfo> {
    val devices = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.availableCommunicationDevices
    } else {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
    }
    val order = kinds.keys.toList()
    return devices.filter { it.type in kinds }.sortedBy { order.indexOf(it.type) }
  }

  private fun route(audio: AudioManager, device: AudioDeviceInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.setCommunicationDevice(device)
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
      // wired headsets take over by themselves, Bluetooth ones only once asked for their call link.
      // Starts are counted, a reconnect asking again would outlast the one stop in reset
      val bluetooth = device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
      @Suppress("DEPRECATION")
      if (!bluetooth) audio.stopBluetoothSco()
      else if (!audio.isBluetoothScoOn) audio.startBluetoothSco()
      @Suppress("DEPRECATION")
      audio.isBluetoothScoOn = bluetooth
    }
  }

  // headsets connecting and going
  private val devicesChanged = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) =
      sendEvent("onOutputsChange")

    override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) =
      sendEvent("onOutputsChange")
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

    Events("onOutputsChange")

    OnStartObserving {
      audio.registerAudioDeviceCallback(devicesChanged, Handler(Looper.getMainLooper()))
    }

    OnStopObserving { audio.unregisterAudioDeviceCallback(devicesChanged) }

    // built-in ones are named after the phone, the app names those
    Function("outputs") {
      outputs(audio).map {
        mapOf("id" to it.id.toString(), "kind" to kinds[it.type], "name" to it.productName.toString())
      }
    }

    // WebRTC leaves the audio mode alone, voice chat routing (and the phone's echo cancellation)
    // needs the communication mode
    Function("setOutput") { id: String ->
      val audio = audio
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      outputs(audio).firstOrNull { it.id.toString() == id }?.let { route(audio, it) }
    }

    // ends the communication mode once voice is over, the volume keys control media again
    Function("reset") {
      val audio = audio
      clearRoute(audio)
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

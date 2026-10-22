package expo.modules.callservice

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

private const val CALL_CHANNEL = "voice"
private const val CONNECTION_CHANNEL = "connection"
private const val NOTIFICATION_ID = 1

/** Whether voice is on, or only the connection to Steam is kept, a boolean extra. */
const val EXTRA_CALL = "call"

/** The notification's Leave button, see `CallService.onLeave`. */
private const val ACTION_LEAVE = "expo.modules.callservice.LEAVE"

/**
 * Keeps the app running while voice is on, or in the background when asked to stay connected:
 * Android stops the microphone of apps in the background and freezes them, unless they show a
 * notification for what they do.
 */
class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_LEAVE) {
      // the app stops the service once voice ended, without it there is nothing to leave
      onLeave?.invoke() ?: stopSelf()
      return START_NOT_STICKY
    }
    val call = intent?.getBooleanExtra(EXTRA_CALL, true) ?: true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notifications = getSystemService(NotificationManager::class.java)
      notifications.createNotificationChannel(
        NotificationChannel(CALL_CHANNEL, "Voice chat", NotificationManager.IMPORTANCE_LOW)
      )
      // the least it can be, folded away at the bottom of the shade
      notifications.createNotificationChannel(
        NotificationChannel(
          CONNECTION_CHANNEL,
          "Staying connected",
          NotificationManager.IMPORTANCE_MIN
        )
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = NotificationCompat.Builder(this, if (call) CALL_CHANNEL else CONNECTION_CHANNEL)
      .setSmallIcon(R.drawable.call_notification)
      .setContentTitle(if (call) "In voice chat" else "Connected to Steam")
      .setContentText(if (call) "Tap to return to it" else "For alerts while in the background")
      .setContentIntent(open)
      .setOngoing(true)
      .setCategory(if (call) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_SERVICE)
    if (call) {
      val leave = PendingIntent.getService(
        this,
        0,
        Intent(this, CallService::class.java).setAction(ACTION_LEAVE),
        PendingIntent.FLAG_IMMUTABLE
      )
      builder.addAction(R.drawable.call_end, "Leave", leave)
    }
    val notification = builder.build()
    // the microphone type needs the microphone permission, without it voice joins listen-only
    val microphone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      when {
        !call -> ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
        microphone -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        else -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      }
    )
    return START_NOT_STICKY
  }

  companion object {
    var running = false
      private set

    /** Called when the notification's Leave button is tapped, set while the module lives. */
    var onLeave: (() -> Unit)? = null
  }
}

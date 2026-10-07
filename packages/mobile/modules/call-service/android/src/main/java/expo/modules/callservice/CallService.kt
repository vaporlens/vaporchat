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

private const val CHANNEL = "voice"
private const val NOTIFICATION_ID = 1

/**
 * Keeps the app running while voice is on: Android stops the microphone of apps in the background
 * and freezes them, unless they show a notification for what they do.
 */
class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Voice chat", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.call_notification)
      .setContentTitle("In voice chat")
      .setContentText("Tap to return to it")
      .setContentIntent(open)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .build()
    // the microphone type needs the microphone permission, without it voice joins listen-only
    val microphone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      if (microphone) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      else ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    )
    return START_NOT_STICKY
  }
}

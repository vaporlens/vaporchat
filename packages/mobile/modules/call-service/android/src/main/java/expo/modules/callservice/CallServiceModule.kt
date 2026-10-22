package expo.modules.callservice

import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Registered in index.ts, it never ends by itself. */
private const val KEEP_RUNNING_TASK = "KeepRunning"

class CallServiceModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  private var taskId: Int? = null

  // react native pauses the app's timers in the background (steam's heartbeat, reconnecting),
  // except while a headless task runs
  private fun keepJsRunning(on: Boolean) = UiThreadUtil.runOnUiThread {
    val tasks = HeadlessJsTaskContext.getInstance(context as ReactContext)
    val running = taskId
    if (on && running == null) {
      taskId = tasks.startTask(
        HeadlessJsTaskConfig(KEEP_RUNNING_TASK, Arguments.createMap(), 0, true)
      )
    } else if (!on && running != null) {
      tasks.finishTask(running)
      taskId = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CallService")

    Events("onLeave")

    OnCreate {
      CallService.onLeave = { sendEvent("onLeave") }
    }

    OnDestroy {
      CallService.onLeave = null
    }

    Function("start") { call: Boolean ->
      val intent = Intent(context, CallService::class.java).putExtra(EXTRA_CALL, call)
      try {
        // a running one switches between call and connection, which works from the background
        if (CallService.running) context.startService(intent)
        else ContextCompat.startForegroundService(context, intent)
        keepJsRunning(true)
      } catch (err: IllegalStateException) {
        // starting one from the background isn't allowed, the next start from the app does
        Log.w("CallService", "Could not start the service", err)
      }
    }

    Function("stop") {
      context.stopService(Intent(context, CallService::class.java))
      keepJsRunning(false)
    }
  }
}

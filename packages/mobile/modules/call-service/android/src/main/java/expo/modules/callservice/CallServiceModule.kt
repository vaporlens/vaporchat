package expo.modules.callservice

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallServiceModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("CallService")

    Function("start") {
      ContextCompat.startForegroundService(context, Intent(context, CallService::class.java))
    }

    Function("stop") {
      context.stopService(Intent(context, CallService::class.java))
    }
  }
}

package app.nirmtrix
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
/** JS bridge. replaceAll() takes ReminderRepo.rebuild().register; drainActions() returns alarm outcomes to apply with applyNativeActions(). */
@CapacitorPlugin(name = "NirmtrixAlarm")
class NirmtrixAlarmPlugin : Plugin() {
    @PluginMethod fun status(call: PluginCall) {
        val ok = JSObject().put("exactAlarms", AlarmScheduler.canExact(context)).put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
        call.resolve(ok)
    }
    @PluginMethod fun replaceAll(call: PluginCall) {
        val arr = call.getArray("alarms") ?: return call.reject("alarms required")
        AlarmStore.all(context).forEach { AlarmScheduler.cancel(context, it.getString("id")) }
        for (k in 0 until arr.length()) { val o = arr.getJSONObject(k); AlarmScheduler.schedule(context, o.getString("id"), o.getString("taskId"), o.getString("title"), o.getLong("at"), o.optInt("priority", 1)) }
        call.resolve()
    }
    @PluginMethod fun drainActions(call: PluginCall) { call.resolve(JSObject().put("actions", AlarmStore.drainActions(context))) }
    @PluginMethod fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 33) ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001); call.resolve()
    }
    @PluginMethod fun openExactAlarmSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 31) activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))); call.resolve()
    }
    @PluginMethod fun openFullScreenSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 34) activity.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))); call.resolve()
    }
    @PluginMethod fun openBatterySettings(call: PluginCall) { activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); call.resolve() }
}

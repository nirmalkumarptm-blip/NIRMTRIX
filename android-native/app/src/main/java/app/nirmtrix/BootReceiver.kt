package app.nirmtrix
import android.content.*
/** Re-registers alarms after reboot, clock change or time-zone change. App also calls rebuild() from SQLite on every launch to reconcile. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) { AlarmScheduler.restoreAll(c) }
}

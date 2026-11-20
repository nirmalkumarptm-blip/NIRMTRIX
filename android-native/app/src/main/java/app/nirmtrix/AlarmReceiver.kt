package app.nirmtrix
import android.app.*
import android.content.*
import android.os.Build
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val id = i.getStringExtra("id") ?: return; val taskId = i.getStringExtra("taskId") ?: ""; val title = i.getStringExtra("title") ?: "Task"
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("nx_alarm", "NIRMTRIX alarms", NotificationManager.IMPORTANCE_HIGH).apply { setBypassDnd(false); enableVibration(true) })
        val full = PendingIntent.getActivity(c, id.hashCode(), Intent(c, AlarmActivity::class.java).putExtras(i).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, "nx_alarm") else Notification.Builder(c)).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(title).setContentText("NIRMTRIX reminder")
            .setCategory(Notification.CATEGORY_ALARM).setFullScreenIntent(full, true).setAutoCancel(true).build()
        nm.notify(id.hashCode(), n); AlarmStore.remove(c, id); AlarmStore.pushAction(c, id, taskId, "fired")   // JS applies it via applyNativeActions()
    }
}

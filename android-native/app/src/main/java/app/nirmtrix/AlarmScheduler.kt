package app.nirmtrix
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
object AlarmScheduler {
    private fun pi(c: Context, id: String, title: String, taskId: String, p: Int): PendingIntent {
        val i = Intent(c, AlarmReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("taskId", taskId).putExtra("p", p)
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun canExact(c: Context) = Build.VERSION.SDK_INT < 31 || (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    /** setAlarmClock is Doze-exempt and shows the system alarm icon: the most reliable user-visible alarm API. Needs SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM. */
    fun schedule(c: Context, id: String, taskId: String, title: String, at: Long, p: Int) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        AlarmStore.put(c, id, taskId, title, at, p)
        val show = PendingIntent.getActivity(c, 0, c.packageManager.getLaunchIntentForPackage(c.packageName), PendingIntent.FLAG_IMMUTABLE)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi(c, id, title, taskId, p))
    }
    fun cancel(c: Context, id: String) {
        (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi(c, id, "", "", 0)); AlarmStore.remove(c, id)
    }
    fun restoreAll(c: Context) { val now = System.currentTimeMillis(); for (a in AlarmStore.all(c)) { if (a.getLong("at") > now) schedule(c, a.getString("id"), a.getString("taskId"), a.getString("title"), a.getLong("at"), a.getInt("p")) else AlarmStore.remove(c, a.getString("id")) } }
}

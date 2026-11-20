package app.nirmtrix
import android.app.Activity
import android.app.NotificationManager
import android.graphics.Color
import android.media.*
import android.animation.ObjectAnimator
import android.os.*
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
/** Full-screen alarm over the lock screen. Outcomes are queued natively and applied to SQLite by JS (applyNativeActions). UNTESTED on a device. */
class AlarmActivity : Activity() {
    private var player: MediaPlayer? = null
    private var vib: Vibrator? = null
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) } else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val id = intent.getStringExtra("id") ?: ""; val taskId = intent.getStringExtra("taskId") ?: ""; val title = intent.getStringExtra("title") ?: "Task"; val p = intent.getIntExtra("p", 1)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(Color.BLACK); setPadding(48, 48, 48, 48) }
        val n = TextView(this).apply { text = "N"; textSize = 110f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#39FF14")); setShadowLayer(40f, 0f, 0f, Color.parseColor("#39FF14")) }
        ObjectAnimator.ofFloat(n, "alpha", 0.45f, 1f).apply { duration = 900; repeatMode = ObjectAnimator.REVERSE; repeatCount = ObjectAnimator.INFINITE; start() }
        root.addView(n)
        root.addView(TextView(this).apply { text = title; textSize = 28f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#E8FFE8")) })
        root.addView(TextView(this).apply { text = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date()); textSize = 18f; gravity = Gravity.CENTER; setTextColor(Color.GRAY) })
        fun done(act: () -> Unit) { act(); (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(id.hashCode()); finish() }
        fun btn(label: String, act: () -> Unit) = root.addView(Button(this).apply { text = label; setOnClickListener { done(act) } })
        btn("Snooze 10 min") { AlarmScheduler.schedule(this, id, taskId, title, System.currentTimeMillis() + 600_000, p); AlarmStore.pushAction(this, id, taskId, "snooze", 10) }
        btn("Dismiss") { AlarmStore.pushAction(this, id, taskId, "dismiss") }
        btn("Complete") { AlarmStore.pushAction(this, id, taskId, "complete") }
        setContentView(root)
        player = MediaPlayer.create(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))?.apply { isLooping = true; setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()); start() }
        vib = getSystemService(Vibrator::class.java)?.also { if (Build.VERSION.SDK_INT >= 26) it.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 600), 0)) }
    }
    override fun onDestroy() { player?.release(); vib?.cancel(); super.onDestroy() }
}

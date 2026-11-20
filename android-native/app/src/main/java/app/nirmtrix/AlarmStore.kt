package app.nirmtrix
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
/** Native-side schedule (so alarms re-register after reboot without the WebView) plus a durable queue of alarm outcomes for JS to apply to SQLite. */
object AlarmStore {
    private fun sp(c: Context) = c.getSharedPreferences("nx_alarms", Context.MODE_PRIVATE)
    fun all(c: Context): List<JSONObject> { val a = JSONArray(sp(c).getString("a", "[]")); return (0 until a.length()).map { a.getJSONObject(it) } }
    private fun write(c: Context, l: List<JSONObject>) = sp(c).edit().putString("a", JSONArray(l).toString()).apply()
    fun put(c: Context, id: String, taskId: String, title: String, at: Long, priority: Int) =
        write(c, all(c).filter { it.getString("id") != id } + JSONObject().put("id", id).put("taskId", taskId).put("title", title).put("at", at).put("p", priority))
    fun remove(c: Context, id: String) = write(c, all(c).filter { it.getString("id") != id })
    @Synchronized fun pushAction(c: Context, id: String, taskId: String, action: String, minutes: Int = 0) {
        val q = JSONArray(sp(c).getString("q", "[]")); q.put(JSONObject().put("id", id).put("taskId", taskId).put("action", action).put("at", System.currentTimeMillis()).put("minutes", minutes))
        sp(c).edit().putString("q", q.toString()).commit()   // commit(): must survive the process being killed right after
    }
    @Synchronized fun drainActions(c: Context): JSONArray { val s = sp(c).getString("q", "[]") ?: "[]"; sp(c).edit().putString("q", "[]").commit(); return JSONArray(s) }
}

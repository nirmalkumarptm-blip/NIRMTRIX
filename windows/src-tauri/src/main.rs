// UNTESTED: written without a Rust toolchain. See docs/WINDOWS.md for the verification checklist.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use rusqlite::{params, Connection};
use std::{thread, time::Duration};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, TrayIconBuilder, TrayIconEvent}, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;

// Same rule as ReminderRepo.rebuild() in packages/core (that SQL is tested): due now, not older than 24h.
const DUE_SQL: &str = "SELECT id,task_id,title,priority,rec,at FROM (
  SELECT r.id AS id,r.task_id AS task_id,t.title AS title,t.priority AS priority,(t.recurrence_json IS NOT NULL) AS rec,
  CASE WHEN r.state='snoozed' AND r.snoozed_until IS NOT NULL THEN r.snoozed_until ELSE r.fire_at_utc END AS at
  FROM reminders r JOIN tasks t ON t.id=r.task_id
  WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL AND t.completed_at IS NULL AND r.state IN('pending','snoozed') AND r.fire_at_utc IS NOT NULL)
  WHERE at<=? AND at>?";

fn now_ms() -> i64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64 }
fn open_db(app: &AppHandle) -> Option<Connection> {
    // Must match the path the frontend's SQL plugin uses (app config dir). Verify on a real install.
    let p = app.path().app_config_dir().ok()?.join("nirmtrix.db");
    if !p.exists() { return None; }
    let c = Connection::open(p).ok()?; c.busy_timeout(Duration::from_secs(5)).ok()?; Some(c)
}
fn tick(app: &AppHandle) -> rusqlite::Result<()> {
    let Some(c) = open_db(app) else { return Ok(()) };
    let now = now_ms();
    let rows: Vec<(String, String, String, i64, bool)> = {
        let mut st = c.prepare(DUE_SQL)?;
        let it = st.query_map(params![now, now - 86_400_000], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get::<_, i64>(4)? == 1)))?;
        it.collect::<Result<_, _>>()?
    };
    for (id, _task, title, prio, rec) in rows {
        c.execute("UPDATE reminders SET state='fired',updated_at=?,version=version+1 WHERE id=?", params![now, id])?;
        let _ = app.notification().builder().title(&title).body("NIRMTRIX reminder").show();
        let init = format!("window.__ALARM={};", serde_json::json!({ "id": id, "title": title, "priority": prio, "recurring": rec }));
        let _ = WebviewWindowBuilder::new(app, format!("alarm-{id}"), WebviewUrl::App("alarm.html".into()))
            .title("NIRMTRIX alarm").inner_size(460.0, 560.0).always_on_top(true).center().initialization_script(&init).build();
    }
    Ok(())
}
#[tauri::command]
fn alarm_action(app: AppHandle, window: tauri::WebviewWindow, id: String, action: String, minutes: Option<i64>) -> Result<(), String> {
    let c = open_db(&app).ok_or("database not found")?; let now = now_ms();
    let e = |x: rusqlite::Error| x.to_string();
    match action.as_str() {
        "snooze" => { c.execute("UPDATE reminders SET state='snoozed',snoozed_until=?,updated_at=?,version=version+1 WHERE id=?", params![now + minutes.unwrap_or(10).max(1) * 60_000, now, id]).map_err(e)?; }
        "dismiss" => { c.execute("UPDATE reminders SET state='dismissed',updated_at=?,version=version+1 WHERE id=?", params![now, id]).map_err(e)?; }
        "complete" => { // one-off tasks only; the alarm page hides this button for recurring tasks
            c.execute("UPDATE tasks SET completed_at=?,updated_at=?,version=version+1 WHERE id=(SELECT task_id FROM reminders WHERE id=?) AND recurrence_json IS NULL", params![now, now, id]).map_err(e)?;
            c.execute("UPDATE reminders SET state='dismissed',updated_at=?,version=version+1 WHERE id=?", params![now, id]).map_err(e)?; }
        _ => return Err("unknown action".into()),
    }
    window.close().map_err(|x| x.to_string())
}
fn show_main(app: &AppHandle) { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .invoke_handler(tauri::generate_handler![alarm_action])
        .setup(|app| {
            let menu = Menu::with_items(app, &[&MenuItem::with_id(app, "open", "Open NIRMTRIX", true, None::<&str>)?, &MenuItem::with_id(app, "quit", "Quit (stops reminders)", true, None::<&str>)?])?;
            TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("NIRMTRIX").menu(&menu)
                .on_menu_event(|a, ev| match ev.id.as_ref() { "open" => show_main(a), "quit" => a.exit(0), _ => {} })
                .on_tray_icon_event(|t, ev| if let TrayIconEvent::Click { button: MouseButton::Left, .. } = ev { show_main(t.app_handle()) }).build(app)?;
            if std::env::args().any(|a| a == "--hidden") { if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); } }
            let h = app.handle().clone();
            thread::spawn(move || loop { if let Err(e) = tick(&h) { eprintln!("scheduler: {e}"); } thread::sleep(Duration::from_secs(15)); });
            Ok(())
        })
        .on_window_event(|w, ev| if let WindowEvent::CloseRequested { api, .. } = ev { if w.label() == "main" { api.prevent_close(); let _ = w.hide(); } })
        .run(tauri::generate_context!()).expect("error while running NIRMTRIX");
}

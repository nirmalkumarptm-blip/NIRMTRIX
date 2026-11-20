# NIRMTRIX for Windows (Tauri 2)

STATUS: source written, NOT compiled, NOT installed, NOT tested. Do not trust any behaviour below until the checklist passes.

## How background reminders work
- Closing the window hides it to the system tray; the process keeps running.
- A Rust thread checks the SQLite database every 15 s for due reminders (UTC times, so clock/time-zone changes need no special handling) and fires a Windows notification plus a topmost alarm window (Snooze / Dismiss / Complete).
- Autostart (Settings toggle, to be wired) launches the app hidden at login so reminders survive reboot.
- "Quit" in the tray menu stops reminders. Task Manager / crash also stops them. A Task Scheduler fallback is NOT implemented.
- The scheduler's SQL is verified against the real schema in this repo; everything else here is unverified.

## Prerequisites (your PC)
Windows 10/11, Rust (rustup), Node 20+, Microsoft C++ Build Tools, WebView2 (preinstalled on Win 11). `cargo install tauri-cli --version "^2"`.

## Build
    cd windows/src-tauri
    cargo tauri build        # NSIS installer in target/release/bundle/nsis/
Add an `icons/icon.ico` first (original NIRMTRIX icon; not created yet).

## Known gaps before this works end to end
1. Frontend still uses browser storage. It must use tauri-plugin-sql with `nirmtrix.db` in the app config dir and run packages/core migrations, otherwise the scheduler finds no database.
2. Confirm `app_config_dir()` matches the SQL plugin's database folder on a real install.
3. Autostart toggle, alarm sound profiles/volume, and Windows-side speech input are not built.
4. Completing a recurring task from the alarm window is disabled (needs per-occurrence logic).

## Test checklist (all must pass before claiming reliable reminders)
- [ ] Reminder fires with main window open / closed to tray.
- [ ] Fires after the PC was asleep, and after reboot with autostart on.
- [ ] Snooze re-rings; Dismiss / Complete update the task in the main window.
- [ ] Changing the system time zone / clock does not double-fire or skip.
- [ ] Reminder for a completed or deleted task does not fire.
- [ ] Two app launches open one instance. Tray Quit really stops it.
- [ ] Installer installs and uninstalls cleanly without admin rights.

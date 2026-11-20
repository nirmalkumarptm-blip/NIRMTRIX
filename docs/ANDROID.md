# NIRMTRIX for Android (Capacitor 8 + Kotlin)

STATUS: project scaffold, Kotlin alarm code and prepare script written. NOTHING here has been compiled, installed or run on a device. No APK exists. Do not treat alarms as working until the checklist below passes.

## Toolchain (Capacitor 8, as of Nov 2026)
Node 22+, JDK 21, Android Studio Otter (2025.2.1)+. Capacitor 8 uses compile/target SDK 36, minSdk 24, AGP 8.13.0, Gradle 8.14.3, Kotlin 2.2.20 (`npx cap migrate` updates these). Capacitor 9 is announced (Node 24, AGP 9); stay on 8 for now.

## Build steps
    npm install
    npm install @capacitor-community/sqlite@latest      # check its peer dependency allows Capacitor 8
    npm run android:init        # builds www/, `cap add android`, copies Kotlin, patches manifest + Gradle, cap sync
    cd android && ./gradlew assembleDebug               # APK: android/app/build/outputs/apk/debug/
`scripts/android-prepare.mjs` edits generated files by text matching and prints warnings where it could not; fix those by hand. Kotlin Gradle setup may need a `jvmToolchain(21)` / `compilerOptions` tweak for Kotlin 2.2.
Release APK/AAB signing (keystore, `assembleRelease`) is not set up; you must create your own keystore and keep it private.

## Permissions (what the app asks for and why)
| Permission | Why | Notes |
|---|---|---|
| USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM | Ring at the exact minute | USE_EXACT_ALARM is restricted by Google Play to alarm/calendar apps; SCHEDULE_EXACT_ALARM needs the user to allow it in Settings (plugin: openExactAlarmSettings) |
| POST_NOTIFICATIONS (Android 13+) | Show the alarm notification | runtime prompt (requestNotificationPermission) |
| USE_FULL_SCREEN_INTENT | Alarm screen over the lock screen | Android 14+: user may need to allow (openFullScreenSettings) |
| RECEIVE_BOOT_COMPLETED | Re-register alarms after restart / time change | |
| VIBRATE | Alarm vibration | |
The app should explain each of these on a first-run screen BEFORE requesting it. That screen is not built.

## How alarms flow
JS: `ReminderRepo.rebuild().register` -> plugin `replaceAll` (call on every launch, edit, time-zone change) -> `AlarmManager.setAlarmClock` (Doze-exempt) -> `AlarmReceiver` -> notification + `AlarmActivity` (Snooze/Dismiss/Complete) -> outcome queued in SharedPreferences -> JS `drainActions()` + `applyNativeActions()` on next launch/resume updates SQLite.
Android limits: force-stopping the app cancels its alarms until it is opened again; some manufacturers (Xiaomi, Oppo, Huawei, Samsung) add battery restrictions, so ask the user to exempt NIRMTRIX (openBatterySettings). Notification/alarm volume follows the alarm stream.

## NOTE: first APK skips this (see BUILD_APK.md); full SQLite path still needs it
## BLOCKER found: core is synchronous, Android SQLite is not
packages/core talks to SQLite synchronously (tested with node:sqlite). `@capacitor-community/sqlite` (and tauri-plugin-sql) are async. The core cannot run on a phone until it is converted to async (db calls return Promises; every repo method, the sync engine, backup and their tests need `await`). Alternative: an in-WebView WASM SQLite, which is not native storage and cannot be read by the Windows background reminder process. Recommendation: convert core to async. Until then the APK would only show the browser-storage UI preview, with no working alarms.

## Device test checklist (all must pass before calling alarms reliable)
- [ ] Alarm rings screen-off, locked, app swiped away, and after a Doze period (leave phone idle 1 h)
- [ ] After reboot; after changing time zone; after changing the clock
- [ ] Snooze re-rings; Dismiss and Complete update the task when the app is next opened
- [ ] Recurring task alarm: Complete closes only that day
- [ ] Exact-alarm permission denied / notification permission denied: the app tells the user and degrades safely
- [ ] Battery saver on; at least one Xiaomi/Samsung-class device
- [ ] Silent / Do Not Disturb behaviour matches the setting
- [ ] Install, upgrade over a previous version (migrations), uninstall

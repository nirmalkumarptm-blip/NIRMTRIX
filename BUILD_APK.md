# Get the NIRMTRIX APK onto your phone

STATUS: the project is READY TO BUILD but NO APK HAS BEEN BUILT. The Android/Kotlin code and the build scripts have never been compiled. The first cloud build may fail; if it does, send me the red error text from the log and I will fix it.

## What this first APK is
- The NIRMTRIX app screens (Home, Tasks, Calendar, Reminders, Analytics, Settings, voice by typing) with your tasks saved on the phone.
- REAL alarms: reminders you tick on a task are scheduled with Android's alarm system, ring with a full-screen NIRMTRIX alarm (Snooze / Dismiss / Complete), and are re-created after a restart or time change.
- NOT in this APK: syncing to a PC, PIN/fingerprint lock, photo attachments, language switching, spoken voice input (Android WebView has no speech recognition; typing works), Google Drive backup. Tasks are stored in the app's local storage, not yet the SQLite database. Clearing the app's data deletes them: use Settings > Show backup and keep a copy.

## Easiest way: build in the cloud (no Android Studio needed)
1. Make a free GitHub account and create a NEW PRIVATE repository.
2. Unzip nirmtrix-project.zip and upload ALL the files and folders into the repository (keep the `.github` folder).
3. Open the repository's **Actions** tab > **Build Android debug APK** > **Run workflow**. Wait about 5-10 minutes.
4. Open the finished run and download the artifact **nirmtrix-debug-apk**. Unzip it to get the .apk.
5. Send the APK to your phone, open it, and allow "install unknown apps" for the app you opened it from when asked.

## Or build on your PC
Install Node 22+, JDK 21 and Android Studio (Otter 2025.2.1+). In the project folder: `npm install`, `npm run android:init`, then `cd android && ./gradlew assembleDebug`. APK: `android/app/build/outputs/apk/debug/`.

## First run on the phone (do this, then test)
1. The app opens on **Settings > Alarms on this phone**. Tap each button and allow: notifications, exact alarms, full-screen alarms, and battery "do not restrict". (Samsung/Xiaomi/Oppo phones may also need "Autostart" / "Never sleeping apps" in their own settings.)
2. Tap **Test alarm in 15 seconds**, then lock the phone. You should hear the alarm and see the full-screen NIRMTRIX alarm.
3. Make a task for 3 minutes from now with a reminder "At start". Close the app and wait.
4. Restart the phone before an alarm time and confirm it still rings.
Please tell me exactly what happened at each step. Until you do, alarms are NOT proven to work.

## Known limits
- This is a debug-signed APK for your own use, not a Play Store build.
- Force-stopping the app from Android settings cancels its alarms until you open it again (an Android rule).
- Alarms are scheduled for the next 14 days (max 100); opening the app refreshes them. Alarms that were due while the phone was off are not replayed.

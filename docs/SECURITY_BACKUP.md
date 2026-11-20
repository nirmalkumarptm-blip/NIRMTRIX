# App lock and backup

STATUS: logic tested locally (PIN verifier, lockout, backup validation/restore/encryption, auto-backup rotation). Platform integration is NOT built or tested.

## PIN lock (packages/core/src/lock.ts)
- 4 or 6 digits. Only a salted PBKDF2-SHA256 verifier is stored; the PIN never is. After 5 wrong tries: 30 s lockout, doubling to 15 min; survives restarts.
- LIMIT: a PIN has only 10^4 / 10^6 possibilities. If someone can copy the app's files, they can guess it offline. This lock deters casual access on an unlocked phone/PC; it does NOT encrypt the database. Stronger protection needs the verifier in Android Keystore / Windows Credential Manager (use the `KV` interface) and an encrypted database (e.g. SQLCipher). Not done.
- Fingerprint: must use Android BiometricPrompt and Windows Hello (Windows has no fingerprint API without Hello hardware). Not built. Biometrics should only unlock the app; the PIN remains the fallback.
- The lock screen UI is not built yet.

## Backups (packages/core/src/backup.ts)
- Format: JSON with version, schema number and SHA-256 checksum. Validation rejects damaged, edited, wrong-format, newer-version and inconsistent files before anything changes.
- Restore is all-or-nothing and returns a snapshot of the previous data. PIN verifier and sync position are never exported or overwritten.
- Optional passphrase encryption (AES-256-GCM). Use it for anything leaving the device. A lost passphrase cannot be recovered.
- Auto-backup: keeps the newest 7 (configurable), at most one per ~20 h, verifies each file after writing, never touches files it did not create. Needs a platform `Sink` (app folder on Android, AppData on Windows) and a scheduler (not built).
- NOT in backups: photo files (only their records), device pairing credentials.
- Restoring on a paired device re-marks everything for sync; changed records may show up as conflict copies. Unpair first if you want a clean restore.
- Google Drive: not implemented. It needs your own Google Cloud OAuth client, the `drive.appdata` scope only, requested when the user turns it on, and should upload ENCRYPTED backups.

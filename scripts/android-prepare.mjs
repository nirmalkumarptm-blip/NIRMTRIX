// Run after `npx cap add android`. Idempotent. UNTESTED: patches generated files by text matching, so READ the warnings it prints.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
const A = 'android', J = `${A}/app/src/main/java/app/nirmtrix`, SRC = 'android-native/app/src/main/java/app/nirmtrix', warn = m => console.warn('WARNING: ' + m);
if (!existsSync(A)) { console.error('android/ missing: run `npx cap add android` first'); process.exit(1); }
mkdirSync(J, { recursive: true }); for (const f of readdirSync(SRC)) copyFileSync(`${SRC}/${f}`, `${J}/${f}`);
writeFileSync(`${J}/MainActivity.java`, `package app.nirmtrix;\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {\n  @Override public void onCreate(Bundle b) { registerPlugin(NirmtrixAlarmPlugin.class); super.onCreate(b); }\n}\n`);
const mp = `${A}/app/src/main/AndroidManifest.xml`; let m = readFileSync(mp, 'utf8');
if (!m.includes('nirmtrix:patched')) {
  const lines = readFileSync('android-native/AndroidManifest.snippet.xml', 'utf8').split('\n'), perms = lines.filter(l => l.includes('<uses-permission')), rest = lines.filter(l => !l.includes('<uses-permission'));
  if (m.includes('<application') && m.includes('</application>')) { m = m.replace('<application', `<!-- nirmtrix:patched -->\n${perms.join('\n')}\n<application`).replace('</application>', `${rest.join('\n')}\n</application>`); writeFileSync(mp, m); } else warn('manifest layout unexpected; merge android-native/AndroidManifest.snippet.xml by hand');
}
const gp = `${A}/app/build.gradle`; let g = readFileSync(gp, 'utf8');
if (!/kotlin-android|org\.jetbrains\.kotlin\.android/.test(g)) { const re = /apply plugin: ['"]com\.android\.application['"]/; if (re.test(g)) { g = g.replace(re, m => m + "\napply plugin: 'kotlin-android'"); writeFileSync(gp, g); } else warn('add the Kotlin Android plugin to android/app/build.gradle by hand'); }
const rp = `${A}/build.gradle`; let r = readFileSync(rp, 'utf8');
if (!r.includes('kotlin-gradle-plugin')) { const re = /(classpath ['"]com\.android\.tools\.build:gradle:[^'"]+['"])/; if (re.test(r)) { r = r.replace(re, "$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20'"); writeFileSync(rp, r); } else warn('add classpath org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20 to android/build.gradle by hand'); }
import { cpSync } from 'node:fs';
if (existsSync('android-native/res')) cpSync('android-native/res', `${A}/app/src/main/res`, { recursive: true });   // NIRMTRIX icons
console.log('android-prepare done. Also needed: androidx.core in app dependencies (normally present via Capacitor).');

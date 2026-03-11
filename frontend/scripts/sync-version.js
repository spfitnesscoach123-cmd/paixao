const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const appPath = path.resolve(__dirname, '..', 'app.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));

const version = pkg.version;
const parts = version.split('.');
const buildNumber = String(parts[2] || 0);
const versionCode = parseInt(parts[2] || 0, 10);

app.expo.version = version;
app.expo.ios.buildNumber = buildNumber;
app.expo.android.versionCode = versionCode;

fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n', 'utf8');

console.log(`[sync-version] package.json version: ${version}`);
console.log(`[sync-version] app.json expo.version: ${version}`);
console.log(`[sync-version] app.json ios.buildNumber: ${buildNumber}`);
console.log(`[sync-version] app.json android.versionCode: ${versionCode}`);

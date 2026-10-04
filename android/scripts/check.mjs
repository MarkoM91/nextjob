import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "release-config.json"), "utf8"));
let failures = 0;
function report(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "PENDING"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
}
const read = (file) => readFile(path.join(root, file), "utf8");
try {
  const appGradle = await read("project/app/build.gradle");
  report(/targetSdkVersion 36\b/.test(appGradle) && /compileSdkVersion 36\b/.test(appGradle), "Android 16 / API 36");
  report(appGradle.includes("com.google.androidbrowserhelper:billing:1.2.0"), "Play Billing 8 compatible Android bridge");
  report(appGradle.includes(`applicationId "${config.applicationId}"`), "Generated package matches configuration");
  const manifest = JSON.parse(await read("project/twa-manifest.json"));
  report(manifest.startUrl === config.startPath && manifest.host === new URL(config.origin).host, "Launch URL matches configuration");
  report(manifest.enableNotifications === false && manifest.fallbackType === "customtabs", "Notifications disabled; browser fallback configured");
  const androidManifest = await read("project/app/src/main/AndroidManifest.xml");
  report(/android:name="\.DelegationService"\s+android:enabled="true"\s+android:exported="true"/.test(androidManifest), "Digital Goods delegation service enabled");
  for (const size of [192, 512]) {
    const png = await readFile(path.join(root, `assets/icon-${size}.png`));
    report(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && png.readUInt32BE(16) === size && png.readUInt32BE(20) === size, `${size}px PNG icon`);
  }
} catch (error) {
  report(false, "Generated Android project", error.message);
}

if (process.argv.includes("--public")) {
  report(config.applicationIdConfirmed === true, "Permanent package ID confirmed", config.applicationId);
  report(config.playSigningSha256.length > 0, "Google Play app-signing SHA-256 certificate configured");
  async function get(route, expectedType) {
    const response = await fetch(new URL(route, config.origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (response.status !== 200 || !response.headers.get("content-type")?.includes(expectedType)) {
      throw new Error(`HTTP ${response.status}; expected public ${expectedType} without sign-in or redirects`);
    }
    return response;
  }
  for (const route of ["/upload", "/privacy"]) {
    try { await get(route, "text/html"); report(true, `Public ${route} reachable`, "Reachability only; policy content still needs review"); }
    catch (error) { report(false, `Public ${route}`, error.message); }
  }
  try {
    const manifest = await (await get("/manifest.webmanifest", "json")).json();
    const icon = manifest.icons?.find((item) => item.sizes === "512x512" && item.type === "image/png");
    const iconUrl = icon && new URL(icon.src, config.origin);
    if (!iconUrl || iconUrl.origin !== config.origin) throw new Error("No 512px PNG icon on the app origin");
    await get(iconUrl.pathname, "image/png");
    report(true, "Public web manifest and icon");
  } catch (error) { report(false, "Public web manifest and icon", error.message); }
  try {
    const links = await (await get("/.well-known/assetlinks.json", "json")).json();
    const match = links.find((link) => link.relation?.includes("delegate_permission/common.handle_all_urls") && link.target?.namespace === "android_app" && link.target.package_name === config.applicationId);
    const valid = config.playSigningSha256.length > 0 && config.playSigningSha256.every((fingerprint) => match?.target.sha256_cert_fingerprints?.includes(fingerprint));
    report(valid, "Public Digital Asset Links match Play signing certificate");
  } catch (error) { report(false, "Public Digital Asset Links", error.message); }
  try {
    if (!process.env.JAVA_HOME) throw new Error("JAVA_HOME is not configured");
    await access(path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java"));
    report(true, "Java installation located", "Use JDK 17 or the Android Studio JDK");
  } catch (error) { report(false, "Java installation", error.message); }
  try {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error("Android SDK path is not configured");
    await access(path.join(sdk, "platforms/android-36/android.jar"));
    report(true, "Android SDK 36 located");
  } catch (error) { report(false, "Android SDK 36", error.message); }
  report(false, "Paid CV checkout", "Google Play product, web payment flow, server verification, and recovery/refund handling are not implemented yet");
  report(false, "Privacy and Data safety", "Current web privacy page is a placeholder; retention/deletion and third-party disclosures need completion");
  report(false, "Signed AAB and device QA", "No release bundle has been compiled or tested on Android");
}
console.log(process.argv.includes("--public")
  ? "This reports technical launch gaps, not Google Play approval. See README.md for the remaining release work."
  : "Source checks only. Run npm run check:public for release blockers; a passing source check does not mean the app is publishable.");
process.exitCode = failures ? 1 : 0;

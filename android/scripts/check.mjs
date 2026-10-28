import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "release-config.json"), "utf8"));
let failures = 0;
function report(ok, label, detail = "") {
  console.log((ok ? "PASS " : "PENDING ") + label + (detail ? ": " + detail : ""));
  if (!ok) failures++;
}
const read = (file) => readFile(path.join(root, file), "utf8");
try {
  const gradle = await read("project/app/build.gradle");
  const manifest = await read("project/app/src/main/AndroidManifest.xml");
  const java = await read("project/app/src/main/java/com/markom91/nextjob/LauncherActivity.java");
  const billing = await read("project/app/src/main/java/com/markom91/nextjob/PlayBillingController.java");
  const metadata = JSON.parse(await read("project/wrapper-manifest.json"));
  report(gradle.includes("compileSdkVersion 36") && gradle.includes("targetSdkVersion 36"), "Android API 36");
  report(metadata.wrapper === "webview" && metadata.applicationId === config.applicationId
    && metadata.origin === config.origin && metadata.startPath === config.startPath
    && metadata.versionCode === config.versionCode && metadata.versionName === config.versionName,
    "Native WebView metadata matches release configuration");
  report(config.applicationId === "com.markom91.nextjob" && config.versionCode >= 2, "Existing Play identity and updated version code");
  report(![gradle, manifest, java].some((text) => /androidbrowserhelper|TrustedWebActivity|DelegationService|DigitalGoodsRequestHandler/.test(text)),
    "No TWA runtime");
  report(gradle.includes("com.android.billingclient:billing:9.1.0") && manifest.includes("com.android.vending.BILLING")
    && billing.includes("setObfuscatedAccountId") && billing.includes("/api/payments/google-play")
    && !billing.includes("addJavascriptInterface("), "Native Play Billing with server verification and no JavaScript interface");
  report(manifest.includes('android:allowBackup="false"') && manifest.includes('android:usesCleartextTraffic="false"')
    && !/android.permission.(CAMERA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION)/.test(manifest),
    "Private app state; HTTPS only; no broad file or device permissions");
  report(java.includes("setAllowFileAccess(false)") && java.includes("setAllowContentAccess(false)")
    && java.includes("MIXED_CONTENT_NEVER_ALLOW") && java.includes("handler.cancel()")
    && !java.includes("addJavascriptInterface("), "Restricted WebView and normal TLS validation");
  report(java.includes("ACTION_OPEN_DOCUMENT") && java.includes("ACTION_CREATE_DOCUMENT")
    && java.includes("CookieManager.getInstance().getCookie(url)") && java.includes("setInstanceFollowRedirects(false)"),
    "System CV chooser and authenticated controlled downloads");
  report(java.includes("NextJOBAndroid/") && java.includes("urls.launchUrl("), "Android checkout marker on native launches");
  for (const size of [192, 512]) {
    const png = await readFile(path.join(root, "assets/icon-" + size + ".png"));
    report(png.readUInt32BE(16) === size && png.readUInt32BE(20) === size, size + "px PNG icon");
  }
} catch (error) {
  report(false, "Android project source", error.message);
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
  report(false, "Android paid CV checkout", "Google Play product and server purchase verification remain unconfigured; the separate web Stripe flow does not complete Play Billing");
  report(false, "Privacy and Data safety", "Review saved disclosures before enabling payments or email");
  report(false, "Play release and device QA", "Version 0.1.1 is in closed testing; the billing-enabled build needs compilation, upload and purchase/device QA");
}
console.log(process.argv.includes("--public")
  ? "This reports technical launch gaps, not Google Play approval. See README.md for the remaining release work."
  : "Source checks only. Run npm run check:public for release blockers; a passing source check does not mean the app is publishable.");
process.exitCode = failures ? 1 : 0;

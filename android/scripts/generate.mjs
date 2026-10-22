import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
// Import only packaging modules, rather than Bubblewrap's SDK downloader or Google account clients.
const { TwaManifest } = require("@bubblewrap/core/dist/lib/TwaManifest.js");
const { TwaGenerator } = require("@bubblewrap/core/dist/lib/TwaGenerator.js");
const { ConsoleLog } = require("@bubblewrap/core/dist/lib/Log.js");
const androidRoot = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(androidRoot, "release-config.json"), "utf8"));
const origin = new URL(config.origin);
if (origin.protocol !== "https:" || origin.origin !== config.origin) throw new Error("origin must be an HTTPS origin without a trailing slash or path");
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(config.applicationId)) throw new Error("Invalid applicationId");
if (!config.startPath.startsWith("/") || config.startPath.startsWith("//")) throw new Error("startPath must stay on the app origin");
if (!Number.isSafeInteger(config.versionCode) || config.versionCode < 1) throw new Error("versionCode must be a positive integer");
if (!/^\d+\.\d+\.\d+$/.test(config.versionName)) throw new Error("versionName must be major.minor.patch");
for (const fingerprint of config.playSigningSha256) {
  if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) throw new Error("Invalid Play app-signing SHA-256 certificate fingerprint");
}

const assets = path.join(androidRoot, "assets");
await mkdir(assets, { recursive: true });
const svg = await readFile(path.join(assets, "nextjob.svg"), "utf8");
const icons = new Map();
for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  icons.set(`/icon-${size}.png`, png);
  await writeFile(path.join(assets, `icon-${size}.png`), png);
}
// Only local icon bytes are served. CVs, cookies, and site credentials are never read here.
const server = createServer((request, response) => {
  const icon = icons.get(request.url);
  if (!icon) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "image/png" }).end(icon);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
try {
  const temporaryIcon = `http://127.0.0.1:${server.address().port}/icon-512.png`;
  const manifest = new TwaManifest({
    packageId: config.applicationId, host: origin.host, name: "NextJOB", launcherName: "NextJOB",
    display: "standalone", themeColor: "#123b34", themeColorDark: "#123b34",
    navigationColor: "#f4f5f1", navigationColorDark: "#123b34", backgroundColor: "#f4f5f1",
    startUrl: config.startPath, iconUrl: temporaryIcon, maskableIconUrl: temporaryIcon,
    enableNotifications: false, enableSiteSettingsShortcut: true,
    splashScreenFadeOutDuration: 150, minSdkVersion: 28, orientation: "default",
    appVersion: config.versionName, appVersionCode: config.versionCode,
    signingKey: { path: "../private/upload-key.jks", alias: "nextjob-upload" },
    fingerprints: config.playSigningSha256.map((value) => ({ name: "Play app signing", value })),
    generatorApp: "bubblewrap", fallbackType: "customtabs",
    features: { playBilling: { enabled: true } }, alphaDependencies: { enabled: false },
    additionalTrustedOrigins: []
  });
  const project = path.join(androidRoot, "project");
  await new TwaGenerator().createTwaProject(project, manifest, new ConsoleLog("NextJOB"));
  // Replace temporary build-time icon URLs with the proposed public icon paths.
  manifest.iconUrl = `${config.origin}/icons/icon-512.png`;
  manifest.maskableIconUrl = manifest.iconUrl;
  await manifest.saveToFile(path.join(project, "twa-manifest.json"));
  const gradlePath = path.join(project, "build.gradle");
  const gradle = await readFile(gradlePath, "utf8");
  await writeFile(gradlePath, gradle.replaceAll("jcenter()", "mavenCentral()"));
  const appGradlePath = path.join(project, "app/build.gradle");
  const appGradle = await readFile(appGradlePath, "utf8");
  await writeFile(appGradlePath, appGradle.replace("checkReleaseBuilds false", "checkReleaseBuilds true"));
  const androidManifestPath = path.join(project, "app/src/main/AndroidManifest.xml");
  const androidManifest = await readFile(androidManifestPath, "utf8");
  // Bubblewrap couples this service to notification delegation. Digital Goods also requires it,
  // even though NextJOB has no working job alerts or notification permission request yet.
  const delegation = 'android:name=".DelegationService"\n            android:enabled="@bool/enableNotification"\n            android:exported="@bool/enableNotification"';
  if (!androidManifest.includes(delegation)) throw new Error("Bubblewrap delegation-service template changed; review billing setup before generating");
  await writeFile(androidManifestPath, androidManifest
    .replace(delegation, 'android:name=".DelegationService"\n            android:enabled="true"\n            android:exported="true"')
    .replace(`\n    package="${config.applicationId}"`, "")
    .replace(/<!-- The "package" attribute[\s\S]*?-->\n/, "<!-- Component namespaces are supplied by the Gradle namespace setting. -->\n"));
  const launcherPath = path.join(project, "app/src/main/java", config.applicationId.replaceAll(".", "/"), "LauncherActivity.java");
  const launcher = await readFile(launcherPath, "utf8");
  if ((launcher.match(/return uri;/g) ?? []).length !== 1) throw new Error("Bubblewrap launcher template changed; review Android deep-link detection before generating");
  await writeFile(launcherPath, launcher.replace("return uri;", `Uri origin = Uri.parse(getString(R.string.launchUrl));
        int expectedPort = origin.getPort() == -1 ? 443 : origin.getPort();
        int actualPort = uri == null || uri.getPort() == -1 ? 443 : uri.getPort();
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !origin.getHost().equalsIgnoreCase(uri.getHost())
                || actualPort != expectedPort) {
            return uri;
        }
        if ("android".equals(uri.getQueryParameter("source"))) {
            return uri;
        }
        // Keep the original encoded query and fragment. Put the Android marker first so an
        // existing source value cannot route a fresh app deep link to the web checkout.
        String query = uri.getEncodedQuery();
        return uri.buildUpon().encodedQuery("source=android"
                + (query == null || query.isEmpty() ? "" : "&" + query)).build();`));
  async function cleanGeneratedText(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["build", ".gradle"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await cleanGeneratedText(file);
      else if (/\.(java|xml|gradle|properties|json|bat)$/.test(entry.name) || entry.name === "gradlew") {
        const content = await readFile(file, "utf8");
        await writeFile(file, content.replace(/\r\n/g, "\n").replace(/[\t ]+$/gm, "").trimEnd() + "\n");
      }
    }
  }
  await cleanGeneratedText(project);

  // Stage public files separately: generating the package does not publish or expose the Site.
  const web = path.join(androidRoot, "web-public");
  await mkdir(path.join(web, "icons"), { recursive: true });
  await mkdir(path.join(web, ".well-known"), { recursive: true });
  for (const size of [192, 512]) await writeFile(path.join(web, `icons/icon-${size}.png`), icons.get(`/icon-${size}.png`));
  await writeFile(path.join(web, "manifest.webmanifest"), JSON.stringify({
    id: "/", name: "NextJOB", short_name: "NextJOB", start_url: "/upload", scope: "/",
    display: "standalone", background_color: "#f4f5f1", theme_color: "#123b34",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  }, null, 2) + "\n");
  const assetLinks = config.playSigningSha256.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: config.applicationId, sha256_cert_fingerprints: config.playSigningSha256 }
  }] : [];
  await writeFile(path.join(web, ".well-known/assetlinks.json"), JSON.stringify(assetLinks, null, 2) + "\n");
  console.log(`Android source generated at ${project}. Target API 36; Play Billing bridge enabled.`);
  console.log("This is an unsigned preparation project. The web checkout and release requirements are still pending.");
  if (!assetLinks.length) console.log("Digital Asset Links remain empty until the Play app-signing certificate is configured.");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

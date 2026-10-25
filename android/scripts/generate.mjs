import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "release-config.json"), "utf8"));
const origin = new URL(config.origin);
if (origin.protocol !== "https:" || origin.origin !== config.origin) throw new Error("Use a plain HTTPS origin");
if (config.applicationId !== "com.markom91.nextjob") throw new Error("Preserve the existing Play package");
if (!config.startPath.startsWith("/") || config.startPath.startsWith("//")) throw new Error("Launch path must stay on the app origin");
if (!Number.isSafeInteger(config.versionCode) || config.versionCode < 2) throw new Error("WebView builds must use version code 2 or higher");
if (!/^\d+\.\d+\.\d+$/.test(config.versionName)) throw new Error("Invalid app version");
for (const value of config.playSigningSha256) {
  if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value)) throw new Error("Invalid Play signing fingerprint");
}
const svg = await readFile(path.join(root, "assets/nextjob.svg"), "utf8");
const web = path.join(root, "web-public");
await mkdir(path.join(web, "icons"), { recursive: true });
await mkdir(path.join(web, ".well-known"), { recursive: true });
for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  await writeFile(path.join(root, "assets/icon-" + size + ".png"), png);
  await writeFile(path.join(web, "icons/icon-" + size + ".png"), png);
}
await writeFile(path.join(root, "project/wrapper-manifest.json"), JSON.stringify({
  wrapper: "webview", applicationId: config.applicationId, origin: config.origin,
  startPath: config.startPath, versionName: config.versionName, versionCode: config.versionCode,
  playSigningSha256: config.playSigningSha256
}, null, 2) + "\n");
await writeFile(path.join(web, "manifest.webmanifest"), JSON.stringify({
  id: "/", name: "NextJOB", short_name: "NextJOB", start_url: "/upload", scope: "/",
  display: "standalone", background_color: "#f4f5f1", theme_color: "#123b34",
  categories: ["business", "productivity"],
  icons: [192, 512].map((size) => ({
    src: "/icons/icon-" + size + ".png", sizes: size + "x" + size, type: "image/png",
    purpose: size === 512 ? "any maskable" : "any"
  }))
}, null, 2) + "\n");
const links = config.playSigningSha256.length ? [{
  relation: ["delegate_permission/common.handle_all_urls"],
  target: { namespace: "android_app", package_name: config.applicationId, sha256_cert_fingerprints: config.playSigningSha256 }
}] : [];
await writeFile(path.join(web, ".well-known/assetlinks.json"), JSON.stringify(links, null, 2) + "\n");
console.log("WebView metadata and public assets refreshed. Native source and upload keys were not changed.");

/** Identify the NextJOB Android app without treating an ordinary Android browser as the app. */
export function isAndroidAppLaunch({ search = "", referrer = "", userAgent = "" }: { search?: string; referrer?: string; userAgent?: string }): boolean {
  return new URLSearchParams(search).get("source") === "android"
    || referrer.startsWith("android-app://")
    || userAgent.includes("NextJOBAndroid/");
}

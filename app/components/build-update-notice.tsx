"use client";
import { useI18n } from "./language-provider";

import { useEffect, useState } from "react";
import { BUILD_VERSION } from "../../lib/build-version";

export function BuildUpdateNotice() {
  const { t, locale } = useI18n();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    let active = true;
    let checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { version?: string };
        if (active && typeof payload.version === "string" && payload.version !== BUILD_VERSION) setUpdateReady(true);
      } catch { /* Keep the current screen usable while offline. */ }
      finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);
  if (!updateReady) return null;
  return <div className="build-update-notice" role="status"><p>{t("An app update is ready. Save your changes, then refresh.")}</p><button type="button" onClick={() => window.location.reload()}>{t("Refresh app")}</button></div>;
}

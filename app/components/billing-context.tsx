"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { BillingCatalog } from "../../lib/payment";

type BillingContextValue = { catalog: BillingCatalog | null; error: string; platform: "web" | "android"; platformReady: boolean };
const BillingContext = createContext<BillingContextValue>({ catalog: null, error: "", platform: "web", platformReady: false });

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<"web" | "android">("web");
  const [platformReady, setPlatformReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/payments/catalog", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || typeof body.download?.label !== "string") throw new Error("Pricing is temporarily unavailable.");
      if (!controller.signal.aborted) setCatalog(body);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Pricing is temporarily unavailable."); });
    void (async () => {
      let android = new URLSearchParams(window.location.search).get("source") === "android" || document.referrer.startsWith("android-app://");
      try { android ||= sessionStorage.getItem("nextjob-platform") === "android"; } catch { /* Private browsing can disable storage. */ }
      const goods = (window as unknown as { getDigitalGoodsService?: (method: string) => Promise<unknown> }).getDigitalGoodsService;
      if (goods) { try { await goods.call(window, "https://play.google.com/billing"); android = true; } catch { /* Preserve the launch marker even if Play is unavailable. */ } }
      if (android) { try { sessionStorage.setItem("nextjob-platform", "android"); } catch { /* The current launch still remains marked. */ } }
      if (!controller.signal.aborted) { setPlatform(android ? "android" : "web"); setPlatformReady(true); }
    })();
    return () => controller.abort();
  }, []);
  return <BillingContext.Provider value={{ catalog, error, platform, platformReady }}>{children}</BillingContext.Provider>;
}
export function useBilling() { return useContext(BillingContext); }
export function DownloadPrice() { const { catalog, error } = useBilling(); return <>{catalog?.download.label ?? (error ? "price unavailable" : "checking price…")}</>; }

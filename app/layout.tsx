import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { BuildUpdateNotice } from "./components/build-update-notice";
import { BUILD_VERSION } from "../lib/build-version";
import { BillingProvider } from "./components/billing-context";
import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, isLocale, resolveLocale } from "../lib/i18n";
import { LanguageProvider } from "./components/language-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol = incoming.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const metadataBase = host ? new URL(`${protocol}://${host}`) : new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://nextjob.example");
  return {
    metadataBase,
    title: { default: "NextJOB — Relevant jobs and tailored applications", template: "%s · NextJOB" },
    description: "Find relevant roles and prepare a tailored CV using your own experience. Create and preview for free, then choose whether to download.",
    applicationName: "NextJOB",
    manifest: "/manifest.webmanifest",
    keywords: ["global job search", "ATS CV", "cover letter", "job matching"],
    openGraph: { type: "website", siteName: "NextJOB", title: "Find relevant jobs. Prepare your CV.", description: "A clear workspace for your experience, job search and tailored CV.", images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "NextJOB" }] },
    twitter: { card: "summary", title: "NextJOB", description: "Find relevant jobs. Prepare your CV.", images: ["/icons/icon-512.png"] },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#123b34", colorScheme: "light" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [incoming, stored] = await Promise.all([headers(), cookies()]);
  const saved = stored.get(LANGUAGE_COOKIE)?.value;
  const preference = isLocale(saved) ? saved : "auto";
  const detected = resolveLocale({ preference, country: incoming.get("x-nextjob-country") ?? incoming.get("cf-ipcountry"), acceptLanguage: incoming.get("accept-language") });
  return <html lang={detected.locale}><head><meta name="nextjob-build" content={BUILD_VERSION} /></head><body className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}><LanguageProvider initialLocale={detected.locale} initialCountry={detected.country} initialPreference={preference}><BillingProvider>{children}<BuildUpdateNotice /></BillingProvider></LanguageProvider></body></html>;
}

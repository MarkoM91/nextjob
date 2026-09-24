import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

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
    description: "Upload your CV. Find jobs worldwide. Apply with confidence. Discover relevant roles across multiple markets and prepare factual ATS-ready applications.",
    applicationName: "NextJOB",
    manifest: "/manifest.webmanifest",
    keywords: ["global job search", "ATS CV", "cover letter", "job matching"],
    openGraph: { type: "website", siteName: "NextJOB", title: "Find work that fits. Apply without the busywork.", description: "A private, factual Android-first job-search workspace from verified profile to application-ready documents.", images: [{ url: "/og-nextjob-android.png", width: 1536, height: 1024, alt: "NextJOB Android app showing a verified 92% job match." }] },
    twitter: { card: "summary_large_image", title: "NextJOB", description: "Find work that fits. Apply without the busywork.", images: ["/og-nextjob-android.png"] },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#43A047", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}>{children}</body></html>;
}

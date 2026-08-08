import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol = incoming.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const metadataBase = host ? new URL(`${protocol}://${host}`) : new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://roleradar.example");
  return {
    metadataBase,
    title: { default: "RoleRadar — Relevant jobs and tailored applications", template: "%s · RoleRadar" },
    description: "Upload your CV. Find jobs worldwide. Apply with confidence. Discover relevant roles across multiple markets and prepare factual ATS-ready applications.",
    applicationName: "RoleRadar",
    keywords: ["global job search", "ATS CV", "cover letter", "job matching"],
    openGraph: { type: "website", siteName: "RoleRadar", title: "Upload your CV. Get relevant jobs. Tailor every application.", description: "A private, factual job-search workspace from verified profile to application-ready documents.", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "RoleRadar product journey from CV to relevant jobs and a tailored application." }] },
    twitter: { card: "summary_large_image", title: "RoleRadar", description: "Upload your CV. Get relevant jobs. Tailor every application.", images: ["/og.png"] },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f7f5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}

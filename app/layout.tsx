import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: "Qəpik — Qiyməti bil. Ağıllı seç.",
  description:
    "Azərbaycan mağazalarının qiymətlərini, çatdırılma və ödəniş şərtlərini bir yerdə müqayisə edin.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#dc1658" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}

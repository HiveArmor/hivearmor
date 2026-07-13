import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "HiveArmor — Hyper-scale Incident Visibility Engine",
    template: "%s | HiveArmor",
  },
  description: "HiveArmor SIEM — Real-time threat detection, investigation, and automated response.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans bg-surface-ground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Domine, DM_Sans, JetBrains_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const domine = Domine({
  subsets: ["latin"],
  variable: "--font-domine",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mahogany — Regulatory Intelligence",
  description:
    "Personalized regulatory intelligence for RA/RI professionals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${domine.variable} ${dmSans.variable} ${jetbrains.variable} ${spaceMono.variable}`}>
      <body className={dmSans.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

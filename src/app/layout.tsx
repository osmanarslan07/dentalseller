import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLang } from "@/i18n/server";
import { LangProvider } from "@/i18n/client";
import "./globals.css";

// latin-ext carries Turkish ş ğ ı İ
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "DentalSeller",
  description: "Track UK dental patients and Antalya treatment commissions.",
  icons: {
    icon: "/logo.svg",
    apple: "/apple-icon.png",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}

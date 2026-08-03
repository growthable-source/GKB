import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getActiveHelpCenter } from "@/lib/tenancy/active";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const helpCenter = await getActiveHelpCenter();

  return {
    title: "Help Center",
    description: "Find answers and browse help articles.",
    icons: helpCenter.faviconUrl ? { icon: helpCenter.faviconUrl } : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

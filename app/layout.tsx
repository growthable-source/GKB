import type { Metadata } from "next";
import { getActiveHelpCenter } from "@/lib/tenancy/active";
import { ALL_FONT_VARIABLE_CLASSES } from "@/lib/fonts/catalog";
import "./globals.css";

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
    // Every catalog font's variable class is applied here, which only DECLARES
    // the custom properties — a family is downloaded when a rule references it,
    // so a visitor fetches only the font their help center chose. See
    // lib/fonts/catalog.ts.
    <html
      lang="en"
      className={`${ALL_FONT_VARIABLE_CLASSES} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

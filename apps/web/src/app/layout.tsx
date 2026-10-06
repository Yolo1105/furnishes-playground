import type { Metadata } from "next";
import { Archivo, Space_Mono, Syne } from "next/font/google";
import "./globals.css";
import "@/styles/shell.css";
import "@/styles/main.css";
import "@/styles/assets.css";
import "@/styles/eva.css";
import "@/styles/home.css";
import "@/styles/landing.css";
import { SITE } from "@/lib/site";

/**
 * Syne is the studio's typeface, exposed as --font-syne and aliased to
 * --font-app in globals.css so every surface reads one variable. The
 * landing and the inner pages are set as the production pages are:
 * Archivo along its width axis (compressed) and Space Mono for the
 * caps labels.
 */
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-syne",
});
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: {
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${archivo.variable} ${spaceMono.variable}`}
    >
      <body className="h-full w-full antialiased">
        {/* Animated fluid background: three blurred warm blobs drifting on
            independent loops behind every studio surface. Pure CSS, see
            globals.css `.bg-fluid`. */}
        <p className="old-browser" role="status">
          This browser is older than the studio supports. It needs Chrome or
          Edge 119, Safari 16.4 or Firefox 128, or newer.
        </p>
        <div className="bg-fluid" aria-hidden="true">
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
          <div className="bg-blob bg-blob-3" />
        </div>
        {children}
      </body>
    </html>
  );
}

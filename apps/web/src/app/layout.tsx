import type { Metadata } from "next";
import { Syne } from "next/font/google";
import "./globals.css";
import "@/styles/shell.css";

/**
 * Syne is the studio's typeface, exposed as --font-syne and aliased to
 * --font-app in globals.css so every surface reads one variable.
 */
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "Furnishes Studio",
  description: "Design-to-buy studio for modular panel furniture.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={syne.variable}
      style={{ backgroundColor: "#fff4e3" }}
    >
      <body
        className="h-full w-full antialiased"
        style={{
          fontFamily: "var(--font-app), system-ui, sans-serif",
          color: "#1a1a1a",
        }}
      >
        {/* Animated fluid background: three blurred warm blobs drifting on
            independent loops behind every studio surface. Pure CSS, see
            globals.css `.bg-fluid`. */}
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

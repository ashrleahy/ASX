import "./globals.css";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata = {
  title: "ASX Momentum",
  description: "Multi-factor signal dashboard for ASX equities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>
        <nav className="nav">
          <div className="nav-inner">
            <span className="nav-brand">ASX Signals</span>
            <div className="nav-links">
              <Link href="/" className="nav-link">Signal board</Link>
              <Link href="/portfolio" className="nav-link">Portfolio</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}

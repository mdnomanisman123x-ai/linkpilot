import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LINKPILOT — Website performance & media optimization", template: "%s · LINKPILOT" },
  description:
    "Compress images and videos in your browser, check broken links, and find what slows your website down.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const themeScript = `(function(){try{var t=localStorage.getItem("linkpilot-theme");if(t!=="light"){document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Nav />
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} LINKPILOT · Your images and videos are processed in your browser and are never uploaded.
        </footer>
      </body>
    </html>
  );
}

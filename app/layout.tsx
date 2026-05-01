import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnlyPreme | Supreme SS26 Week 10",
  description: "Supreme SS26 Week 10 droplist and resale nowcast for April 30, 2026."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const theme = localStorage.getItem("onlypreme-theme"); if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme; } catch {} })();`
          }}
        />
        {children}
      </body>
    </html>
  );
}

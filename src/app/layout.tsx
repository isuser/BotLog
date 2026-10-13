import type { Metadata } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Botlog",
  description: "A kanban task manager where AI is a teammate.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // globals.css sets smooth scrolling; this tells Next.js to skip it during navigations.
      data-scroll-behavior="smooth"
      // Lime, the only theme so far, is dark.
      className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} dark antialiased`}
    >
      <body>
        <div className="root flex flex-col">{children}</div>
      </body>
    </html>
  );
}

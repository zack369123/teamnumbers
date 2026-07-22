import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
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
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "RosterLab — Team Number Builder",
    description: "Turn a team logo, player last names, and jersey numbers into clean, print-ready artwork.",
    openGraph: {
      title: "RosterLab — Every name. Every number.",
      description: "Build print-ready team number artwork in minutes.",
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "RosterLab team number builder" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RosterLab — Every name. Every number.",
      description: "Build print-ready team number artwork in minutes.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TA Algo — Live Dashboard",
  description: "Real-time trading bot monitor",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

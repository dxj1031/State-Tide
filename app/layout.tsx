import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "State Tides",
  description: "A minimal journal recurrence prototype focused on gaps and discontinuity."
};

export const viewport: Viewport = {
  themeColor: "#f4f0e8"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

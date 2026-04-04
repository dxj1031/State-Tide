import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "State Tides",
  description: "A minimal journal recurrence prototype focused on gaps and discontinuity."
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

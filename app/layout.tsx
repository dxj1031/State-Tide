import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "State Tides",
  description: "A journal recurrence prototype with CBT traces, state tides, and dream incubation."
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

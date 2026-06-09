import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Judge Paw",
  description: "A fictional mini-court demo for emotionally literate couple argument judgments."
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

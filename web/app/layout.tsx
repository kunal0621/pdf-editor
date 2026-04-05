import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Editor",
  description: "Upload, inspect, edit, and export PDFs in the browser."
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


import type { Metadata } from "next";

import "./globals.css";

import { AuthProvider } from "@/components/auth-provider";

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
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}


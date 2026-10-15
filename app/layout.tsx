import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Byline: highlight authors on any paper",
  description: "Paste a DOI, highlight the authors that matter, and save the result as an image.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

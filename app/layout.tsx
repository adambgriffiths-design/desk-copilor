import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Trading Desk",
  description: "No signals. Just the read.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

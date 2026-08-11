import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Desk Copilot v0",
  description: "ICT discretionary trading copilot — verdict machine",
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

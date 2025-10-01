import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boring Budget | Thrillingly Tedious",
  description: "Budget like nobody's watching. (They're not.)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

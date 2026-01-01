import type { Metadata } from "next";
import "./globals.css";
import AuthStatus from './components/AuthStatus'

export const metadata: Metadata = {
  title: "Boring Budget | Thrillingly Tedious",
  description: "Budget like nobody's watching. (They're not.)",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthStatus />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { cookies } from 'next/headers'
import { AUTH_COOKIE_NAME } from '@/lib/auth'

export const metadata: Metadata = {
  title: "Boring Budget | Thrillingly Tedious",
  description: "Budget like nobody's watching. (They're not.)",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authCookie = (await cookies()).get(AUTH_COOKIE_NAME)

  return (
    <html lang="en">
      <body className="antialiased">
        {authCookie && (
          <div className="px-6 py-3 text-right text-xs">
            <a href="/api/logout" className="text-monday-3pm hover:underline">
              LOGOUT
            </a>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}

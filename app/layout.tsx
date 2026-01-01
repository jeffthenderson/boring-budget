import type { Metadata } from "next";
import "./globals.css";
import { createSupabaseServerClient } from '@/lib/supabase/server'
import LogoutButton from './components/LogoutButton'

export const metadata: Metadata = {
  title: "Boring Budget | Thrillingly Tedious",
  description: "Budget like nobody's watching. (They're not.)",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient({ allowMissing: true })
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } }

  return (
    <html lang="en">
      <body className="antialiased">
        {data.user && (
          <div className="px-6 py-3 text-right text-xs">
            <LogoutButton />
          </div>
        )}
        {children}
      </body>
    </html>
  );
}

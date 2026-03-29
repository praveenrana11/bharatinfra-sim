import "./globals.css";
import PlayerHUD from "@/components/PlayerHUD";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-300 bg-slate-950 antialiased selection:bg-blue-500/30">
        <PlayerHUD />
        <main className="relative w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}

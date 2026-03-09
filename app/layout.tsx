import "./globals.css";
import TopNav from "@/components/TopNav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        <TopNav />
        <main className="relative mx-auto w-full max-w-[1180px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}

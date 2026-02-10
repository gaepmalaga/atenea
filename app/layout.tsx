import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATENEA | Sistema Táctico de Oposiciones",
  description: "Plataforma de alto rendimiento para oposiciones CNP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="antialiased">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-app text-primary min-h-screen overflow-x-hidden selection:bg-brand-primary selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
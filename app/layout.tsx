import type { Metadata, Viewport } from "next";
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
  applicationName: "Atenea",
  appleWebApp: { capable: true, title: "Atenea", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="antialiased">
      <head>
        {/* EL TEMA, ANTES DE PINTAR. Sin esto, un usuario con tema oscuro
            guardado vería un fogonazo blanco hasta que React hidrata. Lee la
            preferencia de «Mi perfil» (`atenea-tema`) y, si es «sistema» o no
            hay ninguna, sigue al sistema operativo. La clase `.dark`/`.light`
            del <html> es la única fuente de verdad del tema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('atenea-tema');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var oscuro=t==='oscuro'||((t==='sistema'||!t)&&m);var c=document.documentElement.classList;c.toggle('dark',oscuro);c.toggle('light',t==='claro');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-app text-primary min-h-screen overflow-x-hidden selection:bg-brand-primary selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
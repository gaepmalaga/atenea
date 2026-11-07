import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { MARCA } from "./lib/marca";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// La tipografía de los títulos de Alphapol (regla 94).
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  // Para que la imagen de «compartir enlace» (app/opengraph-image.jpg) salga
  // con URL absoluta: WhatsApp ignora las relativas.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://atenea-eight.vercel.app"),
  openGraph: { title: `${MARCA.nombre} · ${MARCA.lema}`, description: MARCA.descripcion, siteName: MARCA.nombre, locale: "es_ES", type: "website" },
  title: `${MARCA.nombre} · ${MARCA.lema}`,
  description: MARCA.descripcion,
  applicationName: MARCA.nombre,
  appleWebApp: { capable: true, title: MARCA.nombre, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: MARCA.colores.marino,
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
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} bg-app text-primary min-h-screen overflow-x-hidden selection:bg-brand-primary selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
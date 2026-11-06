import { MARCA } from '@/app/lib/marca';

/**
 * LA CINTA DE ARRIBA de las pantallas de entrada (login, poner contraseña,
 * elegir academia): el logo y el nombre de la academia, y un filete dorado.
 *
 * Antes cada pantalla la escribía a mano con «Atenea Policial» y el filete de
 * la bandera; tres copias del mismo bloque son tres sitios donde se queda el
 * nombre viejo (regla 81). Ahora es una pieza y sale de `MARCA`.
 *
 * `<img>` y no `next/image`: es un JPG de 400 px servido desde `public/`, y
 * el optimizador no aporta nada a un logo de 36 px que ya pesa 20 KB.
 */
export default function CintaMarca() {
  return (
    <>
      <div
        className="px-5 py-2.5 flex justify-between items-center gap-3"
        style={{ background: MARCA.colores.marino, color: MARCA.colores.doradoClaro }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARCA.logo} alt="" width={36} height={36} className="w-9 h-9 rounded-sm shrink-0" />
          <span className="text-[13px] font-black uppercase tracking-[0.16em] truncate">{MARCA.nombre}</span>
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f7f4ee] shrink-0">
          Policía Nacional
        </span>
      </div>
      <div className="h-1.5 shrink-0" style={{ background: MARCA.colores.dorado }} aria-hidden />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Brain, Crosshair, Target, TrendingUp } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Opositores fundadores | Atenea Policial',
  description:
    'Buscamos a los primeros opositores a Policía Nacional (Escala Básica) que usen Atenea y nos digan qué falla. Sin coste.',
};

/**
 * LA PUERTA DE LOS OPOSITORES FUNDADORES.
 *
 * Es el destino de todo lo que se publica en Instagram para opositores
 * (`marketing/instagram/`). Hoy no hay precio para el opositor individual: se
 * buscan fundadores que la usen de verdad y digan qué falla.
 *
 * Sin esta página, quien llegaba desde Instagram caía en `/`, que es la
 * pantalla de ENTRAR: el enlace «Regístrate aquí» queda al final, fuera de la
 * primera pantalla en un móvil, y nada explicaba qué era ser fundador.
 *
 * El botón lleva a `/?alta`, que abre el formulario de registro directamente
 * (`AppShell`). Sin slug de academia, el registro cae en la academia «casa»
 * (`atenea`, P11j) y espera a que se le acepte (P12); al aceptarlo le llega
 * `plantillaBienvenidaFundador`.
 *
 * Solo promete lo que la app hace hoy, con el nombre que tiene en el menú. Si
 * se retira una pantalla, se retira de aquí también.
 *
 * Misma paleta y mismas reglas que `LoginScreen` y `/academias` (regla 43):
 * hueso, tinta, el rojo de la bandera, `TAP`/`min-h` táctil, `dvh`.
 */

const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  rojo: 'bg-[#c60b1e]',
  rojoTx: 'text-[#c60b1e]',
} as const;

const FLAG = { background: 'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)' };

const CORREO = 'alumnos@ateneapolicial.com';
const MAILTO = `mailto:${CORREO}?subject=Quiero%20ser%20opositor%20fundador`;

const LO_QUE_HACE = [
  {
    icon: Brain,
    titulo: 'Decide qué estudias hoy',
    texto:
      'Cada pregunta lleva su propio calendario de repaso, distinto para cada opositor. Lo que se te está olvidando vuelve antes de que se vaya del todo.',
  },
  {
    icon: Crosshair,
    titulo: 'Y te dice por qué',
    texto:
      'Antes de cada pregunta: «La fallaste hace 3 días: toca repasarla ya». No te pregunta nada: lo deduce de cómo respondes.',
  },
  {
    icon: Target,
    titulo: 'Lo que se te resiste, aparte',
    texto:
      'En «Repasar fallos», las que fallas una y otra vez salen separadas, con el artículo de la ley a un toque.',
  },
  {
    icon: TrendingUp,
    titulo: 'Tu evolución, día a día',
    texto:
      'Cuántas preguntas tienes dominadas, qué tema se te resiste y cada día que has estudiado. Solo lo que has hecho, sin predicciones.',
  },
];

const SER_FUNDADOR = [
  { titulo: 'Entras sin pagar', texto: 'Hoy no hay precio para opositores.' },
  { titulo: 'Lo que nos digas, se construye', texto: 'Qué falla, qué sobra, qué echas en falta. Te contesta una persona, no un bot.' },
  { titulo: 'La abanderas', texto: 'Si te sirve, que lo sepa quien estudia contigo.' },
];

const PASOS = [
  'Crea tu cuenta con tu correo.',
  'Confirma el correo que te llega.',
  'Revisamos tu solicitud y te avisamos por correo en cuanto tengas acceso.',
];

export default function FundadoresPage() {
  return (
    <main className={`min-h-dvh ${C.fondo} ${C.tinta}`}>
      <div className="bg-[#111820] text-[#f7f4ee] px-5 py-3 flex justify-between items-center gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.16em]">Atenea Policial</span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a68]">Policía Nacional</span>
      </div>
      <div className="h-1.5 shrink-0" style={FLAG} aria-hidden />

      {/* LO PRIMERO QUE SE VE: qué es y el botón, sin bajar. */}
      <section className="px-5 pt-10 pb-12 sm:pt-16 sm:pb-16 max-w-2xl mx-auto">
        <p className={`text-[11px] font-black uppercase tracking-[0.14em] mb-4 ${C.rojoTx}`}>
          Escala Básica · Sin coste
        </p>
        <h1 className="text-[2.6rem] sm:text-6xl font-black uppercase leading-[0.9] tracking-[-0.04em] mb-6">
          Buscamos opositores{' '}
          <span className={`${C.rojo} text-white px-2 inline-block`}>fundadores</span>
        </h1>
        <p className={`text-base sm:text-lg font-semibold leading-relaxed mb-8 ${C.tinta2}`}>
          Atenea decide qué estudias hoy y te dice por qué. Buscamos a los primeros opositores que la
          usen de verdad y nos digan qué falla.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/?alta"
            className={`min-h-[62px] ${C.rojo} text-white px-6 flex items-center justify-between gap-3 text-[17px] font-black uppercase tracking-[0.05em] active:translate-y-px transition-transform`}
          >
            Crear mi cuenta <ArrowRight size={22} aria-hidden />
          </Link>
          <a
            href={MAILTO}
            className="min-h-[62px] border-[3px] border-[#111820] px-6 flex items-center text-sm font-black uppercase tracking-wider break-all"
          >
            {CORREO}
          </a>
        </div>
      </section>

      <section className="px-5 pb-12 max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-6">Qué es ser fundador</h2>
        <ol className="space-y-0">
          {SER_FUNDADOR.map((f, i) => (
            <li key={f.titulo} className="flex gap-4 border-t-[3px] border-[#111820] py-4">
              <span className={`font-black tabular-nums ${C.rojoTx}`}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <p className="font-black text-lg leading-snug">{f.titulo}</p>
                <p className={`font-semibold text-[15px] leading-relaxed ${C.tinta2}`}>{f.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-[#111820] text-[#f7f4ee] px-5 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-8">Qué vas a encontrar</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {LO_QUE_HACE.map(({ icon: Icono, titulo, texto }) => (
              <div key={titulo} className="border-t-[3px] border-[#ffc400] pt-4">
                <Icono size={22} className="text-[#ffc400] mb-3" aria-hidden />
                <p className="font-black text-lg leading-snug mb-1.5">{titulo}</p>
                <p className="text-[15px] font-semibold leading-relaxed text-[#c9d1db]">{texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[15px] font-semibold leading-relaxed text-[#c9d1db]">
            Los 45 temas de la convocatoria, más de 4.600 preguntas, y simulacros de 25, 50 o 100 con
            el tiempo del examen.
          </p>
        </div>
      </section>

      <section className="px-5 py-12 sm:py-16 max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-6">Cómo entrar</h2>
        <ol className="space-y-3 mb-8">
          {PASOS.map((p, i) => (
            <li key={p} className="flex gap-4 items-baseline">
              <span className={`font-black tabular-nums ${C.rojoTx}`}>{i + 1}</span>
              <span className="font-semibold text-[15px] leading-relaxed">{p}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/?alta"
          className={`min-h-[62px] ${C.rojo} text-white px-6 flex items-center justify-between gap-3 text-[17px] font-black uppercase tracking-[0.05em] active:translate-y-px transition-transform`}
        >
          Crear mi cuenta <ArrowRight size={22} aria-hidden />
        </Link>
      </section>

      <footer className="px-5 py-6 flex flex-wrap justify-between gap-3 text-[11px] font-bold uppercase tracking-wide border-t-[3px] border-[#111820]">
        <Link href="/academias" className={C.tinta2}>¿Tienes una academia? →</Link>
        <Link href="/" className={C.tinta2}>Ya tengo cuenta: entrar →</Link>
      </footer>
    </main>
  );
}

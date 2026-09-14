import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Brain, Target, BadgeEuro, Layers, BookOpenCheck,
  Sparkles, PlayCircle,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Atenea para Academias | Preparación Escala Básica CNP',
  description:
    'La plataforma que dirige tu academia de oposición a Policía Nacional: entrenamiento adaptativo, nota real de la convocatoria, y gestión de alumnos, grupos y pagos en un solo panel.',
};

/** La misma paleta de `LoginScreen`: hueso, tinta y el rojo de la bandera. Es
 *  la identidad de cara al exterior de Atenea; el panel interno (indigo,
 *  redondeado) es otra cosa a propósito — aquí se vende la marca, no se opera
 *  la aplicación. */
const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  borde: 'border-[#111820]',
  rojo: 'bg-[#c60b1e]',
  rojoTx: 'text-[#c60b1e]',
} as const;

const FLAG = { background: 'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)' };

type FilaComparativa = { criterio: string; atenea: string; bancos: string; socias: string; propio: string };

const COMPARATIVA: FilaComparativa[] = [
  {
    criterio: 'A quién se factura',
    atenea: 'A la academia, licencia mensual',
    bancos: 'Al alumno, suscripción directa (8–16 €/mes)',
    socias: 'A la academia, sin tarifa publicada',
    propio: 'A ti: tiempo y presupuesto, sin límite fijo',
  },
  {
    criterio: 'Adaptación al alumno',
    atenea: 'Cajones por alumno calibrados al 85 % de acierto, intercalando temas',
    bancos: '"IA" en el marketing, mecanismo no publicado',
    socias: '"Personalización" citada, sin detalle técnico',
    propio: 'Ninguna, salvo que la programes tú',
  },
  {
    criterio: 'Cómo diagnostica un fallo',
    atenea: 'Se deduce del tiempo y los cambios de opción; solo pregunta cuando de verdad cambia el repaso',
    bancos: 'No se distingue del acierto',
    socias: 'No publicado',
    propio: 'Lo que decidas construir',
  },
  {
    criterio: 'Nota del simulacro',
    atenea: 'Fórmula real de la convocatoria (aciertos − fallos/(n−1)), blanco neutro',
    bancos: 'Normalmente % bruto de aciertos',
    socias: 'No publicado',
    propio: 'Lo que programes',
  },
  {
    criterio: 'Tu propio banco de preguntas',
    atenea: 'Sí — alta manual o Excel/CSV, validado igual que la IA. Solo lo ven tus alumnos',
    bancos: 'No — banco cerrado del proveedor',
    socias: 'No publicado',
    propio: 'Lo que tú escribas, sin nada previo',
  },
  {
    criterio: 'Gestión de la academia',
    atenea: 'Alumnos, grupos, pagos en efectivo mes a mes y físicas, en un panel',
    bancos: 'No aplica — solo sirve test',
    socias: 'Alumnos y progreso; pagos y físicas no suelen estar',
    propio: 'Hojas de cálculo aparte',
  },
  {
    criterio: 'Coste típico',
    atenea: 'Desde 129 €/mes por la academia entera',
    bancos: '8–16 €/mes que paga cada alumno por separado',
    socias: 'Sin precio público — orientado a academias grandes',
    propio: 'Miles de € y varios meses antes del primer alumno',
  },
];

const FEATURES = [
  {
    icon: Brain,
    titulo: 'Entrenamiento adaptativo, no un test aleatorio',
    texto:
      'Cada alumno tiene sus propios "cajones" por pregunta — nueva, en aprendizaje, dominada, atascada — derivados de su propio historial. La sesión de hoy se arma con una cuota de cada cajón, calibrada para sostener un 85 % de acierto: el punto donde se aprende más rápido sin desanimarse.',
  },
  {
    icon: Sparkles,
    titulo: 'Se deduce todo lo deducible',
    texto:
      'El tiempo de respuesta y los cambios de opción ya dicen si el alumno dudó o fue firme, y si un fallo es un olvido, una trampa o una laguna. Solo se le pregunta cuando de verdad cambia el repaso — nunca por rutina.',
  },
  {
    icon: Target,
    titulo: 'La nota que sale en el examen real',
    texto:
      'El simulacro puntúa con la fórmula oficial de la convocatoria: los fallos restan, los blancos no penalizan. El alumno entrena la misma estrategia que necesita el día del examen, no una versión que le miente hacia arriba.',
  },
  {
    icon: Layers,
    titulo: 'Un panel, no tres aplicaciones',
    texto:
      'Alta y acceso de alumnos, grupos con varios profesores, cobro en efectivo mes a mes con su histórico, y el plan de preparación física — de un preparador real o generado — conviven donde ya se modera el banco de preguntas.',
  },
  {
    icon: BookOpenCheck,
    titulo: 'Banco compartido, y el vuestro propio encima',
    texto:
      'El temario oficial (45 temas) y los exámenes reales de las últimas convocatorias vienen ya indexados y se comparten entre academias. Vuestro banco privado —escrito a mano o importado desde Excel— no lo ve nadie más.',
  },
  {
    icon: PlayCircle,
    titulo: 'Más que test: fichas, entrevista y físicas',
    texto:
      'Fichas de repaso con repetición espaciada, simulacro de entrevista personal con informe final, y planes de entrenamiento físico. No es una plataforma de test con extras: es la preparación completa a la oposición.',
  },
];

const TARIFAS = [
  { badge: 'Piloto · 6 meses', rango: 'Cualquier tamaño', precio: '99 €', sufijo: '/ mes, plano' },
  { badge: 'Tarifa base', rango: 'Hasta 30 alumnos activos', precio: '129 €', sufijo: '/ mes' },
  { badge: 'Crecimiento', rango: '31–80 alumnos activos', precio: '3,50 €', sufijo: '/ alumno / mes' },
  { badge: 'Volumen', rango: '81–150 alumnos activos', precio: '3,00 €', sufijo: '/ alumno / mes' },
  { badge: 'A medida', rango: '150+ alumnos activos', precio: 'Hablamos', sufijo: '' },
];

export default function AcademiasLandingPage() {
  return (
    <main className={`min-h-dvh ${C.fondo} ${C.tinta}`}>
      {/* CINTA */}
      <div className="bg-[#111820] text-[#f7f4ee] px-5 py-3 flex justify-between items-center gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.16em]">Atenea Policial</span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a68]">Para academias</span>
      </div>
      <div className="h-1.5 shrink-0" style={FLAG} aria-hidden />

      {/* HERO */}
      <section className="px-5 pt-10 pb-14 sm:pt-16 sm:pb-20 max-w-3xl mx-auto">
        <p className={`text-[11px] font-black uppercase tracking-[0.14em] mb-4 ${C.rojoTx}`}>
          Preparación Escala Básica CNP
        </p>
        <h1 className="text-4xl sm:text-6xl font-black uppercase leading-[0.92] tracking-[-0.03em] mb-6">
          Un panel que dirige tu academia, no solo{' '}
          <span className={`${C.rojo} text-white px-2 inline-block`}>un banco de test</span> más
        </h1>
        <p className={`text-base sm:text-lg font-semibold leading-relaxed mb-8 max-w-2xl ${C.tinta2}`}>
          Casi todas las plataformas del sector venden acceso a un banco de preguntas, directamente al
          alumno. Atenea es distinta desde el principio: se contrata por academia, gestiona alumnos,
          grupos, pagos y preparación física en un solo sitio, y adapta el estudio a cada alumno sin
          hacerle una sola pregunta de más.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/academias/demo"
            className={`min-h-[56px] ${C.rojo} text-white px-6 flex items-center gap-3 text-sm font-black uppercase tracking-wider active:translate-y-px transition-transform`}
          >
            Ver la demo <ArrowRight size={18} aria-hidden />
          </Link>
          <a
            href="mailto:contacto@ateneapolicial.com"
            className={`min-h-[56px] border-[3px] ${C.borde} px-6 flex items-center text-sm font-black uppercase tracking-wider`}
          >
            Pedir precio
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8 mt-14 pt-8 border-t-[3px] border-[#111820]">
          <div>
            <p className="text-4xl sm:text-5xl font-black tabular-nums">85%</p>
            <p className={`text-[11px] font-bold mt-1 leading-snug ${C.tinta2}`}>acierto objetivo — el sistema calibra cada sesión para sostenerlo</p>
          </div>
          <div>
            <p className="text-4xl sm:text-5xl font-black tabular-nums">45</p>
            <p className={`text-[11px] font-bold mt-1 leading-snug ${C.tinta2}`}>temas oficiales + 5 exámenes reales, ya indexados</p>
          </div>
          <div>
            <p className="text-4xl sm:text-5xl font-black tabular-nums">0</p>
            <p className={`text-[11px] font-bold mt-1 leading-snug ${C.tinta2}`}>preguntas de fricción — se deduce, no se pregunta</p>
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section className="px-5 py-14 sm:py-20 border-t-[3px] border-[#111820]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-2">Comparativa</h2>
          <p className={`text-sm font-semibold mb-8 max-w-2xl ${C.tinta2}`}>
            Frente a lo habitual en el sector: bancos de test que se venden directamente al opositor,
            plataformas "socias" sin cifras públicas, y la opción de construir algo propio.
          </p>

          <div className="overflow-x-auto border-[3px] border-[#111820]">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#111820] text-[#f7f4ee]">
                  <th className="text-left font-black uppercase text-[11px] tracking-wide px-4 py-3 w-[18%]">Criterio</th>
                  <th className="text-left font-black uppercase text-[11px] tracking-wide px-4 py-3 bg-[#c60b1e]">Atenea</th>
                  <th className="text-left font-black uppercase text-[11px] tracking-wide px-4 py-3">Bancos de test al uso</th>
                  <th className="text-left font-black uppercase text-[11px] tracking-wide px-4 py-3">Plataformas "socias"</th>
                  <th className="text-left font-black uppercase text-[11px] tracking-wide px-4 py-3">Desarrollo propio</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVA.map((fila, i) => (
                  <tr key={fila.criterio} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}>
                    <td className="align-top px-4 py-3 font-black text-[12px] border-t border-[#111820]/15">{fila.criterio}</td>
                    <td className="align-top px-4 py-3 font-bold border-t border-[#111820]/15 bg-[#ffc400]/15">{fila.atenea}</td>
                    <td className={`align-top px-4 py-3 border-t border-[#111820]/15 ${C.tinta2}`}>{fila.bancos}</td>
                    <td className={`align-top px-4 py-3 border-t border-[#111820]/15 ${C.tinta2}`}>{fila.socias}</td>
                    <td className={`align-top px-4 py-3 border-t border-[#111820]/15 ${C.tinta2}`}>{fila.propio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-5 py-14 sm:py-20 border-t-[3px] border-[#111820]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-8">Lo que de verdad cambia</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
            {FEATURES.map(({ icon: Icon, titulo, texto }) => (
              <div key={titulo} className="flex gap-4">
                <div className={`shrink-0 w-11 h-11 ${C.rojo} text-white flex items-center justify-center`}>
                  <Icon size={20} aria-hidden />
                </div>
                <div>
                  <h3 className="font-black text-base leading-snug mb-1.5">{titulo}</h3>
                  <p className={`text-sm font-medium leading-relaxed ${C.tinta2}`}>{texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIO */}
      <section className="px-5 py-14 sm:py-20 border-t-[3px] border-[#111820]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-2 flex items-center gap-3">
            <BadgeEuro size={26} className={C.rojoTx} aria-hidden /> Licencia mensual
          </h2>
          <p className={`text-sm font-semibold mb-8 max-w-2xl ${C.tinta2}`}>
            Se paga por la academia, no por alumno suelto — igual que ya facturáis vosotros. Escala con
            el número de alumnos activos, con un suelo bajo para academias pequeñas.
          </p>

          <div className="flex flex-col sm:grid sm:grid-cols-5 border-[3px] border-[#111820] divide-y-[3px] sm:divide-y-0 sm:divide-x-[3px] divide-[#111820]">
            {TARIFAS.map((t) => (
              <div key={t.badge} className="p-4 sm:p-5 bg-white flex flex-col gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wide ${C.rojoTx}`}>{t.badge}</span>
                <span className={`text-[11px] font-semibold ${C.tinta2}`}>{t.rango}</span>
                <span className="text-2xl font-black tabular-nums mt-auto">
                  {t.precio} <small className={`text-[11px] font-semibold ${C.tinta2}`}>{t.sufijo}</small>
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6">
            {['Sin permanencia — mes a mes', 'Alta y migración de alumnos incluida', 'Actualizaciones sin coste aparte', 'Tu propio dominio de acceso'].map((t) => (
              <span key={t} className="text-[12px] font-bold flex items-center gap-2">
                <span className={`w-1.5 h-1.5 ${C.rojo} inline-block`} aria-hidden /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CIERRE */}
      <section className={`${C.rojo} text-white px-5 py-14 sm:py-20`}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-4">
            Enséñate el panel funcionando
          </h2>
          <p className="text-white/90 font-semibold mb-8 leading-relaxed">
            Con datos de ejemplo, no una maqueta — la vista de la academia y la del alumno,
            tal como las verían tus profesores y tus opositores.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/academias/demo"
              className="min-h-[56px] bg-white text-[#c60b1e] px-6 flex items-center gap-3 text-sm font-black uppercase tracking-wider"
            >
              Ver la demo <ArrowRight size={18} aria-hidden />
            </Link>
            <a
              href="mailto:contacto@ateneapolicial.com"
              className="min-h-[56px] border-[3px] border-white px-6 flex items-center text-sm font-black uppercase tracking-wider"
            >
              contacto@ateneapolicial.com
            </a>
          </div>
        </div>
      </section>

      <footer className="px-5 py-6 flex flex-wrap justify-between gap-2 text-[11px] font-bold uppercase tracking-wide">
        <span>Atenea — preparación Escala Básica CNP</span>
        <Link href="/" className={C.tinta2}>Entrar a la aplicación →</Link>
      </footer>
    </main>
  );
}

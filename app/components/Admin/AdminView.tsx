'use client';

import { useState, useEffect } from 'react';
import {
  Users, Book, Building2, Activity, AlertTriangle, Database, Power, Coins,
  BadgeEuro, Users2, Dumbbell, CalendarCheck, GraduationCap, CalendarDays, Printer, LineChart,
} from 'lucide-react';

import AdminStudents from './components/AdminStudents';
import AdminExamenes from './components/AdminExamenes';
import AdminInforme from './components/AdminInforme';
import AdminPayments from './components/AdminPayments';
import AdminContent from './components/AdminContent';
import AdminActivity from './components/AdminActivity';
import AdminModeration from './components/AdminModeration';
import AdminBank from './components/AdminBank';
import AdminModules from './components/AdminModules';
import AdminCost from './components/AdminCost';
import AdminGroups from './components/AdminGroups';
import AdminAsistencia from './components/AdminAsistencia';
import AdminPhysical from './components/AdminPhysical';
import AdminAcademies from './components/AdminAcademies';
import AdminProfesores from './components/AdminProfesores';
import AdminCalendario from './components/AdminCalendario';
import ModuleErrorBoundary from '../shared/ModuleErrorBoundary';
import type { AuthUser } from '@/app/lib/auth';
import { MARCA } from '@/app/lib/marca';
import { PanelShell, type PestanaPanel } from '../ui';

/** Las pestañas del panel. El `id` de `tabs` tiene que ser uno de estos. */
type AdminTab = 'calendar' | 'students' | 'groups' | 'staff' | 'attendance' | 'physical' | 'payments' | 'moderation' | 'content' | 'activity' | 'bank' | 'modules' | 'cost' | 'academies' | 'exams' | 'report';

/**
 * La pestaña abierta también se recuerda en ESTE navegador: el panel es una
 * sola ruta, así que sin esto una recarga (o cerrar y volver) te devolvía
 * siempre a «Alumnos». Comodidad por dispositivo, no ajuste de academia.
 */
const TAB_KEY = 'atenea-admin-pestana';
const TABS_VALIDAS: AdminTab[] = [
  'calendar', 'students', 'groups', 'staff', 'attendance', 'physical', 'payments', 'moderation', 'content', 'activity', 'bank', 'modules', 'cost', 'academies', 'exams', 'report',
];

function leeTabGuardada(): AdminTab | null {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return t && (TABS_VALIDAS as string[]).includes(t) ? (t as AdminTab) : null;
  } catch {
    return null;
  }
}

/**
 * Las pantallas del panel, con su sección en la barra lateral (regla 101).
 *
 * Regla 75: «Temario & IA» (genera contra el banco COMÚN) y «Consumo IA» (mide
 * ESE gasto) son del `superadmin`, no de quien administra una academia.
 * «Banco oficial» y «Moderación» se quedan para los dos: un admin normal ve y
 * modera lo suyo (su banco privado, sus reportes); el superadmin, lo global.
 *
 * El `superadmin` NO administra ninguna academia (`organizationId` es siempre
 * `null` para él, regla 65): su banda es el banco común, lo que cuesta y la
 * comparativa entre academias. Nada de «Alumnos», «Grupos», «Pagos» ni «Prep.
 * física»: eso es de quien administra UNA academia.
 */
const PESTANAS_ADMIN: (PestanaPanel & { id: AdminTab })[] = [
  // Toda la programación de un vistazo (regla 105).
  { id: 'calendar', etiqueta: 'Calendario', icono: CalendarDays, seccion: 'Día a día' },
  { id: 'students', etiqueta: 'Alumnos', icono: Users, seccion: 'Día a día' },
  { id: 'groups', etiqueta: 'Grupos', icono: Users2, seccion: 'Día a día' },
  { id: 'staff', etiqueta: 'Profesores', icono: GraduationCap, seccion: 'Día a día' },
  { id: 'attendance', etiqueta: 'Asistencia', icono: CalendarCheck, seccion: 'Día a día' },
  { id: 'physical', etiqueta: 'Prep. física', icono: Dumbbell, seccion: 'Día a día' },
  { id: 'payments', etiqueta: 'Pagos', icono: BadgeEuro, seccion: 'Día a día' },
  // Cómo ha ido la semana y a quién hay que llamar (regla 116).
  { id: 'report', etiqueta: 'Informe semanal', icono: LineChart, seccion: 'Día a día' },
  { id: 'bank', etiqueta: 'Banco oficial', icono: Database, seccion: 'Contenido' },
  { id: 'moderation', etiqueta: 'Moderación', icono: AlertTriangle, seccion: 'Contenido' },
  // El examen en papel: cuadernillo, hoja de respuestas y plantilla (regla 115).
  { id: 'exams', etiqueta: 'Exámenes en papel', icono: Printer, seccion: 'Contenido' },
  { id: 'modules', etiqueta: 'Ajustes', icono: Power, seccion: 'Sistema' },
  { id: 'activity', etiqueta: 'Logs', icono: Activity, seccion: 'Sistema' },
];
const PESTANAS_SUPERADMIN: (PestanaPanel & { id: AdminTab })[] = [
  { id: 'content', etiqueta: 'Temario & IA', icono: Book, seccion: 'Contenido' },
  { id: 'bank', etiqueta: 'Banco oficial', icono: Database, seccion: 'Contenido' },
  { id: 'moderation', etiqueta: 'Moderación', icono: AlertTriangle, seccion: 'Contenido' },
  { id: 'cost', etiqueta: 'Consumo IA', icono: Coins, seccion: 'Sistema' },
  { id: 'academies', etiqueta: 'Academias', icono: Building2, seccion: 'Sistema' },
];
/**
 * Las cuatro de la barra inferior del móvil: las que se tocan CADA DÍA (regla
 * 103). Grupos y Profesores se montan una vez al empezar el curso: van en «Más».
 */
const PRINCIPALES_ADMIN = ['calendar', 'students', 'physical', 'payments'];
const PRINCIPALES_SUPERADMIN = ['content', 'bank', 'moderation', 'cost'];

export default function AdminView({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const esSuperadmin = user.role === 'superadmin';
  const tabs = esSuperadmin ? PESTANAS_SUPERADMIN : PESTANAS_ADMIN;

  // Un `superadmin` no administra ninguna academia (regla 65): «Alumnos» no
  // existe para él. Su pantalla de entrada es «Banco oficial» (regla 123): con
  // una sola academia, «Academias» ya no es lo que se mira cada día —sigue ahí,
  // porque «Añadir admin» es como se crean las cuentas de quien la dirige.
  const [activeTab, setActiveTab] = useState<AdminTab>(esSuperadmin ? 'bank' : 'students');

  // La pestaña guardada se aplica en un efecto, no en el estado inicial: leerla
  // en `useState` provocaría un desajuste de hidratación (el servidor no ve
  // `localStorage`). Y solo si sigue siendo una pestaña QUE ESTE ROL PUEDE VER:
  // el mismo navegador puede haber guardado "students" de una sesión de admin
  // normal, y un superadmin no la tiene — aplicarla igual habría dejado el área
  // de contenido en blanco, sin ninguna marcada como activa.
  useEffect(() => {
    const t = leeTabGuardada();
    if (t && tabs.some((tab) => tab.id === t)) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiaTab = (id: AdminTab) => {
    setActiveTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* modo privado */ }
  };

  // Truco para forzar recarga de componentes hijos sin recargar la página entera
  const [refreshKey, setRefreshKey] = useState(0);

  // Al cambiar de sección, arriba del todo. Mismo motivo que en el alumno: el
  // panel es UNA sola ruta con pestañas, así que sin esto entras en la sección
  // nueva por donde te quedaste en la anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  // Una pantalla puede pedir otra pestaña («los horarios, en Grupos»): un
  // evento del navegador, para no pasar funciones por todo el árbol (regla 99).
  const idsVisibles = tabs.map((t) => t.id).join(',');
  useEffect(() => {
    const alPedir = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (idsVisibles.split(',').includes(id)) cambiaTab(id as AdminTab);
    };
    window.addEventListener('admin:pestana', alPedir);
    return () => window.removeEventListener('admin:pestana', alPedir);
  }, [idsVisibles]);

  return (
    <PanelShell
      nombre={MARCA.nombre}
      logo={MARCA.logo}
      rol={esSuperadmin ? 'Superadmin' : 'Admin'}
      correo={user.email ?? ''}
      pestanas={tabs}
      principales={esSuperadmin ? PRINCIPALES_SUPERADMIN : PRINCIPALES_ADMIN}
      activa={activeTab}
      onCambia={(id) => cambiaTab(id as AdminTab)}
      onRefrescar={() => setRefreshKey((n) => n + 1)}
      onSalir={onLogout}
    >
      {/* Usamos la 'key' para forzar remontaje si pulsamos Recargar */}
      <div key={refreshKey} className="animate-in fade-in duration-300">
        {/* Con `key`, un fallo en una pantalla no se queda puesto al cambiar a otra. */}
        <ModuleErrorBoundary key={activeTab} moduleName={tabs.find((t) => t.id === activeTab)?.etiqueta ?? 'La sección'}>
          {activeTab === 'calendar' && <AdminCalendario />}
          {activeTab === 'students' && <AdminStudents />}
          {activeTab === 'groups' && <AdminGroups />}
          {activeTab === 'staff' && <AdminProfesores />}
          {activeTab === 'attendance' && <AdminAsistencia />}
          {activeTab === 'physical' && <AdminPhysical />}
          {activeTab === 'payments' && <AdminPayments />}
          {activeTab === 'content' && <AdminContent />}
          {activeTab === 'bank' && <AdminBank esSuperadmin={esSuperadmin} />}
          {activeTab === 'moderation' && <AdminModeration />}
          {activeTab === 'exams' && <AdminExamenes />}
          {activeTab === 'report' && <AdminInforme />}
          {activeTab === 'modules' && <AdminModules />}
          {activeTab === 'cost' && <AdminCost />}
          {activeTab === 'activity' && <AdminActivity />}
          {activeTab === 'academies' && esSuperadmin && <AdminAcademies />}
        </ModuleErrorBoundary>
      </div>
    </PanelShell>
  );
}

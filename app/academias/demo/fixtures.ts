/**
 * DATOS DE LA DEMO COMERCIAL — todos inventados, nada sale de Supabase.
 *
 * Vive separado de `app/lib/` a propósito: no es lógica de la aplicación, es
 * contenido de venta. Cambiar un nombre o una cifra aquí no toca ni un test
 * ni una Server Action. Los nombres, temas y cifras están pensados para que
 * una academia real se reconozca en la pantalla (regla 8: null ≠ 0 se
 * respeta también aquí, con Pablo Reyes, que nunca ha entrado).
 */

export type EstadoAlumnoDemo = 'activo' | 'en_riesgo' | 'abandonado' | 'nunca_entro';
export type PagoDemo = 'pagado' | 'debe' | 'exento';

export type AlumnoDemo = {
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoAlumnoDemo;
  acierto: number | null;
  contestadas: number;
  racha: number;
  grupos: string[];
  pago: PagoDemo;
};

export const ALUMNOS_DEMO: AlumnoDemo[] = [
  { id: '1', nombre: 'Laura Gómez Ruiz', correo: 'laura.gomez@ejemplo.com', estado: 'activo', acierto: 81, contestadas: 612, racha: 14, grupos: ['Repaso fin de semana'], pago: 'pagado' },
  { id: '2', nombre: 'Marcos Díaz Prieto', correo: 'marcos.diaz@ejemplo.com', estado: 'activo', acierto: 74, contestadas: 340, racha: 6, grupos: ['Físicas · L y X'], pago: 'pagado' },
  { id: '3', nombre: 'Nerea Fernández Soto', correo: 'nerea.fs@ejemplo.com', estado: 'en_riesgo', acierto: 58, contestadas: 120, racha: 0, grupos: [], pago: 'debe' },
  { id: '4', nombre: 'Iván Castro López', correo: 'ivan.castro@ejemplo.com', estado: 'abandonado', acierto: 63, contestadas: 88, racha: 0, grupos: ['Físicas · L y X'], pago: 'debe' },
  { id: '5', nombre: 'Sara Molina Vega', correo: 'sara.molina@ejemplo.com', estado: 'activo', acierto: 88, contestadas: 790, racha: 21, grupos: ['Repaso fin de semana', 'Inglés B1'], pago: 'exento' },
  { id: '6', nombre: 'Pablo Reyes Ortiz', correo: 'pablo.reyes@ejemplo.com', estado: 'nunca_entro', acierto: null, contestadas: 0, racha: 0, grupos: [], pago: 'debe' },
  { id: '7', nombre: 'Cristina Herrero Blanco', correo: 'cristina.hb@ejemplo.com', estado: 'activo', acierto: 79, contestadas: 455, racha: 9, grupos: ['Inglés B1'], pago: 'pagado' },
  { id: '8', nombre: 'Álvaro Jiménez Cano', correo: 'alvaro.jimenez@ejemplo.com', estado: 'en_riesgo', acierto: 66, contestadas: 203, racha: 1, grupos: ['Físicas · L y X'], pago: 'pagado' },
];

export const GRUPOS_DEMO = [
  { nombre: 'Físicas · L y X', tipo: 'Preparación física', alumnos: 3, profesores: ['C. Ortega'] },
  { nombre: 'Repaso fin de semana', tipo: 'Repaso', alumnos: 2, profesores: ['M. Aguilar'] },
  { nombre: 'Inglés B1', tipo: 'Idioma', alumnos: 2, profesores: ['M. Aguilar', 'C. Ortega'] },
];

export type TemaDominio = {
  tema: string;
  dominada: number;
  consolidando: number;
  aprendiendo: number;
  sinEmpezar: number;
};

export const DOMINIO_TEMARIO_DEMO: TemaDominio[] = [
  { tema: 'Constitución Española', dominada: 62, consolidando: 20, aprendiendo: 12, sinEmpezar: 6 },
  { tema: 'LOFCS', dominada: 48, consolidando: 24, aprendiendo: 18, sinEmpezar: 10 },
  { tema: 'Derecho Penal', dominada: 30, consolidando: 26, aprendiendo: 24, sinEmpezar: 20 },
  { tema: 'Violencia de género', dominada: 55, consolidando: 22, aprendiendo: 15, sinEmpezar: 8 },
  { tema: 'Atestados', dominada: 20, consolidando: 18, aprendiendo: 30, sinEmpezar: 32 },
];

export const ALUMNO_DEMO = {
  nombre: 'Marcos Díaz Prieto',
  racha: 6,
  acierto: 74,
  contestadas: 340,
  enBlanco: 9,
  proximaSesion: { total: 18, nuevas: 4, vencidas: 9, refuerzo: 5 },
  aprobaria: { nota: 6.8, mejor: 7.4, simulacros: 5 },
  ultimaActividad: [
    { texto: 'Simulacro de 50 — Constitución + LOFCS', cuando: 'Ayer', resultado: '38/50' },
    { texto: 'Entrenamiento — Derecho Penal', cuando: 'Hace 2 días', resultado: '17/20' },
    { texto: 'Fichas — Violencia de género', cuando: 'Hace 3 días', resultado: '12 fichas' },
  ],
};

export const PAGOS_MES_DEMO = {
  periodo: 'Marzo 2026',
  cobrado: 210,
  pagados: 4,
  porPagar: 2,
  exentos: 1,
};

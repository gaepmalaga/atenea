/**
 * El equipo de la academia: quien da clase y quien no (regla 130).
 *
 * `academy_staff` nació solo para profesores (regla 96), y todo lo que la
 * plataforma ofrece «para elegir profesor» —el cuadrante, los grupos, las
 * clases habituales, los temas— lee esa tabla entera. Cuando entraron Mariana
 * y Sara (gabinete y secretaría), meterlas ahí tal cual las habría puesto como
 * opción de profesor en el cuadrante de físicas y habría contado sus «horas de
 * clase» como cero.
 *
 * El puesto ya era un texto libre; lo que faltaba es saber CUÁL de esos
 * puestos no da clase. Se decide aquí, en un solo sitio, y solo por una lista
 * corta de puestos de apoyo: lo que no se reconoce (un «preparador físico»
 * escrito a mano antes de existir esta lista) SIGUE contando como quien da
 * clase. Equivocarse hacia ese lado no esconde a nadie; el contrario sí.
 *
 * Módulo PURO: lo leen el servidor y el navegador.
 */

export type Puesto = {
  valor: string;
  etiqueta: string;
  /** `false` = personal de apoyo: forma parte del equipo pero no da clase. */
  daClase: boolean;
};

/** Los puestos que ofrece el formulario. El primero es el de siempre. */
export const PUESTOS: Puesto[] = [
  { valor: 'profesor', etiqueta: 'Profesor/a', daClase: true },
  { valor: 'gabinete', etiqueta: 'Gabinete', daClase: false },
  { valor: 'secretaria', etiqueta: 'Secretaría', daClase: false },
];

/** Minúsculas, sin acentos y sin signos: «Secretaría» y «secretaria » son lo mismo. */
function clave(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Los puestos de apoyo que se reconocen aunque se escriban a mano. */
const APOYO = ['gabinete', 'secretar', 'administrativ', 'recepcion'];

/**
 * ¿Da clase quien tiene este puesto? Solo es `false` para los puestos de
 * apoyo conocidos; todo lo demás —vacío incluido— cuenta como profesor.
 */
export function daClase(puesto: string | null | undefined): boolean {
  const k = clave(puesto);
  if (!k) return true;
  return !APOYO.some((a) => k.startsWith(a));
}

/** El nombre bonito del puesto, o el texto tal cual si es uno escrito a mano. */
export function etiquetaPuesto(puesto: string | null | undefined): string {
  const k = clave(puesto);
  const conocido = PUESTOS.find((p) => clave(p.valor) === k);
  if (conocido) return conocido.etiqueta;
  return (puesto ?? '').trim() || 'Profesor/a';
}

/** Los que dan clase, de una lista de personal. */
export function soloQuienDaClase<T extends { role?: string | null }>(personal: T[]): T[] {
  return personal.filter((p) => daClase(p.role));
}

/** El equipo de apoyo (gabinete, secretaría…), de una lista de personal. */
export function soloApoyo<T extends { role?: string | null }>(personal: T[]): T[] {
  return personal.filter((p) => !daClase(p.role));
}

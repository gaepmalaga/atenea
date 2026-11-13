/**
 * EL RANKING DE CLASE de un examen en clase (regla 126).
 *
 * MÓDULO PURO (regla 21): recibe las notas ya leídas y decide quién sale y en
 * qué puesto. No toca la base de datos.
 *
 * TRES COSAS QUE LO HACEN JUSTO
 *  1. QUIEN SALE DEL RANKING SALE DEL TODO: no aparece en la lista, no ocupa un
 *     puesto y no cuenta en el total. Si no, un hueco (1.º, 2.º, 4.º) diría que
 *     alguien se ha ocultado. Y quien sale tampoco lo ve (lo decide la acción).
 *  2. LOS EMPATES COMPARTEN PUESTO (1, 2, 2, 4): dos personas con la misma nota
 *     no se ordenan por el azar ni por el alfabeto en cuanto al número.
 *  3. SOLO SE ENSEÑAN LOS PRIMEROS (`TOPE_RANKING`) y el puesto de quien mira.
 *     El último de la clase se ve a sí mismo, no una lista donde es el último.
 */

export const TOPE_RANKING = 10;
/** Con menos notas que esto no hay ranking que enseñar: sería señalar a 1 o 2 personas. */
export const MIN_PARA_RANKING = 3;

export type FilaRanking = {
  id: string;
  /** Lo que escribió el alumno en su perfil. Sin él, «Alumno»: nunca el correo. */
  nombre: string | null;
  /** La nota vigente (la del papel manda). */
  nota: number;
};

export type PuestoRanking = { puesto: number; nombre: string; nota: number; soyYo: boolean };

export type RankingClase = {
  /** Cuántos salen en el ranking (los que no se han ocultado y tienen nota). */
  total: number;
  /** El puesto de quien mira. */
  miPuesto: number;
  miNota: number;
  /** Los primeros, con su puesto; el de quien mira lleva `soyYo`. */
  primeros: PuestoRanking[];
};

const nombreDe = (n: string | null) => (n && n.trim() ? n.trim() : 'Alumno');

/**
 * `filas` son solo los que SALEN en el ranking (los ocultos ya vienen fuera).
 * Devuelve `null` si quien mira no está entre ellos o si hay menos de
 * `MIN_PARA_RANKING` notas.
 */
export function calculaRanking(filas: readonly FilaRanking[], yo: string): RankingClase | null {
  if (filas.length < MIN_PARA_RANKING) return null;
  const mia = filas.find((f) => f.id === yo);
  if (!mia) return null;

  const orden = [...filas].sort((a, b) => b.nota - a.nota || nombreDe(a.nombre).localeCompare(nombreDe(b.nombre), 'es'));
  const puestos = orden.map((f) => ({ f, puesto: 1 + orden.filter((o) => o.nota > f.nota).length }));
  return {
    total: filas.length,
    miPuesto: puestos.find((p) => p.f.id === yo)!.puesto,
    miNota: mia.nota,
    primeros: puestos.slice(0, TOPE_RANKING).map(({ f, puesto }) => ({ puesto, nombre: nombreDe(f.nombre), nota: f.nota, soyYo: f.id === yo })),
  };
}

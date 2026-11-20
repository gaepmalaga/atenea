/**
 * Proponer, no escribir (regla 138): lo que usan los guiones de operación para
 * dejar un cambio a una pregunta del banco como PROPUESTA que decide un tutor.
 *
 * Una sola propuesta pendiente por pregunta (índice único en la base de
 * datos): si ya hay una, la nueva se salta y se dice. Al terminar deja una
 * línea en «Novedades» para que los tutores se enteren.
 */
import { leeValores, cambiaAlgo } from '../../app/lib/revision.ts';

/**
 * @param db  cliente de Supabase con la clave de servicio
 * @param propuestas  [{ question_id, organization_id, before, after, reason }]
 * @param o  { fuente: 'ia' | 'dificultad' | 'claude' | 'sistema', titulo: string, detalle?: string }
 */
export async function proponer(db, propuestas, o) {
  const validas = propuestas.filter((p) => {
    const antes = leeValores(p.before);
    const despues = leeValores(p.after);
    return antes && despues && cambiaAlgo(antes, despues) && typeof p.reason === 'string' && p.reason.trim();
  });
  const ids = [...new Set(validas.map((p) => p.question_id))];
  const yaPendientes = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('question_proposals').select('question_id').in('question_id', ids.slice(i, i + 100)).eq('status', 'pending');
    if (error) throw new Error(`No se pudieron leer las propuestas pendientes: ${error.message}`);
    for (const f of data ?? []) yaPendientes.add(f.question_id);
  }
  const nuevas = validas.filter((p) => !yaPendientes.has(p.question_id));
  let escritas = 0;
  for (let i = 0; i < nuevas.length; i += 100) {
    const tanda = nuevas.slice(i, i + 100).map((p) => ({
      question_id: p.question_id, organization_id: p.organization_id ?? null, source: o.fuente,
      reason: p.reason.trim(), before: p.before, after: p.after, status: 'pending',
    }));
    const { error } = await db.from('question_proposals').insert(tanda);
    if (error) throw new Error(`No se pudieron guardar las propuestas: ${error.message}`);
    escritas += tanda.length;
  }
  if (escritas > 0) {
    const { error } = await db.from('novedades').insert({ tipo: 'propuestas', titulo: o.titulo.replace('{n}', String(escritas)), detalle: o.detalle ?? null, organization_id: null });
    if (error) console.error('No se pudo anotar la novedad:', error.message);
  }
  return { escritas, yaHabia: validas.length - nuevas.length, descartadas: propuestas.length - validas.length };
}

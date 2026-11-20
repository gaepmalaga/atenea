/**
 * De qué ley y artículo es cada pregunta del banco, con el texto vigente del
 * BOE delante (regla 138). Lo usan las mejoras que propone Claude
 * (proponer-mejoras.mjs) y el repaso contra la ley (verificar-preguntas.mjs).
 *
 * Solo da una cita si es SEGURA, por este orden: la propia referencia, la
 * explicación, el tema (si solo una de sus normas tiene ese artículo) o el
 * texto del BOE (si la pregunta coincide claramente con un artículo y no con
 * los demás). Si no, `null`: mejor sin cita que con una inventada.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citasDeLaPregunta, cabeceraDelTemario, candidatasPorTema, eligePorTexto, NO_VIGILADAS, nombreCorto } from '../../app/lib/normativa.ts';
import { articulosNombrados, palabras, mejorArticulo, claseDePrecepto } from '../../app/lib/propuestas-banco.ts';
import { idDeNorma, textoPorPrecepto } from './fuentes-boe.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function todas(pedir, etiqueta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(`No se pudo leer ${etiqueta}: ${error.message}`);
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

/**
 * Prepara lo necesario para citar las preguntas que se le pasan (con
 * `subject_id`, `document_id`, `legal_reference`, `question_text`, `options`,
 * `correct_index` y `explanation`): baja del BOE cada norma que hace falta.
 */
export async function preparaCitas(db, preguntas) {
  const temas = await todas((d, h) => db.from('subjects').select('id, topic_number').order('id').range(d, h), 'subjects');
  const temaDe = new Map(temas.map((s) => [s.id, s.topic_number]));
  const documentos = await todas((d, h) => db.from('documents').select('id, filename').order('id').range(d, h), 'documents');
  const manifiesto = JSON.parse(await readFile(join(RAIZ, 'temario', 'temario.json'), 'utf8'));
  const temaDelManifiesto = new Map(manifiesto.temas.map((t) => [t.numero, t]));
  const cabeceras = new Map();
  for (const doc of documentos) {
    const ruta = join(RAIZ, 'temario', 'md', `${doc.filename}.md`);
    if (doc.filename && existsSync(ruta)) cabeceras.set(doc.id, cabeceraDelTemario(await readFile(ruta, 'utf8')));
  }

  const contexto = new Map(); // id de pregunta → { tema, cab, citas }
  const idPorNombre = new Map();
  const nombrePorId = new Map();
  const necesarios = new Set();
  for (const q of preguntas) {
    const tema = temaDelManifiesto.get(temaDe.get(q.subject_id));
    const cab = cabeceras.get(q.document_id);
    const citas = citasDeLaPregunta(q.legal_reference, tema, cab?.boes).filter((c) => !c.norma || !NO_VIGILADAS.has(c.norma));
    contexto.set(q.id, { tema, cab, citas });
    for (const c of citas) {
      if (c.boe) { necesarios.add(c.boe); if (c.norma) nombrePorId.set(c.boe, c.norma); }
      for (const cand of c.candidatas ?? []) { necesarios.add(cand.boe); nombrePorId.set(cand.boe, cand.nombre); }
      if (c.norma && !c.boe && !idPorNombre.has(c.norma)) idPorNombre.set(c.norma, null);
    }
    for (const f of tema?.fuentes ?? []) {
      if (f.boe_id && (!cab?.boes?.length || cab.boes.includes(f.boe_id))) {
        necesarios.add(f.boe_id);
        if (!nombrePorId.has(f.boe_id)) nombrePorId.set(f.boe_id, nombreCorto(f.nombre ?? f.boe_id));
      }
    }
  }
  for (const nombre of idPorNombre.keys()) {
    const id = await idDeNorma(nombre);
    idPorNombre.set(nombre, id);
    if (id) { necesarios.add(id); nombrePorId.set(id, nombre); }
  }
  const textos = new Map();
  for (const id of necesarios) {
    const mapa = await textoPorPrecepto(id);
    if (!mapa) continue;
    for (const v of mapa.values()) v.palabras = palabras(v.texto);
    textos.set(id, mapa);
  }

  const candidatas = (tema, cab, precepto) => candidatasPorTema(tema, precepto, cab?.boes).filter((c) => textos.get(c.boe)?.has(precepto));

  /** La cita segura de una pregunta: `{ boe, norma, precepto, como }` o `null`. */
  function citaDe(q) {
    const ctx = contexto.get(q.id);
    if (!ctx) return null;
    const { tema, cab, citas } = ctx;
    const textoQ = palabras(`${q.question_text} ${Array.isArray(q.options) ? q.options[q.correct_index] ?? '' : ''}`);
    const comoTexto = `${q.explanation ?? ''} ${q.question_text}`;

    for (const c of citas) {
      const id = c.boe ?? (c.norma ? idPorNombre.get(c.norma) : null);
      // La norma la dice la referencia, o la deduce el tema (es la única de sus normas con ese precepto).
      if (c.norma && c.precepto && id && textos.get(id)?.has(c.precepto)) return { boe: id, norma: c.norma, precepto: c.precepto, como: c.origen === 'tema' ? 'el tema' : 'la referencia' };
    }
    const preceptos = [...new Set([...citas.filter((c) => c.precepto).map((c) => c.precepto), ...articulosNombrados(comoTexto)])];
    for (const p of preceptos) {
      const conNombre = citas.find((c) => c.norma && !c.precepto);
      if (conNombre) {
        const id = conNombre.boe ?? idPorNombre.get(conNombre.norma);
        if (id && textos.get(id)?.has(p)) return { boe: id, norma: conNombre.norma, precepto: p, como: 'la referencia y la explicación' };
      }
      const cands = candidatas(tema, cab, p);
      if (cands.length === 1) return { boe: cands[0].boe, norma: cands[0].nombre, precepto: p, como: 'el tema' };
      if (cands.length > 1) {
        const e = eligePorTexto(cands, comoTexto);
        if (e) return { boe: e.boe, norma: e.nombre, precepto: p, como: 'la explicación' };
        const m = mejorArticulo(textoQ, cands.map((c) => ({ clave: c.boe, palabras: textos.get(c.boe).get(p).palabras })));
        if (m) { const c = cands.find((x) => x.boe === m.clave); return { boe: c.boe, norma: c.nombre, precepto: p, como: `el texto del BOE (coincide el ${Math.round(m.cobertura * 100)} %)` }; }
      }
    }
    if (preceptos.length === 0) {
      // «disposición adicional» sin número no puede acabar en un artículo.
      const clase = claseDePrecepto(q.legal_reference);
      const fuentes = (tema?.fuentes ?? []).filter((f) => f.boe_id && textos.has(f.boe_id) && (!cab?.boes?.length || cab.boes.includes(f.boe_id)));
      const todos = [];
      const vistos = new Set();
      for (const f of fuentes) {
        if (vistos.has(f.boe_id)) continue;
        vistos.add(f.boe_id);
        for (const [p, v] of textos.get(f.boe_id)) {
          if (clase && !clase(p)) continue;
          if (!candidatasPorTema(tema, p, cab?.boes).some((c) => c.boe === f.boe_id)) continue;
          if (v.palabras.size < 8) continue;
          todos.push({ clave: `${f.boe_id}|${p}`, palabras: v.palabras });
        }
      }
      const m = mejorArticulo(textoQ, todos, 0.6, 0.15);
      if (m) {
        const [boe, p] = m.clave.split('|');
        return { boe, norma: nombrePorId.get(boe) ?? boe, precepto: p, como: `el texto del BOE (coincide el ${Math.round(m.cobertura * 100)} %)` };
      }
    }
    return null;
  }

  /** El texto vigente de un precepto: `{ id, titulo, texto }` o `null`. */
  const textoDe = (boe, precepto) => textos.get(boe)?.get(precepto) ?? null;

  return { citaDe, textoDe, citasDe: (q) => contexto.get(q.id)?.citas ?? [], normasLeidas: textos.size, normasPedidas: necesarios.size };
}

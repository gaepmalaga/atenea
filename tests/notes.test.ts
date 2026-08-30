import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeNote, MAX_NOTE_CHARS } from '../app/lib/notes';

/**
 * P3.8 · las notas privadas del alumno sobre una pregunta.
 *
 * Lo que se vigila: que vaciar el recuadro BORRE la nota en vez de dejar una
 * fila en blanco, y que estas acciones —que leen y escriben algo privado— no
 * acepten jamas un identificador de usuario. El parametro obvio aqui seria
 * "dame la nota de este usuario para esta pregunta", que es exactamente el
 * fallo original del proyecto (regla 1).
 */

describe('normalizacion de una nota', () => {
  it('recorta los extremos', () => {
    expect(normalizeNote('  ojo con los plazos  ')).toBe('ojo con los plazos');
  });

  it('normaliza los saltos de linea de Windows', () => {
    expect(normalizeNote('uno\r\ndos')).toBe('uno\ndos');
  });

  it('lo que no es texto es cadena vacia, no un error', () => {
    expect(normalizeNote(undefined)).toBe('');
    expect(normalizeNote(null)).toBe('');
    expect(normalizeNote(42)).toBe('');
    expect(normalizeNote({ note: 'hola' })).toBe('');
  });

  it('una nota de solo espacios cuenta como vacia', () => {
    // Y vacia significa BORRALA: es como se retira una nota.
    expect(normalizeNote('   \n  ')).toBe('');
  });

  it('el tope es un numero razonable para un recordatorio', () => {
    expect(MAX_NOTE_CHARS).toBeGreaterThan(200);
    expect(MAX_NOTE_CHARS).toBeLessThanOrEqual(5000);
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'notes.ts'), 'utf-8').replace(/\r\n/g, '\n');
const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('guardas de las notas', () => {
  it('el usuario sale de la sesion, nunca de un parametro', () => {
    expect(sinComentarios).toContain('auth.user.id');
    expect(sinComentarios).not.toMatch(/\b(userId|user_id)\s*[:,)]\s*(string|unknown)/);
  });

  it('las dos acciones comprueban la sesion', () => {
    const acciones = [...sinComentarios.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(acciones.length).toBeGreaterThanOrEqual(2);
    for (const a of acciones) {
      const cuerpo = sinComentarios.slice(sinComentarios.indexOf(`export async function ${a}`));
      expect(cuerpo.slice(0, 400), `${a} no comprueba la sesion`).toMatch(/requireUser\(\)/);
    }
  });

  it('toda consulta filtra ademas por el usuario de la sesion', () => {
    // La tabla tiene RLS, pero la aplicacion entra con la clave de servicio,
    // que SALTA RLS. Aqui el filtro por usuario no es una red de seguridad
    // secundaria: es la unica.
    const consultas = sinComentarios.match(/\.from\('question_notes'\)[\s\S]*?;/g) ?? [];
    expect(consultas.length).toBeGreaterThanOrEqual(2);
    for (const c of consultas) {
      const filtraPorUsuario = /\.eq\('user_id', auth\.user\.id\)/.test(c);
      const escribeElUsuario = /user_id:\s*auth\.user\.id/.test(c);
      expect(filtraPorUsuario || escribeElUsuario, `consulta sin usuario: ${c.slice(0, 120)}`).toBe(true);
    }
  });

  it('vaciar la nota la BORRA, no guarda una fila en blanco', () => {
    const guardar = sinComentarios.slice(sinComentarios.indexOf('export async function saveQuestionNote'));
    expect(guardar).toMatch(/note === ''/);
    expect(guardar).toMatch(/\.delete\(\)/);
  });

  it('el upsert usa la restriccion unica (usuario, pregunta)', () => {
    // Sin `onConflict` correcto, escribir dos veces la nota de la misma
    // pregunta dejaria dos filas y la pantalla tendria que elegir cual enseña.
    expect(sinComentarios).toMatch(/onConflict:\s*'user_id,question_id'/);
  });
});

/** TEMPORAL — planes de físicas «demo» para Promo 43. Borrar tras usar. */
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: S, Authorization: 'Bearer ' + S, 'Content-Type': 'application/json' };
const rest = (p, o = {}) => fetch(U + '/rest/v1/' + p, { ...o, headers: { ...H, ...(o.headers || {}) } });

const FISICAS = '61101233-afd2-44e5-a147-1d9175500e02'; // Promo 43 · Físicas
const TEORIA = 'cfc0041c-948f-46a8-926b-4742ce667509';  // Promo 43 · Teoría

// El lunes de esta semana (local).
function lunes(offsetSemanas = 0) {
  const d = new Date();
  const dow = d.getDay(); // 0 dom
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offsetSemanas * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dia = (day, type, title, exercises) => ({ day, type, title, exercises });
const ej = (name, sets, reps, target) => ({ name, sets: String(sets), reps: String(reps), target: target || '' });

const SEMANAS = [
  {
    weekStart: lunes(0),
    week_focus: 'Semana 1 · Base — fuerza general y rodaje aeróbico',
    days: [
      dia('Lunes', 'Fuerza', 'Tren superior y core', [
        ej('Dominadas (asistidas si hace falta)', 4, 'máximas', 'Prueba de dominadas'),
        ej('Flexiones', 4, 15, 'Fuerza-resistencia'),
        ej('Remo con goma', 3, 12),
        ej('Plancha', 3, '45 s'),
      ]),
      dia('Martes', 'Carrera', 'Series de velocidad', [
        ej('Calentamiento trote suave', 1, '10 min'),
        ej('Series de 200 m', 6, '200 m', 'Ritmo de 1000 m'),
        ej('Recuperación entre series', 6, '90 s andando'),
        ej('Vuelta a la calma', 1, '8 min'),
      ]),
      dia('Miércoles', 'Descanso', 'Descanso activo', []),
      dia('Jueves', 'Circuito', 'Agilidad + fuerza', [
        ej('Circuito de agilidad (conos)', 5, '1 vuelta', 'Prueba de agilidad'),
        ej('Sentadillas', 4, 15),
        ej('Zancadas', 3, '12 por pierna'),
        ej('Abdominales', 3, 25),
      ]),
      dia('Viernes', 'Aeróbico', 'Rodaje continuo + técnica de nado', [
        ej('Carrera continua suave', 1, '30 min', 'Base aeróbica'),
        ej('Nado 50 m + descanso', 6, '50 m', 'Prueba de natación'),
      ]),
      dia('Sábado', 'Test', 'Simulacro parcial de pruebas', [
        ej('Circuito de agilidad cronometrado', 2, '1 vuelta'),
        ej('Flexiones máximas', 1, 'máximas'),
        ej('1000 m cronometrado', 1, '1000 m'),
      ]),
      dia('Domingo', 'Descanso', 'Descanso total', []),
    ],
  },
  {
    weekStart: lunes(1),
    week_focus: 'Semana 2 · Subimos volumen de carrera',
    days: [
      dia('Lunes', 'Fuerza', 'Tren superior', [
        ej('Dominadas', 4, 'máximas', 'Subir 1 repetición sobre la semana pasada'),
        ej('Flexiones', 4, 18),
        ej('Fondos en banco', 3, 12),
        ej('Plancha lateral', 3, '30 s por lado'),
      ]),
      dia('Martes', 'Carrera', 'Series largas', [
        ej('Calentamiento', 1, '10 min'),
        ej('Series de 400 m', 5, '400 m', 'Ritmo objetivo de 1000 m'),
        ej('Recuperación', 5, '2 min'),
      ]),
      dia('Miércoles', 'Movilidad', 'Movilidad y core', [
        ej('Movilidad de cadera y tobillo', 1, '15 min'),
        ej('Core (rueda, hollow, plancha)', 3, '10-12'),
      ]),
      dia('Jueves', 'Circuito', 'Agilidad', [
        ej('Circuito de agilidad', 6, '1 vuelta', 'Bajar 0,2 s el tiempo'),
        ej('Saltos al cajón', 4, 8),
        ej('Sentadilla con salto', 3, 10),
      ]),
      dia('Viernes', 'Aeróbico', 'Rodaje + nado', [
        ej('Carrera continua', 1, '35 min'),
        ej('Nado técnico', 8, '50 m'),
      ]),
      dia('Sábado', 'Descanso', 'Descanso o paseo suave', []),
      dia('Domingo', 'Descanso', 'Descanso total', []),
    ],
  },
  {
    weekStart: lunes(2),
    week_focus: 'Semana 3 · Ritmo de competición',
    days: [
      dia('Lunes', 'Fuerza', 'Fuerza-potencia', [
        ej('Dominadas explosivas', 5, 5),
        ej('Flexiones con palmada', 4, 8),
        ej('Remo', 4, 10),
      ]),
      dia('Martes', 'Carrera', 'Test de 1000 m', [
        ej('Calentamiento completo', 1, '15 min'),
        ej('1000 m a tope', 1, '1000 m', 'Marca objetivo'),
        ej('Vuelta a la calma', 1, '10 min'),
      ]),
      dia('Miércoles', 'Descanso', 'Descanso', []),
      dia('Jueves', 'Circuito', 'Simulacro de agilidad', [
        ej('Circuito de agilidad oficial', 4, '1 vuelta', 'A ritmo de examen'),
        ej('Core', 3, '12'),
      ]),
      dia('Viernes', 'Aeróbico', 'Rodaje suave + nado', [
        ej('Carrera suave', 1, '25 min'),
        ej('Nado 100 m', 4, '100 m'),
      ]),
      dia('Sábado', 'Test', 'Simulacro completo de las 4 pruebas', [
        ej('Agilidad', 1, '1 vuelta'),
        ej('Flexiones', 1, 'máximas'),
        ej('1000 m', 1, '1000 m'),
        ej('Natación 50 m', 1, '50 m'),
      ]),
      dia('Domingo', 'Descanso', 'Descanso total', []),
    ],
  },
  {
    weekStart: lunes(3),
    week_focus: 'Semana 4 · Descarga antes del examen',
    days: [
      dia('Lunes', 'Fuerza', 'Mantenimiento', [
        ej('Dominadas', 3, 'submáximas'),
        ej('Flexiones', 3, 12),
      ]),
      dia('Martes', 'Carrera', 'Series cortas suaves', [
        ej('Series de 150 m', 4, '150 m', 'Sin forzar'),
      ]),
      dia('Miércoles', 'Descanso', 'Descanso', []),
      dia('Jueves', 'Activación', 'Activación ligera', [
        ej('Movilidad + técnica de agilidad', 1, '20 min'),
      ]),
      dia('Viernes', 'Descanso', 'Descanso', []),
      dia('Sábado', 'Examen', 'Día de pruebas', []),
      dia('Domingo', 'Descanso', 'Descanso', []),
    ],
  },
];

// Upsert de los 4 planes.
const filas = SEMANAS.map((s) => ({
  class_id: FISICAS,
  week_start: s.weekStart,
  plan_data: { week_focus: s.week_focus, days: s.days, source: 'entrenador' },
}));

const r = await rest('group_training_plans?on_conflict=class_id,week_start', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(filas),
});
if (!r.ok) throw new Error('group_training_plans: ' + r.status + ' ' + (await r.text()));
console.log('Planes de físicas:', filas.map((f) => f.week_start).join(', '));

// El alumno de demo, en los dos grupos Promo 43.
const uid = (await rest('profiles?email=eq.alumno@atenea.com&select=id').then((x) => x.json()))[0].id;
for (const cid of [FISICAS, TEORIA]) {
  await rest('class_members?on_conflict=class_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ class_id: cid, user_id: uid }),
  });
}
console.log('alumno@atenea.com añadido a Promo 43 (Teoría y Físicas).');
console.log('\n✅ Listo. La semana vigente es', lunes(0), '— el alumno la ve en Prep. Física.');

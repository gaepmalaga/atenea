import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resumeAlumnos,
  contarPorEstado,
  temasDelAlumno,
  erroresDelAlumno,
  preguntasSospechosas,
  coberturaTemario,
  DIAS_EN_RIESGO,
  DIAS_ABANDONO,
  ESTADO_ALUMNO_LABEL,
  type IntentoAlumno,
} from '../app/lib/academy';

/**
 * P5 · el panel de la academia.
 *
 * Lo que se vigila es la ARITMETICA que ve el profesor, que es donde este
 * repositorio se ha equivocado siempre: numerador y denominador de muestras
 * distintas (regla 8) y el blanco contado como fallo (regla 24). Aqui duele
 * mas que en el panel del alumno, porque con estos numeros se decide a quien
 * se llama por telefono.
 */

const AHORA = Date.parse('2026-08-31T12:00:00.000Z');
const haceDias = (d: number) => new Date(AHORA - d * 24 * 60 * 60 * 1000).toISOString();

/**
 * LOS PERFILES LLEVAN `last_sign_in_at`, Y ESE ES EL ARREGLO.
 *
 * Estos tests daban por buena la version equivocada: el estado salia de
 * `question_attempts`, o sea de haber CONTESTADO PREGUNTAS, y se le llamaba
 * «ha entrado». Un alumno que entra a diario a leer el temario, repasar fichas
 * o preguntarle al chat —pero que aun no ha hecho un test— aparecia como
 * «nunca ha entrado» y ENCABEZABA la lista de a quien llamar.
 *
 * El profesor actua sobre esa lista, asi que el dato falso no era un numero
 * feo: era una llamada de telefono a quien esta estudiando todos los dias.
 *
 * Ahora «viene» sale de la conexion real y «estudia» de las respuestas. Son
 * dos cosas distintas y piden dos llamadas distintas.
 */
const PERFILES = [
  { id: 'ana', email: 'ana@x.com', role: 'student', last_sign_in_at: haceDias(1) },
  { id: 'bea', email: 'bea@x.com', role: 'student', last_sign_in_at: haceDias(10) },
  { id: 'caro', email: 'caro@x.com', role: 'student', last_sign_in_at: haceDias(30) },
  { id: 'dani', email: 'dani@x.com', role: 'student', last_sign_in_at: null },
  // ELENA ENTRA TODOS LOS DIAS Y NO HA HECHO NI UN TEST. Es el caso que el
  // panel clasificaba como «nunca ha entrado», y es justo el contrario.
  { id: 'elena', email: 'elena@x.com', role: 'student', last_sign_in_at: haceDias(0) },
];

describe('quién necesita que le llamen', () => {
  const intentos: IntentoAlumno[] = [
    // Ana entró ayer.
    { user_id: 'ana', created_at: haceDias(1), is_correct: true, selected_index: 0 },
    // Bea lleva diez días: en riesgo.
    { user_id: 'bea', created_at: haceDias(10), is_correct: false, selected_index: 1 },
    // Caro lleva un mes: abandonada.
    { user_id: 'caro', created_at: haceDias(30), is_correct: true, selected_index: 2 },
    // Dani no aparece: nunca entró.
  ];

  const filas = resumeAlumnos(PERFILES, intentos, AHORA);

  it('clasifica por días sin ENTRAR, no por días sin contestar', () => {
    const porId = Object.fromEntries(filas.map((f) => [f.id, f]));
    expect(porId.ana.estado).toBe('activo');
    expect(porId.bea.estado).toBe('en_riesgo');
    expect(porId.caro.estado).toBe('abandonado');
    expect(porId.dani.estado).toBe('nunca_entro');
  });

  it('quien ENTRA todos los días y no hace tests NO es «nunca ha entrado»', () => {
    // ESTE ERA EL FALLO, y el mas caro de los dos: se le llamaba para
    // preguntarle si seguia interesado a alguien que abria la aplicacion cada
    // dia. Ahora sale como activo, y aparte se dice que no esta haciendo
    // tests, que es OTRA conversacion.
    const elena = filas.find((f) => f.id === 'elena')!;
    expect(elena.estado).toBe('activo');
    expect(elena.estudiando).toBe('nunca');
    expect(elena.diasSinEntrar).toBe(0);
    expect(elena.diasSinEstudiar).toBeNull();
  });

  it('quien NO entra hace un mes sigue siendo abandonado aunque contestara ayer', () => {
    // El caso simetrico: no se puede dar por activo a alguien por una fila
    // suelta si lleva un mes sin abrir la aplicacion.
    const soloUno = resumeAlumnos(
      [{ id: 'z', email: 'z@x.com', role: 'student', last_sign_in_at: haceDias(30) }],
      [{ user_id: 'z', created_at: haceDias(1), is_correct: true, selected_index: 0 }],
      AHORA,
    );
    expect(soloUno[0].estado).toBe('abandonado');
    expect(soloUno[0].estudiando).toBe('al_dia');
  });

  it('ordena poniendo delante a quien hay que atender', () => {
    // Una lista ordenada por nombre obliga al profesor a leerla entera para
    // encontrar lo único que iba a hacer con ella.
    // Elena entra hoy, asi que va con los activos aunque no haga tests: no
    // se le llama para preguntarle si sigue interesado, se le llama para otra
    // cosa. Entre ana y elena el orden da igual (mismo estado, 0 dias).
    const ids = filas.map((f) => f.id);
    expect(ids.slice(0, 3)).toEqual(['dani', 'caro', 'bea']);
    expect(ids.slice(3).sort()).toEqual(['ana', 'elena']);
  });

  it('los umbrales son los que se dijeron: una semana y dos', () => {
    expect(DIAS_EN_RIESGO).toBe(7);
    expect(DIAS_ABANDONO).toBe(14);
  });

  it('justo en el umbral ya cuenta', () => {
    const enElBorde = resumeAlumnos(
      [{ id: 'x', last_sign_in_at: haceDias(DIAS_ABANDONO) }],
      [{ user_id: 'x', created_at: haceDias(DIAS_ABANDONO), is_correct: true, selected_index: 0 }],
      AHORA
    );
    expect(enElBorde[0].estado).toBe('abandonado');
  });

  it('quien nunca entró tiene días y acierto a null, no a cero', () => {
    // "Sin datos" y "cero" no son lo mismo, y para un profesor menos aún:
    // 0 % de acierto es un alumno que va mal, null es uno que no ha empezado.
    const dani = filas.find((f) => f.id === 'dani')!;
    expect(dani.diasSinEntrar).toBeNull();
    expect(dani.winRate).toBeNull();
    expect(dani.ultimaActividad).toBeNull();
  });

  it('cuenta cuántos hay en cada estado', () => {
    expect(contarPorEstado(filas)).toEqual({
      nunca_entro: 1,
      abandonado: 1,
      en_riesgo: 1,
      // ana y elena: las dos entraron hoy o ayer.
      activo: 2,
    });
  });

  it('todos los estados tienen nombre para la pantalla', () => {
    for (const f of filas) expect(ESTADO_ALUMNO_LABEL[f.estado]).toBeTruthy();
  });
});

describe('el acierto se calcula sobre las contestadas', () => {
  const intentos: IntentoAlumno[] = [
    { user_id: 'ana', created_at: haceDias(1), is_correct: true, selected_index: 0 },
    { user_id: 'ana', created_at: haceDias(1), is_correct: false, selected_index: 2 },
    // Dos en blanco a propósito: no son fallos.
    { user_id: 'ana', created_at: haceDias(1), is_correct: false, selected_index: -1 },
    { user_id: 'ana', created_at: haceDias(1), is_correct: false, selected_index: -1 },
  ];

  it('un blanco no cuenta como fallo (regla 24)', () => {
    const [ana] = resumeAlumnos([{ id: 'ana' }], intentos, AHORA);
    expect(ana.contestadas).toBe(2);
    expect(ana.blancos).toBe(2);
    // 1 de 2, no 1 de 4: si contara los blancos saldría 25 % y el profesor
    // llamaría a un alumno que va al 50 %.
    expect(ana.winRate).toBe(50);
  });

  it('un alumno que solo dejó blancos SÍ ha entrado', () => {
    // Lo que se mide con la última actividad es si sigue viniendo, y dejar una
    // pregunta en blanco es haber venido.
    const [x] = resumeAlumnos(
      [{ id: 'x', last_sign_in_at: haceDias(2) }],
      [{ user_id: 'x', created_at: haceDias(2), is_correct: false, selected_index: -1 }],
      AHORA
    );
    expect(x.estado).toBe('activo');
    // Dejar una en blanco es haber hecho un test: cuenta como estudiar.
    expect(x.estudiando).toBe('al_dia');
    expect(x.winRate).toBeNull();
  });
});

describe('la ficha del alumno', () => {
  const intentos: IntentoAlumno[] = [
    { topic: 'Constitución', is_correct: true, selected_index: 0 },
    { topic: 'Constitución', is_correct: true, selected_index: 1 },
    { topic: 'Inteligencia', is_correct: false, selected_index: 0, error_type: 'trampa' },
    { topic: 'Inteligencia', is_correct: false, selected_index: 1, error_type: 'trampa' },
    { topic: 'Inteligencia', is_correct: false, selected_index: 2, error_type: 'olvido' },
    { topic: 'Inteligencia', is_correct: false, selected_index: 0 },
    { topic: 'Ley 2/1986', is_correct: false, selected_index: -1 },
  ];

  it('los temas salen del que peor lleva al que mejor', () => {
    const temas = temasDelAlumno(intentos);
    expect(temas.map((t) => t.topic)).toEqual(['Inteligencia', 'Constitución']);
    expect(temas[0].winRate).toBe(0);
    expect(temas[1].winRate).toBe(100);
  });

  it('un tema donde solo dejó blancos no aparece', () => {
    // Pintarlo al 0 % sería mentir: no dice nada de si lo sabe.
    expect(temasDelAlumno(intentos).some((t) => t.topic === 'Ley 2/1986')).toBe(false);
  });

  it('los fallos sin diagnosticar se cuentan aparte, no se reparten', () => {
    const { porTipo, sinClasificar } = erroresDelAlumno(intentos);
    expect(porTipo).toEqual([
      { tipo: 'trampa', veces: 2 },
      { tipo: 'olvido', veces: 1 },
    ]);
    // "No lo sabemos" no es un tipo de error.
    expect(sinClasificar).toBe(1);
  });

  it('un diagnóstico inventado no se cuela como tipo', () => {
    const { porTipo, sinClasificar } = erroresDelAlumno([
      { is_correct: false, selected_index: 0, error_type: 'porque_si' },
    ]);
    expect(porTipo).toEqual([]);
    expect(sinClasificar).toBe(1);
  });
});

describe('preguntas que falla casi todo el mundo', () => {
  const muchas = (id: string, veces: number, aciertos: number): IntentoAlumno[] =>
    Array.from({ length: veces }, (_, i) => ({
      question_id: id,
      is_correct: i < aciertos,
      selected_index: 0,
    }));

  it('las señala cuando hay intentos suficientes', () => {
    const res = preguntasSospechosas([...muchas('mala', 10, 1), ...muchas('normal', 10, 7)]);
    expect(res.map((p) => p.questionId)).toEqual(['mala']);
    expect(res[0].winRate).toBe(10);
  });

  it('una pregunta respondida una vez NO encabeza la lista', () => {
    // Sin el mínimo de intentos, la primera pregunta que alguien falle sale al
    // 0 % y se queda ahí para siempre (regla 8).
    expect(preguntasSospechosas(muchas('nueva', 1, 0))).toEqual([]);
  });

  it('los blancos no cuentan para juzgar la pregunta', () => {
    const conBlancos: IntentoAlumno[] = [
      ...muchas('x', 6, 5),
      ...Array.from({ length: 20 }, () => ({ question_id: 'x', is_correct: false, selected_index: -1 })),
    ];
    // 5 de 6 contestadas: no es sospechosa por muchos blancos que tenga.
    expect(preguntasSospechosas(conBlancos)).toEqual([]);
  });
});

describe('cobertura del temario', () => {
  const temas = [
    { id: 1, title: 'Constitución' },
    { id: 2, title: 'Inteligencia' },
    { id: 3, title: 'Extranjería' },
  ];
  const banco = new Map([
    [1, 40],
    [2, 15],
  ]);
  const intentos: IntentoAlumno[] = [
    { user_id: 'ana', topic: 'Constitución' },
    { user_id: 'bea', topic: 'Constitución' },
    { user_id: 'ana', topic: 'Constitución' },
  ];

  const cobertura = coberturaTemario(temas, banco, intentos);

  it('pone delante los temas sin preguntas', () => {
    // Un tema sin banco no se puede estudiar aunque el alumno quiera.
    expect(cobertura[0].title).toBe('Extranjería');
    expect(cobertura[0].preguntas).toBe(0);
  });

  it('cuenta alumnos DISTINTOS, no respuestas', () => {
    const constitucion = cobertura.find((c) => c.title === 'Constitución')!;
    expect(constitucion.alumnos).toBe(2);
  });

  it('un tema con preguntas que nadie toca se ve', () => {
    const inteligencia = cobertura.find((c) => c.title === 'Inteligencia')!;
    expect(inteligencia.preguntas).toBe(15);
    expect(inteligencia.alumnos).toBe(0);
  });
});

// ============================================================
// GUARDAS
// ============================================================

describe('los grupos los pone la acción, no resumeAlumnos (P7)', () => {
  it('resumeAlumnos deja `grupos` vacío: es un dato de administración', () => {
    const [a] = resumeAlumnos([{ id: 'a' }], [], AHORA);
    expect(a.grupos).toEqual([]);
  });
});

describe('guardas del panel de academia', () => {
  const ACTIONS = join(__dirname, '..', 'app', 'actions');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const academy = stripComments(readFileSync(join(ACTIONS, 'academy.ts'), 'utf-8').replace(/\r\n/g, '\n'));

  it('todo el panel es de administración', () => {
    const acciones = [...academy.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(acciones.length).toBeGreaterThanOrEqual(2);
    for (const a of acciones) {
      const cuerpo = academy.slice(academy.indexOf(`export async function ${a}`));
      expect(cuerpo.slice(0, 400), `${a} no exige admin`).toMatch(/requireAdmin\(\)/);
    }
  });

  it('la aritmética no se escribe otra vez dentro de la acción', () => {
    // Lo que ve el profesor se calcula en `lib/academy.ts`, que es lo que
    // testea este fichero (regla 8: la aritmética que se muestra vive en lib).
    expect(academy).toMatch(/from '\.\.\/lib\/academy'/);
    expect(academy).not.toMatch(/Math\.round\(\(/);
  });

  it('leer las respuestas de OTROS exige la clave de servicio', () => {
    // Un profesor mirando a sus alumnos no está cubierto por ninguna política
    // de propietario: con el cliente de la sesión vería una lista vacía.
    expect(academy).toMatch(/supabaseAdmin/);
    expect(academy).not.toMatch(/createSupabaseServerClient/);
  });
});

// El fichero de acciones tiene que existir para que las guardas signifiquen algo.
describe('el panel existe', () => {
  it('hay una acción de academia', () => {
    expect(readdirSync(join(__dirname, '..', 'app', 'actions'))).toContain('academy.ts');
  });
});

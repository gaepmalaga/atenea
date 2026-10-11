import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  toNumberOrNull,
  normalizeProfileInput,
  normalizeMetrics,
  readMaxPullups,
  hasBiometrics,
  isTestDone,
  TEST_METRIC_FIELD,
  puntosCarrera1000,
  minSegASegundos,
  formatMinSeg,
  buildCoachProfile,
} from '../app/lib/physical';

describe('toNumberOrNull', () => {
  it('convierte lo que devuelve un input de tipo number', () => {
    expect(toNumberOrNull('180')).toBe(180);
    expect(toNumberOrNull('72.5')).toBe(72.5);
    expect(toNumberOrNull(1995)).toBe(1995);
  });

  it('un campo en blanco es "sin dato", no cero', () => {
    // `Number('')` es 0. Ese es exactamente el fallo: el asistente mandaba `''`
    // cuando el alumno dejaba el campo vacio y en la columna aparecia un 0 que
    // parecia una medida real (0 cm de altura, 0 kg de peso).
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('   ')).toBeNull();
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it('el cero escrito a proposito si es un dato', () => {
    expect(toNumberOrNull('0')).toBe(0);
    expect(toNumberOrNull(0)).toBe(0);
  });

  it('descarta lo que no es un numero', () => {
    expect(toNumberOrNull('ochenta')).toBeNull();
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
    expect(toNumberOrNull({})).toBeNull();
  });
});

describe('normalizeProfileInput', () => {
  it('convierte a numero lo que el formulario manda como cadena', () => {
    const out = normalizeProfileInput({
      height: '180',
      weight: '75',
      birth_year: '1995',
      availability: 5,
      gender: 'female',
      equipment: 'calisthenics',
    });
    expect(out).toEqual({
      height: 180,
      weight: 75,
      birth_year: 1995,
      availability: 5,
      gender: 'female',
      equipment: 'calisthenics',
    });
  });

  it('los campos vacios llegan como null, no como 0', () => {
    const out = normalizeProfileInput({ height: '', weight: '75', birth_year: '' });
    expect(out.height).toBeNull();
    expect(out.birth_year).toBeNull();
    expect(out.weight).toBe(75);
  });

  it('no inventa campos que el formulario no ha mandado', () => {
    // Importa: `savePhysicalProfile` solo escribe las claves presentes. Si esto
    // devolviera `weight: null`, guardar solo las metricas borraria el peso.
    const out = normalizeProfileInput({ height: '180' });
    expect(Object.keys(out)).toEqual(['height']);
  });

  it('un genero o un material desconocidos caen en el valor por defecto', () => {
    expect(normalizeProfileInput({ gender: 'otra-cosa' }).gender).toBe('male');
    expect(normalizeProfileInput({ equipment: 'otra-cosa' }).equipment).toBe('gym');
  });

  it('una lesion en blanco es null y no una cadena vacia', () => {
    expect(normalizeProfileInput({ injuries: '  ' }).injuries).toBeNull();
    expect(normalizeProfileInput({ injuries: '  hombro  ' }).injuries).toBe('hombro');
  });

  it('ignora cualquier campo fuera de la lista', () => {
    // La accion tiene su propia lista blanca, pero la normalizacion tampoco
    // deja pasar un `user_id` colado desde el cliente.
    const out = normalizeProfileInput({ height: '180', user_id: 'otro-usuario', is_admin: true });
    expect(out).toEqual({ height: 180 });
  });
});

describe('normalizeMetrics', () => {
  it('convierte las marcas de las pruebas', () => {
    expect(normalizeMetrics({ pullups_score: '12', pullups_method: 'reps' })).toEqual({
      pullups_score: 12,
      pullups_method: 'reps',
    });
    expect(normalizeMetrics({ run_1000_seconds: '215' }).run_1000_seconds).toBe(215);
    expect(normalizeMetrics({ agility_time: '18.4' }).agility_time).toBe(18.4);
  });

  it('un metodo desconocido no se guarda', () => {
    expect(normalizeMetrics({ pullups_method: 'inventado' }).pullups_method).toBeUndefined();
  });

  it('conserva las marcas que ya estaban al guardar una nueva', () => {
    // `handleSaveTest` fusiona lo anterior con lo nuevo; si la normalizacion se
    // comiera las claves ausentes, hacer la carrera borraria las
    // dominadas y el hub volveria a pedirlas.
    const previas = { pullups_score: 12, pullups_method: 'reps' };
    const out = normalizeMetrics({ ...previas, run_1000_seconds: '215' });
    expect(out).toEqual({ pullups_score: 12, pullups_method: 'reps', run_1000_seconds: 215 });
  });
});

describe('readMaxPullups', () => {
  it('lee la ruta que escribe savePhysicalProfile', () => {
    expect(readMaxPullups({ baseline_metrics: { pullups_score: 12 } })).toBe(12);
  });

  it('acepta las rutas antiguas por si hay filas historicas', () => {
    expect(readMaxPullups({ baseline_metrics: { pullups: 9 } })).toBe(9);
    expect(readMaxPullups({ baseline_test: { pullups: 7 } })).toBe(7);
  });

  it('la ruta actual gana a la antigua', () => {
    expect(readMaxPullups({
      baseline_metrics: { pullups_score: 12 },
      baseline_test: { pullups: 3 },
    })).toBe(12);
  });

  it('distingue "sin datos" de "cero dominadas"', () => {
    expect(readMaxPullups({})).toBeNull();
    expect(readMaxPullups(null)).toBeNull();
    expect(readMaxPullups({ baseline_metrics: { pullups_score: 0 } })).toBe(0);
  });
});

describe('hasBiometrics', () => {
  it('decide si el alumno pasa por el asistente', () => {
    expect(hasBiometrics({ height: 180 })).toBe(true);
    expect(hasBiometrics({})).toBe(false);
    expect(hasBiometrics(null)).toBe(false);
  });

  it('una altura guardada como cadena vacia no cuenta como perfil hecho', () => {
    // Filas escritas antes de la fase 2.7 pueden tener `''`. Con `!profile.height`
    // el redirector ya acertaba, pero `Number('')` habria dado 0 y `0 !== null`.
    expect(hasBiometrics({ height: '' as unknown as number })).toBe(false);
  });
});

describe('isTestDone', () => {
  it('cada prueba mira su propio campo', () => {
    expect(isTestDone({ pullups_score: 8 }, 'force')).toBe(true);
    expect(isTestDone({ pullups_score: 8 }, 'carrera')).toBe(false);
    expect(isTestDone({ run_1000_seconds: 215 }, 'carrera')).toBe(true);
    expect(isTestDone({ agility_time: 18 }, 'agility')).toBe(true);
  });

  it('una marca vacia no da la prueba por hecha', () => {
    // El hub comprobaba `!== undefined && !== null`, asi que un `''` guardado
    // desbloqueaba el plan sobre una medida que no existia.
    expect(isTestDone({ run_1000_seconds: '' as unknown as number }, 'carrera')).toBe(false);
    expect(isTestDone(null, 'force')).toBe(false);
    expect(isTestDone({}, 'agility')).toBe(false);
  });

  it('cero es una marca valida', () => {
    expect(isTestDone({ pullups_score: 0 }, 'force')).toBe(true);
  });

  it('TEST_METRIC_FIELD y isTestDone hablan del mismo campo', () => {
    // Un desajuste aqui es el fallo de la regla 3 otra vez: escribir en una
    // clave y leer en otra. El bucle lo ata.
    for (const [testId, field] of Object.entries(TEST_METRIC_FIELD)) {
      const metrics = { [field]: 5 };
      expect(isTestDone(metrics, testId as 'force' | 'carrera' | 'agility')).toBe(true);
    }
  });
});

describe('carrera de 1.000 m (sustituye al Cooper)', () => {
  it('puntúa con la tabla del BOE en los bordes de cada tramo', () => {
    // Hombres: 2:54 o menos = 10; 2:55 a 3:00 = 9; … 3:43 a 3:48 = 1; 3:49 = 0.
    expect(puntosCarrera1000(174, 'male')).toBe(10);
    expect(puntosCarrera1000(175, 'male')).toBe(9);
    expect(puntosCarrera1000(215, 'male')).toBe(3); // 3:35, tramo 3:36 a 3:31
    expect(puntosCarrera1000(228, 'male')).toBe(1);
    expect(puntosCarrera1000(229, 'male')).toBe(0);
    // Mujeres: 3:24 o menos = 10; 4:00 a 3:52 = 6; 4:46 o más = 0.
    expect(puntosCarrera1000(204, 'female')).toBe(10);
    expect(puntosCarrera1000(240, 'female')).toBe(6);
    expect(puntosCarrera1000(285, 'female')).toBe(1);
    expect(puntosCarrera1000(286, 'female')).toBe(0);
  });

  it('sin tiempo o sin sexo es null, no 0 (un 0 elimina)', () => {
    expect(puntosCarrera1000(null, 'male')).toBeNull();
    expect(puntosCarrera1000(215, null)).toBeNull();
  });

  it('minutos y segundos por separado; vacío es null', () => {
    expect(minSegASegundos('3', '35')).toBe(215);
    expect(minSegASegundos('', '')).toBeNull();
    expect(minSegASegundos('3', '75')).toBeNull();
    expect(formatMinSeg(215)).toBe('3:35');
    expect(formatMinSeg(184)).toBe('3:04');
  });

  it('el plan recibe la marca de la carrera, no metros de Cooper', () => {
    const coach = buildCoachProfile({ baseline_metrics: { run_1000_seconds: 215 } });
    expect(coach.marcas?.carrera_1000m_segundos).toBe(215);
    expect(JSON.stringify(coach)).not.toMatch(/cooper/i);
  });

  it('nada en la app vuelve a llamar «oficial» al Cooper', () => {
    const dir = join(__dirname, '..', 'app/components/student/modules/training/components');
    for (const f of readdirSync(dir)) {
      expect(readFileSync(join(dir, f), 'utf-8'), f).not.toMatch(/cooper/i);
    }
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/** Un comentario que CITA el patron peligroso no es codigo peligroso. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const training = stripComments(read('app/actions/training.ts'));
const wizard = stripComments(read('app/components/student/modules/training/components/SetupWizard.tsx'));
const runner = stripComments(read('app/components/student/modules/training/components/TestRunner.tsx'));
const trainer = stripComments(read('app/components/student/modules/training/PhysicalTrainer.tsx'));

describe('el perfil fisico se normaliza en el servidor', () => {
  it('savePhysicalProfile pasa por normalizeProfileInput y normalizeMetrics', () => {
    // Una Server Action es un endpoint publico: normalizar solo en el
    // formulario no basta, porque se puede llamar sin pasar por el.
    const cuerpo = training.slice(training.indexOf('export async function savePhysicalProfile'));
    expect(cuerpo).toContain('normalizeProfileInput');
    expect(cuerpo).toContain('normalizeMetrics');
  });

  it('el upsert sigue yendo por lista blanca y nunca expande el objeto del cliente', () => {
    expect(training).toContain('PHYSICAL_FIELDS');
    expect(training).not.toMatch(/upsert\(\s*\{\s*user_id[^}]*\.\.\./);
  });
});

describe('ninguna pantalla del entrenador convierte con Number()', () => {
  it('el asistente manda el perfil ya normalizado', () => {
    // `Number('')` es 0: por ahi se colaban alturas y pesos de cero.
    expect(wizard).toContain('normalizeProfileInput(formData)');
    expect(wizard).not.toMatch(/Number\(/);
  });

  it('el test manda la marca con toNumberOrNull, no con Number()', () => {
    expect(runner).toContain('toNumberOrNull(result)');
    // `Number(val) < 0` en el onChange es el unico uso legitimo que queda: filtra
    // un signo negativo tecleado, no construye el valor que se guarda.
    expect(runner).not.toMatch(/onSave\([^)]*Number\(/);
  });
});

describe('el entrenador comprueba lo que devuelve el servidor', () => {
  it('no avanza de pantalla sin mirar el resultado del guardado', () => {
    // El fallo original: `await savePhysicalProfile(data); setView('hub');`.
    // La pantalla avanzaba aunque la escritura hubiera fallado.
    // El resultado tiene que ir a parar a algun sitio: una llamada suelta es,
    // por definicion, una llamada cuyo error nadie mira.
    expect(trainer).toMatch(/=\s*await savePhysicalProfile\(/);
    expect(trainer).not.toMatch(/(^|[^=]\s)await savePhysicalProfile\(/m);
    expect(trainer).toContain('res.success');
    expect(trainer).toContain('setSaveError');
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODULE_IDS,
  MODULE_LABEL,
  MODULE_DESCRIPCION,
  isModuleId,
  todosActivos,
  toModuleSettings,
  modulosActivos,
  moduloDeEntrada,
} from '../app/lib/modules';
import {
  TRAINING_SWITCH_IDS,
  TRAINING_SWITCH_ROW,
  TRAINING_SWITCH_LABEL,
  TRAINING_SWITCH_DESC,
  todosLosSwitches,
  toTrainingSwitches,
} from '../app/lib/training-switches';

/**
 * P4 · encender y apagar modulos.
 *
 * La decision del dueño fue "que se pueda apagar cualquiera", asi que los ocho
 * tienen interruptor. Lo que se vigila aqui son las dos cosas que pueden salir
 * caras:
 *
 * 1. Que "sin fila" signifique ACTIVO. Es lo que hace que crear la tabla no
 *    apague nada, que un modulo nuevo aparezca encendido, y que un fallo de
 *    lectura no se parezca a un apagado deliberado.
 * 2. Que apagar un modulo lo apague TAMBIEN en el servidor. Esconder el enlace
 *    del menu no impide que nadie llame a la Server Action, y las de IA se
 *    pagan por llamada.
 */

describe('el catalogo de modulos', () => {
  it('son los ocho del menu del alumno', () => {
    expect(MODULE_IDS).toEqual(['home', 'chat', 'test', 'review', 'cards', 'training', 'interview', 'stats']);
  });

  it('todos tienen etiqueta y explicacion', () => {
    // Un interruptor sin explicacion es un interruptor que se pulsa a ciegas.
    for (const id of MODULE_IDS) {
      expect(MODULE_LABEL[id], id).toBeTruthy();
      expect(MODULE_DESCRIPCION[id], id).toBeTruthy();
    }
  });

  it('isModuleId rechaza cualquier otra cosa', () => {
    expect(isModuleId('chat')).toBe(true);
    expect(isModuleId('inventado')).toBe(false);
    expect(isModuleId(null)).toBe(false);
    expect(isModuleId(3)).toBe(false);
  });
});

describe('de las filas al estado', () => {
  it('SIN FILA significa activo', () => {
    // Es lo que permite que ejecutar el guion de la tabla no apague nada.
    const s = toModuleSettings([]);
    expect(modulosActivos(s)).toEqual([...MODULE_IDS]);
  });

  it('solo apaga lo que viene explicitamente a false', () => {
    const s = toModuleSettings([
      { module_id: 'chat', enabled: false },
      { module_id: 'test', enabled: true },
    ]);
    expect(s.chat).toBe(false);
    expect(s.test).toBe(true);
    expect(s.review).toBe(true);
  });

  it('una fila de un modulo que ya no existe se ignora', () => {
    // El dia que se retire un modulo, su fila se queda ahi sin molestar.
    const s = toModuleSettings([{ module_id: 'modulo_retirado', enabled: false }]);
    expect(modulosActivos(s)).toEqual([...MODULE_IDS]);
  });

  it('la basura no apaga nada', () => {
    const s = toModuleSettings([
      { module_id: null, enabled: false },
      { module_id: 'chat', enabled: 'no' },
      {},
    ]);
    expect(s.chat).toBe(true);
  });
});

describe('por donde entra el alumno', () => {
  it('normalmente por el centro de mando', () => {
    expect(moduloDeEntrada(todosActivos())).toBe('home');
  });

  it('si el de inicio esta apagado, por el primero que quede', () => {
    const s = toModuleSettings([
      { module_id: 'home', enabled: false },
      { module_id: 'chat', enabled: false },
    ]);
    expect(moduloDeEntrada(s)).toBe('test');
  });

  it('con todo apagado devuelve null, no un modulo cualquiera', () => {
    // Es un estado posible —se pueden apagar los ocho— y la pantalla tiene que
    // poder decirlo en vez de quedarse en blanco (regla 8: "sin datos" y "cero"
    // no son lo mismo).
    const s = toModuleSettings(MODULE_IDS.map((id) => ({ module_id: id, enabled: false })));
    expect(moduloDeEntrada(s)).toBeNull();
    expect(modulosActivos(s)).toEqual([]);
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const ACTIONS = join(__dirname, '..', 'app', 'actions');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const fuentes = Object.fromEntries(
  readdirSync(ACTIONS)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [f, stripComments(readFileSync(join(ACTIONS, f), 'utf-8').replace(/\r\n/g, '\n'))])
);

/** Trozo de codigo de una accion, desde su firma. */
function cuerpoDe(fichero: string, accion: string): string {
  const src = fuentes[fichero] ?? '';
  const i = src.indexOf(`export async function ${accion}`);
  return i === -1 ? '' : src.slice(i, i + 1200);
}

describe('apagar un modulo lo apaga tambien en el servidor', () => {
  // Una Server Action es un endpoint HTTP publico: esconder el enlace del menu
  // no impide que nadie la llame, y estas cuestan dinero por llamada.
  const debenComprobarModulo: Array<[fichero: string, accion: string, modulo: string]> = [
    ['chat.ts', 'askAtenea', 'chat'],
    ['exams.ts', 'generateAndSaveCandidate', 'test'],
    ['exams.ts', 'getQuestionsFromBank', 'test'],
    ['exams.ts', 'getAdaptiveSession', 'test'],
    ['user.ts', 'getFailedQuestions', 'review'],
    ['flashcards.ts', 'generateFlashcard', 'cards'],
    ['training.ts', 'generateWeeklyPlan', 'training'],
    ['interview.ts', 'processInterviewTurn', 'interview'],
  ];

  for (const [fichero, accion, modulo] of debenComprobarModulo) {
    it(`${accion} se cierra si '${modulo}' esta apagado`, () => {
      const cuerpo = cuerpoDe(fichero, accion);
      expect(cuerpo, `no se encuentra ${accion} en ${fichero}`).not.toBe('');
      expect(cuerpo).toContain(`requireModule('${modulo}')`);
    });
  }

  it('la comprobacion va ANTES de gastar la cuota de IA', () => {
    // El orden importa: comprobar el modulo despues de llamar al modelo seria
    // pagar la llamada de un modulo apagado.
    for (const [fichero, accion] of debenComprobarModulo) {
      const cuerpo = cuerpoDe(fichero, accion);
      const modulo = cuerpo.indexOf('requireModule(');
      const cuota = cuerpo.indexOf('checkQuota(');
      if (cuota === -1) continue; // no todas gastan cuota
      expect(modulo, `${accion}: requireModule va despues de checkQuota`).toBeLessThan(cuota);
    }
  });

  it('la guarda NO vive en un fichero de Server Actions', () => {
    // Un fichero `use server` convierte en endpoint publico todo lo que
    // exporta: `requireModule` ahi seria una accion mas, sin sesion propia.
    // Mismo motivo por el que la aritmetica de cuotas vive en lib/.
    expect(fuentes['modules.ts']).toBeDefined();
    expect(fuentes['modules.ts']).not.toMatch(/export async function requireModule/);
  });

  it('las dos acciones de modulos comprueban la sesion, y escribir es de admin', () => {
    expect(cuerpoDe('modules.ts', 'getModuleSettings')).toMatch(/requireUser\(\)/);
    expect(cuerpoDe('modules.ts', 'setModuleEnabled')).toMatch(/requireAdmin\(\)/);
  });
});

// ============================================================
// INTERRUPTORES DE PREPARACION FISICA (feedback tras P8)
// ============================================================

describe('los interruptores de entrenamiento', () => {
  it('son tres: IA de físicas, plan de grupo, y entrenamiento adaptativo (P10)', () => {
    expect(TRAINING_SWITCH_IDS).toEqual(['ai', 'group', 'adaptive']);
    for (const id of TRAINING_SWITCH_IDS) {
      expect(TRAINING_SWITCH_LABEL[id], id).toBeTruthy();
      expect(TRAINING_SWITCH_DESC[id], id).toBeTruthy();
    }
  });

  it('se guardan en module_settings con module_id de texto libre (sin SQL)', () => {
    expect(TRAINING_SWITCH_ROW).toEqual({ ai: 'training_ai', group: 'training_group', adaptive: 'training_adaptive' });
  });

  it('SIN FILA = ENCENDIDO, igual que P4', () => {
    expect(toTrainingSwitches([])).toEqual(todosLosSwitches());
    expect(todosLosSwitches()).toEqual({ ai: true, group: true, adaptive: true });
  });

  it('solo apaga lo que viene explicitamente a false, y por su module_id largo', () => {
    const s = toTrainingSwitches([
      { module_id: 'training_ai', enabled: false },
      { module_id: 'training_group', enabled: true },
      { module_id: 'training_adaptive', enabled: false },
      { module_id: 'chat', enabled: false }, // de otro sistema: se ignora
    ]);
    expect(s).toEqual({ ai: false, group: true, adaptive: false });
  });

  it('la basura no apaga nada', () => {
    expect(toTrainingSwitches([{ module_id: null }, { module_id: 'ai', enabled: false }, {}]))
      .toEqual({ ai: true, group: true, adaptive: true });
  });
});

describe('apagar un interruptor de fisicas lo apaga en el servidor', () => {
  it('generateWeeklyPlan y generateNextWeek cortan si la IA esta apagada, ANTES de la cuota', () => {
    for (const accion of ['generateWeeklyPlan', 'generateNextWeek']) {
      const cuerpo = cuerpoDe('training.ts', accion);
      expect(cuerpo, accion).toContain("requireTrainingSwitch('ai')");
      const sw = cuerpo.indexOf('requireTrainingSwitch(');
      const cuota = cuerpo.indexOf('checkQuota(');
      expect(sw, `${accion}: el interruptor va despues de checkQuota`).toBeGreaterThan(-1);
      expect(sw).toBeLessThan(cuota);
    }
  });

  it('saveGroupTrainingPlan corta si el plan de grupo esta apagado', () => {
    expect(cuerpoDe('groups.ts', 'saveGroupTrainingPlan')).toContain("requireTrainingSwitch('group')");
  });

  it('getActiveTrainingPlan no hereda el plan de grupo si esta apagado', () => {
    const cuerpo = fuentes['training.ts'].slice(
      fuentes['training.ts'].indexOf('export async function getActiveTrainingPlan'),
      fuentes['training.ts'].indexOf('export async function completeTrainingDay'),
    );
    expect(cuerpo).toMatch(/switches\.group/);
  });

  it('el lector NO es una Server Action (mismo motivo que requireModule)', () => {
    expect(fuentes['modules.ts']).not.toMatch(/export async function leeTrainingSwitches/);
    expect(fuentes['modules.ts']).not.toMatch(/export async function requireTrainingSwitch/);
  });
});

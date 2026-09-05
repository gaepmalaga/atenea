import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardas estaticas sobre las Server Actions.
 *
 * Una Server Action de Next.js es un endpoint HTTP publico. El fallo original
 * del proyecto era que todas recibian el `userId` como argumento y se lo creian.
 * Estos tests leen el codigo fuente y fallan si el patron vuelve a aparecer, sin
 * necesidad de levantar Supabase.
 */

const ACTIONS_DIR = join(__dirname, '..', 'app', 'actions');

/**
 * Quita comentarios antes de analizar. Sin esto, un comentario que CITA el
 * patron peligroso para explicarlo cuenta como si fuera codigo.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'core.ts')
  // Se normaliza CRLF: en Windows los cortes por salto de linea de los tests
  // de mas abajo no encajarian con lo que hay en disco.
  .map((f) => ({
    name: f,
    src: stripComments(readFileSync(join(ACTIONS_DIR, f), 'utf-8').replace(/\r\n/g, '\n')),
  }));

/** Extrae `nombre(params)` de cada `export async function`. */
function exportedActions(src: string) {
  const out: { name: string; params: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\)\s*(?::[\s\S]*?)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Cuerpo aproximado: desde la llave hasta 900 caracteres despues. Suficiente
    // para comprobar que la guarda esta al principio de la funcion.
    out.push({ name: m[1], params: m[2], body: src.slice(m.index, m.index + 900) });
  }
  return out;
}

const allActions = files.flatMap((f) =>
  exportedActions(f.src).map((a) => ({ ...a, file: f.name }))
);

describe('superficie de las Server Actions', () => {
  it('encuentra las acciones exportadas', () => {
    expect(allActions.length).toBeGreaterThan(25);
  });

  it('ninguna acepta un identificador de usuario como parametro', () => {
    // Este es EL fallo original: `getUserStats(userId)` devolvia los datos de
    // quien fuera. El id debe salir siempre de la cookie de sesion.
    const culpables = allActions
      .filter((a) => /\b(userId|adminId|user_id)\s*[:,)]/.test(a.params))
      .map((a) => `${a.file}: ${a.name}(${a.params.trim()})`);

    expect(culpables).toEqual([]);
  });

  it('todas comprueban la sesion antes de tocar nada', () => {
    const sinGuarda = allActions
      .filter((a) => !/require(User|Admin)\(\)/.test(a.body))
      .map((a) => `${a.file}: ${a.name}`);

    expect(sinGuarda).toEqual([]);
  });

  it('las acciones de administracion exigen rol de admin', () => {
    const debenSerAdmin = [
      'getOfficialSyllabus',
      'deleteDocument',
      'uploadTopicPDF',
      'deleteTopic',
      'getAdminUsersList',
      'getGlobalActivity',
      'getAdminQuestionBank',
      'getModerationQueue',
      'approveQuestion',
      'disableQuestion',
      'resolveReport',
      'updateQuestion',
      'seedQuestionBank',
      // P2: escriben directamente en el banco de los alumnos.
      'createManualQuestion',
      'importManualQuestions',
      // P6: el gasto de IA es dato de administración (ai_usage sin políticas).
      'getAiCostOverview',
      // P6: control de acceso y pagos. Todo lo lleva el administrador.
      'getMembershipOverview',
      'getMemberPayments',
      'setMembershipRequired',
      'setMemberAccess',
      'setMemberPaymentStatus',
      'recordPayment',
      'deletePayment',
      'activateAllCurrentStudents',
      // P7: grupos y planes de entrenamiento de grupo.
      'getGroups',
      'createGroup',
      'updateGroup',
      'deleteGroup',
      'setGroupMembers',
      'getGroupTrainingPlan',
      'saveGroupTrainingPlan',
      'deleteGroupTrainingPlan',
    ];

    const flojas = debenSerAdmin.filter((name) => {
      const action = allActions.find((a) => a.name === name);
      return !action || !/requireAdmin\(\)/.test(action.body);
    });

    expect(flojas).toEqual([]);
  });
});

describe('escritura de perfiles', () => {
  it('no se expande el objeto del cliente sobre una fila', () => {
    // `upsert({ user_id: userId, ...formData })` dejaba que un `user_id` dentro
    // de formData sobrescribiera el del servidor: escritura en la fila de otro.
    const peligrosos: string[] = [];
    for (const f of files) {
      const re = /upsert\(\s*\{[^}]*\.\.\.\s*(formData|data)\b/g;
      if (re.test(f.src)) peligrosos.push(f.name);
    }
    expect(peligrosos).toEqual([]);
  });
});

describe('uso de la clave de servicio', () => {
  it('core.ts es el unico sitio que construye el cliente admin', () => {
    // supabaseAdmin salta RLS. Debe crearse en un solo punto y no replicarse.
    const otros = files.filter((f) => /createClient\(\s*SB_URL/.test(f.src)).map((f) => f.name);
    expect(otros).toEqual([]);
  });
});

/**
 * Ninguna Server Action acepta `any`.
 *
 * No es cosmetica de lint: el desajuste de nombres que dejo `response_time_ms`
 * y `option_changes` a 0 en TODOS los examenes durante meses (fase 2.3) pudo
 * pasar precisamente porque el parametro era `any[]`. Los dos lados compilaban
 * tan tranquilos escribiendo campos distintos.
 */
describe('la frontera cliente-servidor esta tipada', () => {
  it('ninguna accion exportada declara un parametro `any`', () => {
    const culpables: string[] = [];
    for (const { name, src } of files) {
      // `: any` o `: any[]` en la lista de parametros de una funcion exportada.
      const re = /export async function (\w+)\s*\(([^)]*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (/:\s*any\b/.test(m[2])) culpables.push(`${name}: ${m[1]}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('editar una pregunta pasa por la misma validacion que la salida del modelo', () => {
    // Un `correct_index` fuera de rango metido a mano por un admin tiene el
    // mismo efecto que uno inventado por la IA: el alumno estudia un dato
    // falso. Antes `updateQuestion` recibia `any` y escribia lo que llegara.
    const moderation = files.find((f) => f.name === 'moderation.ts')!.src;
    const fn = moderation.slice(moderation.indexOf('export async function updateQuestion'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}\n') + 3);

    expect(cuerpo).toContain('validateGeneratedQuestion');
    // Y se escriben los valores ya normalizados, no los de entrada.
    expect(cuerpo).toContain('check.value.correctIndex');
    expect(cuerpo).not.toMatch(/correct_index:\s*data\./);
  });
});

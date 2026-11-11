import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fallo, MENSAJE_FALLO, yaRegistrado, olvidaFallos, detalleDeFallo } from '../app/lib/fallos';
import { corrigeFila, BLANK_INDEX } from '../app/lib/exam-results';
import { toModuleSettings, moduleRowId } from '../app/lib/modules';
import { mensajeDeAuth } from '../app/lib/auth-messages';
import { MIN_CLAVE, tieneClaveProvisional, problemaDeClave, META_CLAVE_PROVISIONAL } from '../app/lib/clave';

/**
 * AFIANZAR ANTES DEL PILOTO (reglas 108 a 113).
 *
 * Lo que salió de la revisión del 11 nov 2026, antes de meter alumnos de
 * verdad. Cada bloque vigila una cosa que estaba mal y que no se ve en
 * pantalla si vuelve.
 */

const RAIZ = join(__dirname, '..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => stripComments(readFileSync(join(RAIZ, ruta), 'utf-8').replace(/\r\n/g, '\n'));

const ACCIONES = readdirSync(join(RAIZ, 'app', 'actions'))
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'core.ts')
  .map((f) => ({ nombre: f, src: lee(join('app', 'actions', f)) }));

describe('regla 108 · lo que dice la base de datos no viaja al navegador', () => {
  beforeEach(() => olvidaFallos());

  it('`fallo` devuelve el mensaje corto, nunca el de Postgres', () => {
    const dicho = fallo('prueba', { message: 'column "x" of relation "question_attempts" does not exist', code: '42703' });
    expect(dicho).toBe(MENSAJE_FALLO);
    expect(dicho).not.toContain('question_attempts');
  });

  it('sin error devuelve `undefined`: sirve donde ponía `error?.message`', () => {
    expect(fallo('prueba', null)).toBeUndefined();
    expect(fallo('prueba', undefined)).toBeUndefined();
  });

  it('el detalle que se guarda lleva el mensaje y el código, recortado', () => {
    expect(detalleDeFallo({ message: 'boom', code: '23505' })).toEqual({ mensaje: 'boom', codigo: '23505' });
    expect(detalleDeFallo({ message: 'x'.repeat(2000) }).mensaje).toHaveLength(500);
    expect(detalleDeFallo(new Error('roto'))).toEqual({ mensaje: 'roto', codigo: null });
  });

  it('el mismo fallo repetido se guarda una vez por minuto', () => {
    expect(yaRegistrado('a|b', 1_000)).toBe(false);
    expect(yaRegistrado('a|b', 30_000)).toBe(true);
    expect(yaRegistrado('a|b', 61_001)).toBe(false);
    expect(yaRegistrado('otro|b', 30_000)).toBe(false);
  });

  it('ninguna acción devuelve `error: algo.message`', () => {
    // Las dos excepciones son mensajes de Supabase Auth que solo ve un admin y
    // que le dicen algo que puede arreglar («ese correo ya tiene cuenta»).
    const PERMITIDAS = [/invite\.error\?\.message/];
    const culpables: string[] = [];
    for (const { nombre, src } of ACCIONES) {
      for (const linea of src.split('\n')) {
        if (!/\berror: [\w.]+\??\.message\b/.test(linea)) continue;
        if (PERMITIDAS.some((p) => p.test(linea))) continue;
        culpables.push(`${nombre}: ${linea.trim().slice(0, 120)}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('la paginación tampoco: su error acaba en el navegador', () => {
    expect(lee('app/lib/pagination.ts')).toContain("fallo('paginaCompleta', error)");
  });

  it('«Logs» separa los fallos de lo que alguien hizo', () => {
    const audit = lee('app/actions/audit.ts');
    expect(audit).toContain(".neq('action', 'error')");
    expect(audit).toContain(".eq('action', 'error')");
    expect(lee('app/components/Admin/components/AdminActivity.tsx')).toContain('getFallosRecientes');
  });
});

describe('regla 109 · un interruptor de módulo es de UNA academia', () => {
  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';

  it('lo que apaga una academia no apaga a otra', () => {
    const filas = [{ module_id: moduleRowId('test', A), enabled: false }];
    expect(toModuleSettings(filas, A).test).toBe(false);
    expect(toModuleSettings(filas, B).test).toBe(true);
    expect(toModuleSettings(filas, null).test).toBe(true);
  });

  it('la fila de la plataforma vale para todas, y la academia puede decir lo contrario', () => {
    const filas = [
      { module_id: 'chat', enabled: false },
      { module_id: moduleRowId('chat', A), enabled: true },
    ];
    expect(toModuleSettings(filas, A).chat).toBe(true);
    expect(toModuleSettings(filas, B).chat).toBe(false);
  });

  it('las filas de los interruptores de física no se confunden con módulos', () => {
    const filas = [{ module_id: `training_ai:${A}`, enabled: false }];
    expect(toModuleSettings(filas, A).training).toBe(true);
  });

  it('el admin escribe la fila de su academia, no la de todas', () => {
    const modules = lee('app/actions/modules.ts');
    expect(modules).toContain('moduleRowId(d.moduleId, organizationId)');
    expect(modules).toContain('leeModuleSettings(auth.user.organizationId)');
  });

  it('no queda ninguna lectura de `class_members` sin acotar', () => {
    const sueltas: string[] = [];
    for (const { nombre, src } of ACCIONES) {
      const trozos = src.split(".from('class_members')").slice(1);
      for (const t of trozos) {
        const consulta = t.slice(0, t.search(/\)\s*[,;)]\s*\n|;\n/) + 1 || 400);
        if (!/\.select\(/.test(consulta)) continue;
        if (!/\.eq\(|\.in\(/.test(consulta)) sueltas.push(`${nombre}: ${consulta.slice(0, 90)}`);
      }
    }
    expect(sueltas).toEqual([]);
  });

  it('las dos acciones que leían todas las academias ya no existen', () => {
    const admin = lee('app/actions/admin.ts');
    expect(admin).not.toContain('getAdminUsersList');
    expect(admin).not.toContain('getGlobalActivity');
  });
});

describe('regla 110 · el acierto lo decide el servidor', () => {
  const banco = new Map([['p1', 2]]);
  const fila = (selected_index: number | null, is_correct: boolean, question_id: string | null = 'p1') =>
    ({ question_id, selected_index, is_correct });

  it('quien falla y dice que acierta, falla', () => {
    expect(corrigeFila(fila(0, true), banco).is_correct).toBe(false);
  });

  it('quien acierta, acierta aunque el cliente diga otra cosa', () => {
    expect(corrigeFila(fila(2, false), banco).is_correct).toBe(true);
  });

  it('un blanco, una respuesta sin índice o una pregunta que no está en el banco no son aciertos', () => {
    expect(corrigeFila(fila(BLANK_INDEX, true), banco).is_correct).toBe(false);
    expect(corrigeFila(fila(null, true), banco).is_correct).toBe(false);
    expect(corrigeFila(fila(2, true, null), banco).is_correct).toBe(false);
    expect(corrigeFila(fila(2, true, 'no-existe'), banco).is_correct).toBe(false);
  });

  it('no toca nada más de la fila', () => {
    const entera = { ...fila(2, false), topic: 'Tema 1', error_type: null };
    expect(corrigeFila(entera, banco)).toEqual({ ...entera, is_correct: true });
  });

  it('los dos caminos de guardado corrigen antes de escribir', () => {
    const exams = lee('app/actions/exams.ts');
    for (const accion of ['saveTestResult', 'saveExamResults']) {
      const desde = exams.indexOf(`export async function ${accion}`);
      const cuerpo = exams.slice(desde, exams.indexOf('\nexport async function', desde + 10) === -1 ? undefined : exams.indexOf('\nexport async function', desde + 10));
      expect(cuerpo, accion).toContain('corrigeFila(');
      expect(cuerpo.indexOf('corrigeFila('), accion).toBeLessThan(cuerpo.indexOf('.insert('));
    }
  });

  it('el guion del disparador existe y cubre insertar y actualizar', () => {
    const sql = readFileSync(join(RAIZ, 'docs/sql/acierto-lo-decide-el-servidor.sql'), 'utf-8');
    expect(sql).toMatch(/before insert or update on public\.question_attempts/);
    expect(sql).toMatch(/revoke all on function public\.corrige_respuesta\(\)/);
  });
});

describe('regla 111 · la contraseña provisional se cambia al entrar', () => {
  it('un solo mínimo, de 8', () => {
    expect(MIN_CLAVE).toBe(8);
    expect(problemaDeClave('abc1234', 'abc1234')).toContain('8');
    expect(problemaDeClave('abcd1234', 'abcd1235')).toBe('Las dos contraseñas no coinciden.');
    expect(problemaDeClave('abcd1234', 'abcd1234')).toBeNull();
  });

  it('nadie vuelve a escribir «6 caracteres» en una pantalla', () => {
    for (const f of ['app/components/auth/LoginScreen.tsx', 'app/components/auth/SetPasswordScreen.tsx', 'app/components/student/CambiarClave.tsx', 'app/lib/auth-messages.ts']) {
      expect(lee(f), f).not.toMatch(/6 caracteres|length < 6|MIN_CLAVE = /);
    }
  });

  it('repetir la provisional se explica en castellano', () => {
    expect(mensajeDeAuth(new Error('New password should be different from the old password.')))
      .toBe('Esa es la contraseña que ya tenías. Pon una distinta.');
  });

  it('la marca solo vale si es `true`', () => {
    expect(tieneClaveProvisional({ [META_CLAVE_PROVISIONAL]: true })).toBe(true);
    expect(tieneClaveProvisional({ [META_CLAVE_PROVISIONAL]: false })).toBe(false);
    expect(tieneClaveProvisional({ [META_CLAVE_PROVISIONAL]: 'true' })).toBe(false);
    expect(tieneClaveProvisional({})).toBe(false);
    expect(tieneClaveProvisional(null)).toBe(false);
  });

  it('el alta en bloque marca la cuenta, y la aplicación no deja pasar con la marca', () => {
    expect(lee('app/actions/membership.ts')).toContain('[META_CLAVE_PROVISIONAL]: true');
    expect(lee('app/lib/auth.ts')).toContain('debeCambiarClave: tieneClaveProvisional(data.user.user_metadata)');
    const shell = lee('app/components/AppShell.tsx');
    expect(shell).toContain('needsPassword || user?.debeCambiarClave');
    expect(shell).toContain('[META_CLAVE_PROVISIONAL]: false');
    // La pantalla de clave va ANTES que cualquiera de los dos paneles.
    expect(shell.indexOf('user?.debeCambiarClave')).toBeLessThan(shell.indexOf('<StudentDashboard'));
  });
});

describe('regla 112 · cabeceras de seguridad', () => {
  const config = lee('next.config.ts');

  it('la aplicación no se puede meter en un marco', () => {
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("{ key: 'X-Frame-Options', value: 'DENY' }");
  });

  it('hay política de contenido, y se aplica a todas las rutas', () => {
    expect(config).toContain("{ key: 'Content-Security-Policy', value: CSP }");
    expect(config).toContain("source: '/:path*'");
    expect(config).toContain("object-src 'none'");
  });

  it('`unsafe-eval` solo en desarrollo', () => {
    expect(config).toMatch(/enDesarrollo \? " 'unsafe-eval'" : ''/);
  });
});

describe('regla 113 · el alumno no descarga el panel de administración', () => {
  const shell = lee('app/components/AppShell.tsx');

  it('los dos paneles se cargan cuando se sabe quién ha entrado', () => {
    expect(shell).not.toMatch(/^import \w+ from '\.\/Admin\/AdminView'/m);
    expect(shell).not.toMatch(/^import \w+ from '\.\/student\/StudentDashboard'/m);
    expect(shell).toContain("lazy(() => import('./Admin/AdminView'))");
    expect(shell).toContain("lazy(() => import('./student/StudentDashboard'))");
  });

  it('los módulos fuera del MVP no van en el trozo del alumno', () => {
    const panel = lee('app/components/student/StudentDashboard.tsx');
    for (const m of ['chat/IntelChat', 'profile/BiodataManager', 'interview/InterviewRoom']) {
      expect(panel, m).not.toMatch(new RegExp(`^import \\w+ from './modules/${m}'`, 'm'));
      expect(panel, m).toContain(`lazy(() => import('./modules/${m}'))`);
    }
  });
});

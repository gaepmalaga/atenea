/**
 * DAR DE ALTA A VARIOS ALUMNOS DE GOLPE (regla 83).
 *
 * Alphapol tiene unos 100 alumnos. Invitarlos de uno en uno no es realista, y
 * mandarles a todos un correo de invitación TAMPOCO funciona: Supabase solo deja
 * enviar 30 correos por hora (`rate_limit_email_sent`, comprobado en el
 * proyecto real el 6 nov 2026) y el plan gratuito de Resend 100 al día. El
 * correo 31 fallaría.
 *
 * Así que hay dos modos:
 *
 *   · `clave` (el principal): la cuenta se crea YA confirmada con una
 *     contraseña provisional, sin mandar ningún correo y por tanto sin límite.
 *     La academia descarga la lista (correo + contraseña) y se la da a cada
 *     alumno en clase; el alumno la cambia en «Mi perfil».
 *   · `correo`: la invitación de siempre por correo, como mucho
 *     `MAX_POR_CORREO` cada vez para no chocar con el límite por hora.
 *
 * Quien ya tiene cuenta no recibe nada nuevo: se le da acceso y los grupos.
 *
 * Módulo PURO (regla 21): leer la lista pegada, generar contraseñas y armar el
 * CSV. Las altas las hace `altaMasivaAlumnos` (`actions/membership.ts`).
 */

export const MAX_POR_CLAVE = 200;
export const MAX_POR_CORREO = 25;

export type ModoAlta = 'clave' | 'correo';

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export type ListaLeida = {
  /** Correos válidos, en minúsculas, sin repetir, en el orden en que aparecen. */
  correos: string[];
  /** Líneas con algo escrito pero ningún correo: se enseñan, no se pierden (regla 27). */
  sinCorreo: { linea: number; texto: string }[];
  repetidos: number;
};

/**
 * Lee lo que se pega: un correo por línea, varios separados por comas o punto y
 * coma, o filas enteras copiadas de Excel («Ana Ruiz;ana@x.com;Promo 43») — se
 * coge todo lo que tenga forma de correo. Ninguna línea desaparece en silencio:
 * la que no trae correo sale con su número para que se vea (regla 27).
 */
export function leeCorreos(texto: string): ListaLeida {
  const correos: string[] = [];
  const vistos = new Set<string>();
  const sinCorreo: { linea: number; texto: string }[] = [];
  let repetidos = 0;

  (texto ?? '').split(/\r?\n/).forEach((linea, i) => {
    const limpia = linea.trim();
    if (!limpia) return;
    const encontrados = limpia.match(CORREO) ?? [];
    if (!encontrados.length) {
      sinCorreo.push({ linea: i + 1, texto: limpia.slice(0, 80) });
      return;
    }
    for (const c of encontrados) {
      const correo = c.toLowerCase().replace(/\.+$/, '');
      if (vistos.has(correo)) { repetidos++; continue; }
      vistos.add(correo);
      correos.push(correo);
    }
  });

  return { correos, sinCorreo, repetidos };
}

/**
 * Sin letras que se confundan al dictarlas o copiarlas a mano (0/O, 1/l/I):
 * la contraseña la va a teclear un alumno leyéndola de un papel.
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Una contraseña provisional legible: `Alpha-xxxx-xxxx`, 8 caracteres al azar
 * de 55 posibles (~46 bits). Es provisional y se cambia al entrar.
 *
 * `bytes` lo pone quien llama (en el servidor, `crypto.randomBytes`): así esto
 * sigue siendo puro y se puede probar.
 */
export function claveProvisional(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error('Hacen falta 8 bytes aleatorios.');
  const c = Array.from(bytes.slice(0, 8), (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `Alpha-${c.slice(0, 4)}-${c.slice(4)}`;
}

export type ResultadoAlta = {
  correo: string;
  estado: 'creada' | 'invitada' | 'ya_tenia_cuenta' | 'error';
  /** Solo en `creada`: la contraseña provisional. No se guarda en ningún sitio más. */
  clave?: string;
  error?: string;
};

export const ESTADO_ALTA: Record<ResultadoAlta['estado'], string> = {
  creada: 'Cuenta creada',
  invitada: 'Invitación enviada',
  ya_tenia_cuenta: 'Ya tenía cuenta: acceso dado',
  error: 'No se pudo',
};

/**
 * El CSV para imprimir o repartir. Con punto y coma y BOM, que es como lo
 * abre bien Excel en español (regla 27, al revés: aquí se ESCRIBE para Excel).
 */
export function csvDeAltas(resultados: ResultadoAlta[], urlEntrada: string): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = [
    ['correo', 'contraseña provisional', 'estado', 'dónde entrar'],
    ...resultados.map((r) => [r.correo, r.clave ?? '', r.error ? `${ESTADO_ALTA[r.estado]}: ${r.error}` : ESTADO_ALTA[r.estado], urlEntrada]),
  ];
  return '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n');
}

import { describe, it, expect } from 'vitest';
import {
  plantillaSolicitudAdmin,
  plantillaAccesoConcedido,
  plantillaAccesoRechazado,
} from '../app/lib/app-email-templates';
import { MARCA } from '../app/lib/marca';

/**
 * LOS CORREOS QUE MANDA LA APP (P12), NO SUPABASE AUTH.
 *
 * Módulo puro: solo se comprueba que el HTML lleva lo que tiene que llevar
 * (el correo del alumno, el nombre de la academia, el enlace) — mandarlo de
 * verdad es cosa de `mailer.ts`, que no se testea aquí (regla 21).
 */

describe('plantillaSolicitudAdmin', () => {
  it('lleva el correo del alumno, la academia y el enlace al panel', () => {
    const { subject, html } = plantillaSolicitudAdmin({
      alumnoEmail: 'nuevo@x.com',
      academiaName: 'Alphapol',
      panelUrl: 'https://atenea-eight.vercel.app/alphapol',
    });
    expect(subject).toContain('Alphapol');
    expect(html).toContain('nuevo@x.com');
    expect(html).toContain('Alphapol');
    expect(html).toContain('https://atenea-eight.vercel.app/alphapol');
  });
});

describe('plantillaAccesoConcedido', () => {
  it('lleva el nombre de la academia y el enlace de entrada', () => {
    const { subject, html } = plantillaAccesoConcedido({ academiaName: 'Alphapol', appUrl: 'https://x.test' });
    expect(subject).toContain('Alphapol');
    expect(html).toContain('https://x.test');
  });
});

describe('plantillaAccesoRechazado', () => {
  it('no promete un enlace de entrada — no tiene acceso', () => {
    const { subject, html } = plantillaAccesoRechazado({ academiaName: 'Alphapol' });
    expect(subject).toContain('Alphapol');
    expect(html).not.toContain('href="https://'); // sin botón de "entrar"
  });
});

describe('la marca de los correos (regla 81)', () => {
  it('llevan el nombre de la academia en la cabecera y ni rastro de Atenea', () => {
    for (const { html } of [
      plantillaSolicitudAdmin({ alumnoEmail: 'a@x.com', academiaName: 'Alphapol', panelUrl: 'https://x.test' }),
      plantillaAccesoConcedido({ academiaName: 'Alphapol', appUrl: 'https://x.test' }),
      plantillaAccesoRechazado({ academiaName: 'Alphapol' }),
    ]) {
      expect(html).toContain(MARCA.nombre);
      expect(html).toContain(MARCA.colores.marino);
      expect(html).not.toMatch(/atenea/i);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  BIBLIOTECA_EJERCICIOS,
  kindDeEjercicio,
  estaEnBiblioteca,
  camposDeKind,
  resumeDia,
  KIND_LABEL,
} from '../app/lib/exercise-library';

describe('biblioteca de ejercicios del plan del preparador', () => {
  it('las tres pruebas del CNP están y con el tipo correcto', () => {
    expect(kindDeEjercicio('Circuito de agilidad')).toBe('circuito');
    expect(kindDeEjercicio('Dominadas')).toBe('fuerza');
    expect(kindDeEjercicio('Carrera de 1000 m')).toBe('carrera');
  });

  it('el nombre se busca sin importar tildes ni mayúsculas ni espacios', () => {
    expect(kindDeEjercicio('  DOMINADAS  ')).toBe('fuerza');
    expect(kindDeEjercicio('course-navette (léger)')).toBe('carrera');
    expect(kindDeEjercicio('Course-Navette (Leger)')).toBe('carrera');
  });

  it('un ejercicio de texto libre cae en «fuerza» (los campos por defecto)', () => {
    expect(kindDeEjercicio('Saltos al cajón pliométricos')).toBe('fuerza');
    expect(estaEnBiblioteca('Saltos al cajón pliométricos')).toBe(false);
    expect(estaEnBiblioteca('Flexiones')).toBe(true);
  });

  it('deduce el tipo por palabras cuando el nombre es libre', () => {
    expect(kindDeEjercicio('1000 m cronometrado')).toBe('carrera');
    expect(kindDeEjercicio('Series de 400 metros en pista')).toBe('carrera');
    expect(kindDeEjercicio('Circuito militar con obstáculos')).toBe('circuito');
    expect(kindDeEjercicio('Calentamiento articular general')).toBe('general');
  });

  it('los campos de una fila cambian con el tipo', () => {
    expect(camposDeKind('fuerza').campo1?.label).toBe('series');
    expect(camposDeKind('carrera').campo2?.label).toBe('distancia / tiempo');
    expect(camposDeKind('circuito').campo1?.label).toBe('vueltas');
    // «general» (calentamiento, movilidad) solo tiene duración
    expect(camposDeKind('general').campo1).toBeNull();
    expect(camposDeKind('general').campo3).toBeNull();
    expect(camposDeKind('general').campo2?.label).toBe('duración');
  });

  it('cada tipo tiene etiqueta y cada ejercicio de la lista un grupo', () => {
    for (const e of BIBLIOTECA_EJERCICIOS) {
      expect(KIND_LABEL[e.kind]).toBeTruthy();
      expect(e.grupo).toBeTruthy();
      expect(e.nombre.trim()).toBe(e.nombre);
    }
  });

  it('no hay nombres repetidos en la biblioteca', () => {
    const nombres = BIBLIOTECA_EJERCICIOS.map((e) => e.nombre.toLowerCase());
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('resumeDia distingue descanso, vacío y con ejercicios (regla 8: sin datos ≠ 0)', () => {
    expect(resumeDia(0, false)).toBe('Descanso');
    expect(resumeDia(0, true)).toBe('Sin ejercicios');
    expect(resumeDia(1, true)).toBe('1 ejercicio');
    expect(resumeDia(3, true)).toBe('3 ejercicios');
  });
});

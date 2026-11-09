'use client';

import { useState } from 'react';
import { Interruptor } from '../../../../ui';
import CalendarioFisica from './CalendarioFisica';
import MisMarcas from './MisMarcas';
import MultiSemana from './MultiSemana';

/**
 * LA FÍSICA DE QUIEN TIENE PREPARADOR (reglas 57 y 86): su calendario de
 * sesiones y sus marcas en las pruebas oficiales. Nada de lo que rodea al plan
 * generado por IA.
 */
export default function FisicaAlumno() {
  const [vista, setVista] = useState<'calendario' | 'marcas'>('calendario');
  return (
    <div className="space-y-4">
      <MultiSemana />
      <div className="max-w-3xl mx-auto">
        <Interruptor
          etiqueta="Qué ver"
          valor={vista}
          onChange={setVista}
          opciones={[{ valor: 'calendario', etiqueta: 'Calendario' }, { valor: 'marcas', etiqueta: 'Mis marcas' }]}
        />
      </div>
      {vista === 'calendario' ? <CalendarioFisica /> : <MisMarcas />}
    </div>
  );
}

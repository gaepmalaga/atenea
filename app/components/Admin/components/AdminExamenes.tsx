'use client';

import { useCallback, useState } from 'react';
import { PanelTitulo, Pestanas } from '../../ui';
import Preparar from './examenes/Preparar';
import Guardados from './examenes/Guardados';
import EnClase from './examenes/EnClase';

type Seccion = 'preparar' | 'guardados' | 'clase';

/**
 * EXÁMENES EN PAPEL (regla 115 y 118).
 *
 * Tres pasos en tres pestañas: PREPARAR un examen del banco con sus filtros,
 * GUARDARLO (para reimprimirlo y ponerlo a un turno) y seguir cómo va EN CLASE:
 * quién ha entregado, las notas y qué preguntas se han fallado más.
 */
export default function AdminExamenes() {
  const [seccion, setSeccion] = useState<Seccion>('preparar');
  const [abrir, setAbrir] = useState<string | null>(null);
  const abierto = useCallback(() => setAbrir(null), []);

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Exámenes en papel"
        sub="Prepara un simulacro con la forma del examen de verdad, ponlo a un turno y lleva la nota de cada alumno."
      />
      <Pestanas<Seccion>
        etiqueta="Exámenes en papel"
        activa={seccion}
        onCambia={setSeccion}
        items={[
          { id: 'preparar', etiqueta: 'Preparar' },
          { id: 'guardados', etiqueta: 'Guardados' },
          { id: 'clase', etiqueta: 'En clase' },
        ]}
      />
      {seccion === 'preparar' && <Preparar onGuardado={() => setSeccion('guardados')} />}
      {seccion === 'guardados' && <Guardados onAplicado={(id) => { setAbrir(id); setSeccion('clase'); }} />}
      {seccion === 'clase' && <EnClase abrirId={abrir} onAbierto={abierto} />}
    </div>
  );
}

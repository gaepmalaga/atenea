'use client';

import { useCallback, useState } from 'react';
import { PanelTitulo, Pestanas, Filtros, FiltroChip } from '../../ui';
import Preparar from './examenes/Preparar';
import Guardados from './examenes/Guardados';
import EnClase from './examenes/EnClase';
import PrepararPsico from './examenes/PrepararPsico';
import GuardadosPsico from './examenes/GuardadosPsico';
import PsicoClase from './examenes/PsicoClase';

type Seccion = 'preparar' | 'guardados' | 'clase';
type Tipo = 'teoria' | 'psico';

/**
 * EXÁMENES EN PAPEL (regla 115, 118 y 127).
 *
 * Primero se elige QUÉ examen: teoría (preguntas del banco) o psicotécnicos. Y
 * el proceso es el mismo para los dos, en tres pestañas: PREPARAR con sus
 * filtros (temas y dificultad, o tipos de pregunta), GUARDARLO (para reimprimirlo
 * y ponerlo a un turno) y seguir cómo va EN CLASE: quién ha entregado, las notas
 * y dónde se falla más.
 */
export default function AdminExamenes() {
  const [tipo, setTipo] = useState<Tipo>('teoria');
  const [seccion, setSeccion] = useState<Seccion>('preparar');
  const [abrir, setAbrir] = useState<string | null>(null);
  const abierto = useCallback(() => setAbrir(null), []);
  const cambiaTipo = (t: Tipo) => { setTipo(t); setAbrir(null); };

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Exámenes en papel"
        sub="Prepara un examen con la forma del de verdad, ponlo a un turno y lleva la nota de cada alumno."
      />
      <Filtros etiqueta="Qué examen">
        <FiltroChip activo={tipo === 'teoria'} onClick={() => cambiaTipo('teoria')}>Teoría</FiltroChip>
        <FiltroChip activo={tipo === 'psico'} onClick={() => cambiaTipo('psico')}>Psicotécnicos</FiltroChip>
      </Filtros>
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
      {tipo === 'teoria' && (
        <>
          {seccion === 'preparar' && <Preparar onGuardado={() => setSeccion('guardados')} />}
          {seccion === 'guardados' && <Guardados onAplicado={(id) => { setAbrir(id); setSeccion('clase'); }} />}
          {seccion === 'clase' && <EnClase abrirId={abrir} onAbierto={abierto} />}
        </>
      )}
      {tipo === 'psico' && (
        <>
          {seccion === 'preparar' && <PrepararPsico onGuardado={() => setSeccion('guardados')} />}
          {seccion === 'guardados' && <GuardadosPsico onAplicado={(id) => { setAbrir(id); setSeccion('clase'); }} />}
          {seccion === 'clase' && <PsicoClase abrirId={abrir} onAbierto={abierto} />}
        </>
      )}
    </div>
  );
}

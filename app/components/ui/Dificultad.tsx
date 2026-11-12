import { Etiqueta } from './panel/Etiqueta';
import { etiquetaDificultad } from '@/app/lib/questions';

/**
 * «Fácil», «Media» o «Difícil», con el color de su significado.
 *
 * No pinta nada si el nivel no se conoce: ni un «Media» inventado ni un hueco.
 * Va SOLO en la corrección, nunca en la pregunta sin contestar: enseñarla antes
 * sesgaría la respuesta (una «difícil» se contesta con más miedo).
 */
export default function Dificultad({ nivel, className }: { nivel: unknown; className?: string }) {
  const texto = etiquetaDificultad(nivel);
  if (!texto) return null;
  return (
    <Etiqueta tono={nivel === 1 ? 'ok' : nivel === 3 ? 'malo' : 'aviso'} className={className}>
      {texto}
    </Etiqueta>
  );
}

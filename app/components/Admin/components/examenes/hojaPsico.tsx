import type { ReactNode } from 'react';
import type { PreguntaPsico, OpcionPsico } from '@/app/lib/psico';
import { TIPO_PSICO_LABEL } from '@/app/lib/psico';
import FiguraPsico, {
  FichaDomino, RejillaPsico, SimboloPsico, CubosPsico, DesarrolloPsico, AgujerosPsico, FiguraGiro,
} from '@/app/components/student/modules/psico/FiguraPsico';

/**
 * LA HOJA DEL EXAMEN DE PSICOTÉCNICOS, PARA IMPRIMIR (regla 127).
 *
 * Se pinta con los MISMOS dibujos que la pantalla del alumno (SVG por código),
 * a una ventana propia sin Tailwind: por eso todo el estilo va en una hoja de
 * estilos propia y los tamaños de las figuras, en clases `w-*` de abajo. Tres
 * partes: las preguntas, la hoja de respuestas del alumno y el solucionario
 * (solo para el profesor, en su propia página).
 */

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

const ESTILOS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: #000; margin: 0; line-height: 1.35; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 14px 0 6px; }
  .meta { color: #333; margin: 0 0 8px; }
  .caja { border: 1px solid #000; padding: 6px 8px; margin: 8px 0 12px; }
  .q { break-inside: avoid; border-bottom: 1px solid #bbb; padding: 7px 0 8px; display: grid; grid-template-columns: 22px 1fr; gap: 0 4px; }
  .n { font-weight: 700; }
  .q p { margin: 0 0 4px; }
  .lineas { font-family: 'Courier New', monospace; font-size: 12px; margin: 3px 0 5px; white-space: pre-wrap; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px 20px; align-items: center; margin-top: 4px; }
  .opt { display: inline-flex; align-items: center; gap: 5px; }
  .opt b { min-width: 14px; }
  .fig { margin: 4px 0; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: flex-end; }
  .fig figure { margin: 0; text-align: center; }
  .w-celda svg { width: 60px; height: 40px; } .w-matriz { display: grid; grid-template-columns: repeat(3, 62px); gap: 3px; margin: 4px 0; }
  .w-matriz div { border: 1px solid #000; }
  .w-fichas svg { width: 30px; height: 56px; } .w-ficha-o svg { width: 26px; height: 48px; }
  .w-rejilla svg { width: 52px; height: 52px; } .w-rejilla-g svg { width: 70px; height: 70px; }
  .w-simbolo svg { width: 22px; height: 22px; } .w-fila { display: inline-flex; gap: 3px; }
  .w-cubos svg { height: 96px; width: auto; }
  .w-des svg { width: 170px; height: auto; }
  .w-agu svg { width: 66px; height: 66px; }
  .w-giro svg { width: 76px; height: 76px; } .w-giro-g svg { width: 92px; height: 92px; }
  table { border-collapse: collapse; margin: 4px 0; } td, th { border: 1px solid #000; padding: 2px 8px; text-align: left; }
  td.num, th.num { text-align: right; }
  .ley { display: grid; grid-template-columns: repeat(5, 76px); }
  .ley div { border: 1px solid #000; text-align: center; padding: 3px 1px; font-size: 10px; }
  .ley svg { width: 22px; height: 22px; display: block; margin: 0 auto 2px; }
  .pag { break-before: page; }
  .hoja { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 28px; }
  .hoja div { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #999; }
  .burbuja { display: inline-block; width: 14px; height: 14px; border: 1.2px solid #000; border-radius: 50%; text-align: center; font-size: 8.5px; line-height: 12px; margin-right: 3px; }
  .sol { margin: 0 0 3px; }
  svg { color: #000; }
`;

function Opcion({ o, k }: { o: OpcionPsico; k: number }) {
  let cuerpo: ReactNode;
  if (o.celda) cuerpo = <span className="w-celda"><FiguraPsico celda={o.celda} /></span>;
  else if (o.ficha) cuerpo = <span className="w-ficha-o"><FichaDomino ficha={o.ficha} /></span>;
  else if (o.rejilla) cuerpo = <span className="w-rejilla"><RejillaPsico rejilla={o.rejilla} /></span>;
  else if (o.fila) cuerpo = <span className="w-fila w-simbolo">{o.fila.map((id, i) => <SimboloPsico key={i} id={id} />)}</span>;
  else if (o.agujeros) cuerpo = <span className="w-agu"><AgujerosPsico agujeros={o.agujeros} /></span>;
  else if (o.figura) cuerpo = <span className="w-giro"><FiguraGiro figura={o.figura} /></span>;
  else cuerpo = <span>{o.texto}</span>;
  return <span className="opt"><b>{LETRAS[k]})</b>{cuerpo}</span>;
}

function Pregunta({ q, i }: { q: PreguntaPsico; i: number }) {
  const numerica = !!q.tabla && q.tabla.filas.every((f) => f.slice(1).every((c) => /^-?\d+$|^X$/.test(c)));
  return (
    <div className="q">
      <span className="n">{i + 1}.</span>
      <div>
        <p>{q.enunciado}</p>
        {q.lineas && <div className="lineas">{q.lineas.map((l, k) => `${q.lineas!.length > 1 && q.tipo === 'atencion' ? `${k + 1}.  ` : ''}${l}`).join('\n')}</div>}
        {q.matriz && <div className="w-matriz">{q.matriz.map((c, k) => <div key={k} className="w-celda"><FiguraPsico celda={c} /></div>)}</div>}
        {q.fichas && <div className="fig">{q.fichas.map((f, k) => <span key={k} className="w-fichas"><FichaDomino ficha={f} /></span>)}</div>}
        {q.rejilla && <div className="fig"><span className="w-rejilla-g"><RejillaPsico rejilla={q.rejilla} /></span></div>}
        {q.cubos && <div className="fig">{q.cubos.map((f, k) => <figure key={k} className="w-cubos"><CubosPsico alturas={f} />{q.cubos!.length > 1 && <figcaption>{'ABC'[k]}</figcaption>}</figure>)}</div>}
        {q.desarrollo && <div className="fig"><span className="w-des"><DesarrolloPsico desarrollo={q.desarrollo} /></span></div>}
        {q.figura && <div className="fig"><span className="w-giro-g"><FiguraGiro figura={q.figura} /></span></div>}
        {q.leyenda && <div className="ley">{q.leyenda.map((x) => <div key={x.nombre}><SimboloPsico id={x.simbolo} />{x.nombre}</div>)}</div>}
        {q.tabla && (
          <table>
            {q.tabla.cabecera.some(Boolean) && <thead><tr>{q.tabla.cabecera.map((c, k) => <th key={k} className={k > 0 && numerica ? 'num' : ''}>{c}</th>)}</tr></thead>}
            <tbody>{q.tabla.filas.map((f, r) => <tr key={r}>{f.map((c, k) => <td key={k} className={k > 0 && numerica ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
          </table>
        )}
        <div className="opts">{q.opciones.map((o, k) => <Opcion key={k} o={o} k={k} />)}</div>
      </div>
    </div>
  );
}

export function HojaExamenPsico({ titulo, fecha, minutos, preguntas }: { titulo: string; fecha: string; minutos: number; preguntas: PreguntaPsico[] }) {
  const dia = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const opciones = [...new Set(preguntas.map((q) => q.opciones.length))];
  return (
    <>
      <h1>{titulo}</h1>
      <p className="meta">{dia} · {preguntas.length} preguntas · {minutos} minutos</p>
      <div className="caja">
        Cada pregunta tiene {opciones.length === 1 ? opciones[0] : `${Math.min(...opciones)} o ${Math.max(...opciones)}`} alternativas y solo UNA es correcta. Los errores penalizan; las preguntas en blanco no restan.
        Marca las respuestas en la hoja de respuestas de la última página (o apúntalas y pásalas luego a la plataforma). Apellidos y nombre: ______________________________
      </div>
      {preguntas.map((q, i) => <Pregunta key={i} q={q} i={i} />)}

      <div className="pag">
        <h1>Hoja de respuestas</h1>
        <p className="meta">{titulo} · Apellidos y nombre: ______________________________</p>
        <div className="hoja">
          {preguntas.map((q, i) => (
            <div key={i}><b style={{ minWidth: 24 }}>{i + 1}</b>{q.opciones.map((_, k) => <span key={k}><span className="burbuja">{LETRAS[k]}</span></span>)}</div>
          ))}
        </div>
      </div>

      <div className="pag">
        <h1>Solucionario (solo profesor)</h1>
        <p className="meta">{titulo}</p>
        <div className="hoja">
          {preguntas.map((q, i) => <div key={i}><b style={{ minWidth: 24 }}>{i + 1}</b><span>{LETRAS[q.correcta]} · {TIPO_PSICO_LABEL[q.tipo]}</span></div>)}
        </div>
        <h2>Explicaciones</h2>
        {preguntas.map((q, i) => <p key={i} className="sol"><b>{i + 1}.</b> {q.explicacion}</p>)}
      </div>
    </>
  );
}

/** Abre una ventana con la hoja y lanza la impresión. Devuelve `false` si el navegador bloquea la ventana. */
export async function imprimeHojaPsico(datos: { titulo: string; fecha: string; minutos: number; preguntas: PreguntaPsico[] }): Promise<boolean> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const cuerpo = renderToStaticMarkup(<HojaExamenPsico {...datos} />);
  const ventana = window.open('', '_blank');
  if (!ventana) return false;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  ventana.document.open();
  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(datos.titulo)}</title><style>${ESTILOS}</style></head><body>${cuerpo}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  ventana.document.close();
  return true;
}

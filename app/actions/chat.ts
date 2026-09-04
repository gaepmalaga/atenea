'use server';

import { supabaseAdmin as supabase, chatModel, embeddingModel } from './core';
import { requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { checkQuota } from '../lib/rate-limit';
import { registraGasto } from '../lib/ai-usage';
import {
  buildRetrievalQuery,
  citaDe,
  formatHistory,
  articuloPedido,
  esPreguntaDeEstructura,
  resumeIndice,
  formatIndice,
  numeroDeArticulo,
  documentosQueCaben,
  resumeEstructura,
  pidePartesInternas,
  buildChatPrompt,
  FUENTE_INDICE,
  MAX_QUERY_CHARS,
  type ChatTurn,
  type IndiceDocumento,
} from '../lib/chat';

/**
 * Tipado para los fragmentos recuperados de la base de datos
 */
type Chunk = {
  id?: string;
  filename: string;
  content_chunk: string;
  similarity?: number;
  /**
   * De que articulo sale el fragmento: «Artículo 37», «Disposición adicional
   * primera»… `null` en un documento que no es un texto legal, y `undefined`
   * mientras `match_document_chunks` no devuelva la columna
   * (docs/sql/P1g-referencia-en-la-busqueda.sql). Por eso se lee siempre con
   * `citaDe` y nunca directamente.
   */
  reference?: string | null;
};

type AskAteneaResult =
  | { success: true; answer: string; sources: Chunk[] }
  | { success: false; error: string };

/** Fila de `document_chunks` con el nombre de su documento resuelto por join. */
type FilaConDocumento = {
  content_chunk: string | null;
  reference: string | null;
  documents: { filename: string | null } | null;
};

/**
 * Tope de referencias que se leen de una vez.
 *
 * Son cadenas cortas («Artículo 82»), así que caben de sobra: hoy el temario
 * entero son 449. El tope está para que el día que haya cuarenta documentos
 * esto no se convierta en una consulta enorme.
 */
const MAX_REFERENCIAS_INDICE = 5000;

/**
 * Cuantas fuentes se le enseñan al modelo.
 *
 * Con un documento entero delante, las demas son de apoyo: llegan el indice, el
 * articulo exacto, el documento y unos cuantos fragmentos de otros temas.
 */
const MAX_FUENTES = 8;

/**
 * El artículo que el alumno ha nombrado, traído POR SU REFERENCIA.
 *
 * Depender de que el embedding acierte con un número es jugársela: «artículo
 * 27» y «artículo 127» se parecen mucho más de lo que se parecen sus textos.
 * Si hay coincidencia exacta entra la primera en el contexto; si no la hay no
 * pasa nada, porque la búsqueda semántica sigue corriendo igual.
 */
async function buscaArticulo(numero: number): Promise<Chunk[]> {
  // Va en dos pasos, y no con un `ilike`, porque el temario no numera igual en
  // todas partes: la Constitución escribe "Artículo 27" y la LOFCS "Artículo
  // veintisiete". Un `ilike '%27%'` no encuentra el segundo y además arrastra
  // el 127 y el 271. Comparar el NÚMERO YA LEÍDO acierta en los dos casos.
  //
  // El primer paso trae solo referencias —cadenas de dos palabras—, así que es
  // barato: el temario entero son 449 filas.
  const { data: refs, error } = await supabase
    .from('document_chunks')
    .select('id, reference')
    .not('reference', 'is', null)
    .limit(MAX_REFERENCIAS_INDICE);

  if (error) {
    console.error('buscaArticulo:', error.message);
    return [];
  }

  const ids = ((refs as unknown as { id: number; reference: string | null }[]) ?? [])
    .filter((f) => numeroDeArticulo(f.reference) === numero)
    .map((f) => f.id)
    // Un artículo largo se parte en varios fragmentos. Tres es de sobra para
    // responder y no desplaza a la búsqueda semántica del contexto.
    .slice(0, 3);

  if (!ids.length) return [];

  const { data, error: errorFragmentos } = await supabase
    .from('document_chunks')
    .select('content_chunk, reference, documents!inner(filename)')
    .in('id', ids);

  if (errorFragmentos) {
    console.error('buscaArticulo (fragmentos):', errorFragmentos.message);
    return [];
  }

  return ((data as unknown as FilaConDocumento[]) ?? [])
    .filter((f) => f.content_chunk)
    .map((f) => ({
      filename: f.documents?.filename ?? '',
      content_chunk: f.content_chunk as string,
      reference: f.reference,
      // Al tope, para que quede delante al ordenar por relevancia: una
      // coincidencia exacta de referencia gana a cualquier parecido.
      similarity: 1,
    }));
}

/**
 * El recuento de lo indexado, como una fuente más.
 *
 * POR QUE EXISTE: «¿cuántos artículos tiene la Constitución?» no la contesta
 * ningún fragmento, porque el texto de la norma no se cuenta a sí mismo. El
 * buscador devolvía los artículos de reforma y el modelo respondía, con razón,
 * "no consta en el temario oficial aportado". El dato sí está en la
 * plataforma —desde P1b cada fragmento sabe de qué artículo viene—, solo que
 * nadie se lo daba al modelo.
 */
async function construyeIndice(conEstructura: boolean): Promise<Chunk | null> {
  // `full_text` solo se trae cuando la pregunta va de títulos o capítulos: son
  // ~120 KB por documento, frente a las cadenas de dos palabras de las
  // referencias. Para contar artículos no hace falta y no se pide.
  const columnasDoc = conEstructura
    ? 'id, filename, full_text, subject:subjects(title)'
    : 'id, filename, subject:subjects(title)';

  const [docsRes, refsRes] = await Promise.all([
    supabase.from('documents').select(columnasDoc),
    supabase.from('document_chunks').select('document_id, reference').limit(MAX_REFERENCIAS_INDICE),
  ]);

  if (docsRes.error || refsRes.error) {
    console.error('construyeIndice:', docsRes.error?.message ?? refsRes.error?.message);
    return null;
  }

  type FilaDoc = {
    id: string;
    filename: string | null;
    full_text?: string | null;
    subject: { title: string | null } | null;
  };
  type FilaRef = { document_id: string; reference: string | null };

  const porDocumento = new Map<string, (string | null)[]>();
  for (const r of ((refsRes.data as unknown as FilaRef[]) ?? [])) {
    const lista = porDocumento.get(r.document_id) ?? [];
    lista.push(r.reference);
    porDocumento.set(r.document_id, lista);
  }

  const docs: IndiceDocumento[] = ((docsRes.data as unknown as FilaDoc[]) ?? []).map((d) => {
    // PostgREST tipa el embebido como array cuando no puede probar que la
    // relación es de uno: se normaliza aquí (mismo caso que en getFailedQuestions).
    const subject = Array.isArray(d.subject) ? d.subject[0] : d.subject;
    return {
      tema: subject?.title ?? null,
      filename: d.filename ?? '',
      ...resumeIndice(porDocumento.get(d.id) ?? []),
      // Los títulos y capítulos no salen del índice de fragmentos —ahí solo
      // está el artículo— sino de los encabezados del texto guardado.
      estructura: conEstructura ? resumeEstructura(d.full_text ?? '') : null,
    };
  });

  const texto = formatIndice(docs);
  if (!texto) return null;

  return { filename: FUENTE_INDICE, content_chunk: texto, reference: null, similarity: 1 };
}


// AQUI VIVIA `documentosEnteros`: elegia hasta DOS documentos por parecido y
// los mandaba enteros cuando el alumno no habia escogido tema.
//
// Se ha quitado con el cambio de `askAtenea`: sin tema se responde con los
// fragmentos de la busqueda, y el documento entero se reserva para cuando el
// alumno elige. No se deja comentada ni con un interruptor: el codigo muerto
// de este repo —la tabla `flashcard_bank` que nadie usaba, las clases
// `.vip-card` de `globals.css`— siempre ha costado mas de lo que ahorro.
// Esta en git si vuelve a hacer falta.

/**
 * Evita enviar información redundante al modelo de IA
 */
function dedupeChunks(chunks: Chunk[]) {
  const seen = new Set<string>();
  const out: Chunk[] = [];
  for (const c of chunks) {
    const key = `${c.filename}::${c.content_chunk.substring(0, 50)}`; // Llave basada en contenido parcial
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Los documentos de un tema, enteros.
 *
 * Cuando el alumno ELIGE tema no hay nada que adivinar, y eso es lo que hace
 * que esto siga en pie con 85 temas: el problema nunca fue cuanto ocupa el
 * temario —el entero son 72.355 tokens de 1.048.576— sino acertar cual hace
 * falta. Con tres documentos ya se fallaba.
 */
async function documentosDelTema(subjectId: number): Promise<Chunk[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, full_text')
    .eq('subject_id', subjectId);

  if (error) {
    console.error('documentosDelTema:', error.message);
    return [];
  }

  type FilaDocumento = { id: string; filename: string | null; full_text: string | null };
  const docs = (data as unknown as FilaDocumento[]) ?? [];

  const cabe = new Set(
    documentosQueCaben(docs.map((d) => ({ id: d.id, chars: (d.full_text ?? '').length })))
  );

  return docs
    .filter((d) => cabe.has(d.id))
    .map((d) => ({
      filename: d.filename ?? '',
      content_chunk: d.full_text ?? '',
      reference: null,
      similarity: 1,
    }));
}

export async function askAtenea(
  query: string,
  history: ChatTurn[] = [],
  /**
   * Tema elegido por el alumno, si ha elegido alguno. `null` = todo el temario,
   * y entonces se busca como siempre.
   */
  subjectId: number | null = null
): Promise<AskAteneaResult> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };

  // Si la academia ha apagado Inteligencia, se corta AQUI: antes del
  // embedding y antes del modelo. Esconder el enlace del menu no impide que
  // nadie llame a esta accion, y cada mensaje son dos llamadas de pago (P4).
  const modulo = await requireModule('chat');
  if (!modulo.ok) return { success: false, error: modulo.error };

  // Cada mensaje son DOS llamadas de pago: el embedding de la busqueda y la
  // respuesta. Sin cuota, la factura la marcaba cualquiera.
  const quota = await checkQuota(auth.user.id, 'chat');
  if (!quota.ok) return { success: false, error: quota.error };

  try {
    // 1. Limpieza y validación de entrada
    const safeQuery = query.trim().slice(0, MAX_QUERY_CHARS);
    if (!safeQuery) return { success: false, error: 'Consulta vacía.' };

    // 2. Qué se busca en el temario.
    //    No es lo mismo que lo que ha escrito el alumno: en una repregunta
    //    ("¿y qué plazo aplica en ese caso?") el embedding de la frase suelta no
    //    recupera nada, así que se antepone la pregunta anterior.
    const retrievalQuery = buildRetrievalQuery(history, safeQuery);

    // 2b. Si el alumno ha elegido tema, se acabó adivinar: van sus documentos
    //     enteros y NO se paga el embedding de la búsqueda. Es la mitad del
    //     coste de cada mensaje y la única forma de que esto siga acertando
    //     cuando el temario tenga 85 temas en vez de tres.
    const tema = Number(subjectId);
    const delTema = Number.isInteger(tema) && tema > 0 ? await documentosDelTema(tema) : [];
    const conTema = delTema.length > 0;

    // 2c. Las dos preguntas que la búsqueda semántica NO puede responder, y que
    //     el índice sí: el recuento de lo indexado y el artículo nombrado a
    //     dedo. Van EN PARALELO con el embedding porque ninguna depende de él.
    const numeroArticulo = articuloPedido(safeQuery);
    const [embeddingResult, indice, porReferencia] = await Promise.all([
      conTema ? Promise.resolve(null) : embeddingModel.embedContent(retrievalQuery),
      esPreguntaDeEstructura(safeQuery)
        ? construyeIndice(pidePartesInternas(safeQuery))
        : Promise.resolve(null),
      numeroArticulo ? buscaArticulo(numeroArticulo) : Promise.resolve([] as Chunk[]),
    ]);

    // 3. Recuperación de conocimiento desde Supabase (RPC match_document_chunks)
    let semanticos: Chunk[] = [];
    if (embeddingResult) {
      const { data, error: rpcError } = await supabase.rpc('match_document_chunks', {
        query_embedding: embeddingResult.embedding.values,
        match_threshold: 0.45, // Equilibrio entre precisión y cantidad
        match_count: 8,
      });

      if (rpcError) {
        console.error('RPC Error:', rpcError);
        return { success: false, error: 'Error en la conexión con la base de datos legislativa.' };
      }
      semanticos = (Array.isArray(data) ? data : []) as Chunk[];
    }

    // EL DOCUMENTO ENTERO, SOLO CUANDO EL ALUMNO ELIGE TEMA.
    //
    // La regla 33 sigue en pie: un documento entero responde muchisimo mejor
    // que seis recortes de mil caracteres, y en la ventana del modelo cabe de
    // sobra. Lo que cambia es que ahora hay que ELEGIR TEMA para tenerlo.
    //
    // El motivo es el gasto, y el numero lo explica solo: sin tema se pagaba
    // el embedding Y podian viajar DOS documentos enteros (hasta 34.675 tokens
    // cada uno). Con tema viaja uno y el embedding no se paga. O sea que la
    // opcion comoda del desplegable era ademas la mas cara — y por pereza la
    // iba a usar todo el mundo, que es justo lo que no se puede permitir.
    //
    // Sin tema se responde con los fragmentos de la busqueda semantica, que es
    // como funciono la plataforma siempre y cuesta ~3.000 tokens. Se pierde
    // precision, y por eso el desplegable LO DICE en vez de dejar que el
    // alumno lo descubra con una respuesta floja.
    //
    // Lo que NO se toca: el indice y el articulo buscado por su numero siguen
    // yendo delante. Son coincidencias exactas y deterministas, no parecidos,
    // y no cuestan un documento entero.
    const { enteros, sobrantes } = conTema
      ? { enteros: delTema, sobrantes: [] as Chunk[] }
      : { enteros: [] as Chunk[], sobrantes: semanticos };

    // El índice y el artículo exacto van DELANTE: son coincidencias seguras,
    // no parecidos. Después el documento entero, y al final los fragmentos de
    // lo que no cupo.
    const rawChunks: Chunk[] = [
      ...(indice ? [indice] : []),
      ...porReferencia,
      ...enteros,
      ...sobrantes,
    ];

    if (!rawChunks.length) {
      return {
        success: true,
        answer: 'No he encontrado nada en el temario cargado que responda a esa pregunta. Puedes probar a preguntarlo de otra forma, o nombrar el artículo si lo conoces.',
        sources: [],
      };
    }

    // 4. Refinado de contexto: Deduplicación y orden por relevancia.
    //    El orden es ESTABLE, así que las fuentes seguras (similarity 1) se
    //    quedan delante y el resto conserva el orden que dio la búsqueda.
    const cleanChunks = dedupeChunks(rawChunks).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    // 5. Construcción del contexto numerado para que la IA pueda CITAR
    // Ya no se recortan a seis "por no saturar la ventana": lo que entra ahora
    // lo decide el presupuesto de caracteres de `documentosQueCaben`, no un
    // número redondo puesto cuando los modelos aceptaban 8.000 tokens.
    const contextWithCitations = cleanChunks
      .slice(0, MAX_FUENTES)
      .map((c, idx) => `[FUENTE ${idx + 1}]: ${citaDe(c)}\nCONTENIDO: ${c.content_chunk}`)
      .join('\n\n---\n\n');

    const conversation = formatHistory(history);

    // 6. El prompt vive en `lib/chat.ts`: asi se puede leer, testear y probar
    //    contra el modelo de verdad sin levantar la aplicacion
    //    (`node scripts/probar-chat.mjs`). Un prompt que solo se ejecuta en
    //    produccion es un prompt que nadie revisa.
    const prompt = buildChatPrompt({
      contexto: contextWithCitations,
      conversacion: conversation,
      pregunta: safeQuery,
    });

    // 7. Generación de la respuesta
    const result = await chatModel.generateContent(prompt);
    const answer = result.response.text()?.trim() || 'Error en la generación de respuesta.';

    // El gasto REAL de esta llamada, al registro del servidor. El chat es con
    // diferencia lo más caro de la plataforma —manda el documento entero— así
    // que es donde primero hace falta saber el número en vez de estimarlo.
    // `conTema` va en el detalle porque es exactamente lo que explica que una
    // pregunta cueste 25× más que otra.
    registraGasto({
      ruta: 'chat',
      userId: auth.user.id,
      uso: result.response.usageMetadata,
      detalle: conTema ? `tema=${tema}` : 'sin-tema',
      subjectId: conTema ? tema : null,
    });

    return { 
      success: true, 
      answer, 
      sources: cleanChunks.slice(0, MAX_FUENTES) 
    };

  } catch (e) {
    console.error('Fallo en askAtenea:', e);
    return { success: false, error: 'Fallo crítico en el motor de inteligencia.' };
  }
}
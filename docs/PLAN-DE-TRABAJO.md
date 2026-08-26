# Plan de trabajo — Atenea Policial

Orden de ataque para retomar el proyecto. Cada fase es autónoma y deja el repositorio en
verde: `npm run check` (typecheck + tests) debe pasar al terminar cada una.

Referencias `§x.y` → [`AUDITORIA.md`](./AUDITORIA.md).

**Regla de oro:** los tests marcados `BUG:` describen el comportamiento *actual*, no el
deseado. Al corregir un fallo, ese test **debe** fallar: se invierte la aserción y se le
quita el prefijo. Es el aviso de que el arreglo ha surtido efecto.

---

## Fase 0 — Recuperar el terreno ✅ HECHA

Objetivo: poder ejecutar, compilar y probar. Sin esto no se puede validar nada de lo demás.

- [x] Arreglar los 7 errores de TypeScript que impedían `npm run build`.
- [x] Que las acciones de moderación y entrenamiento propaguen los errores de Supabase.
- [x] Extraer la lógica pura a `app/lib/` (`text.ts`, `srs.ts`, `questions.ts`).
- [x] Montar Vitest + 35 tests de caracterización.
- [x] `.env.example` y scripts `typecheck` / `test` / `check`.

**Comandos:** `npm run build` · `npm run typecheck` · `npm test` · `npm run check`

---

## Fase 1 — Seguridad *(bloqueante: no publicar hasta cerrarla)*

> Aquí está el riesgo real. Mientras esta fase no esté cerrada, cualquiera puede leer los
> datos de cualquier alumno y gastar la cuota de Gemini de la cuenta. §1.

### 1.1 Sesión de verdad en el servidor ✅ HECHA

- [x] `@supabase/ssr` con la sesión en **cookies**. El cliente del navegador la guardaba en
      `localStorage`, que el servidor no puede leer: sin este cambio ninguna Server Action
      podía verificar quién llamaba. `app/lib/supabase/{server,client}.ts`.
- [x] `app/lib/auth.ts` con `requireUser()` / `requireAdmin()`. Devuelven un resultado en vez
      de lanzar, porque las Server Actions redactan las excepciones en producción y el
      usuario vería un error genérico inútil.
- [x] La verificación usa `auth.getUser()`, que valida el token contra Supabase.
      `getSession()` **no** sirve: lee la cookie sin comprobar la firma.
- [x] Las 37 acciones ya no aceptan `userId`/`adminId`: el id sale de la sesión. El
      parámetro se ha **borrado** de la firma, no dejado ignorado.
- [x] `getUserRole(userId)` sustituido por `getCurrentUser()`: el rol lo decide el servidor.
- [x] Lista blanca de campos en `saveBiodata` y `savePhysicalProfile` (era el punto 1.4).
- [x] Tope de 200 en `seedQuestionBank`; `generateTestQuestion` deja de ser acción pública.
- [x] `getOfficialSyllabus` ya no devuelve el mensaje crudo de la BD (era el punto 1.5).
- [x] 6 tests estáticos en `tests/actions-auth.test.ts` que fallan si el patrón vuelve.

**Pendiente de verificar contra el proyecto real:** con `curl`, invocar una acción sin
cookie de sesión y comprobar que devuelve el error de sesión en vez de datos.

### 1.2 Reducir el uso de la clave de servicio *(después de la 1.3)*

`supabaseAdmin` salta RLS. Debe quedar reservado a lo que de verdad lo necesita
(indexado de PDFs, seed masivo). El resto pasa a un cliente con el token del usuario, para
que RLS actúe como segunda barrera.

**No empezar hasta que la 1.3 esté ejecutada:** cada consulta que se mueva al cliente del
usuario antes de tener RLS activa se queda sin ninguna protección.

### 1.3 Activar y documentar RLS ✅ HECHA (26 ago 2026)

> **Va ANTES que la 1.2**, al revés de como estaba numerado aquí. Todas las consultas de
> la aplicación usan la clave de servicio, que salta RLS: activarla hoy **no puede romper
> nada**. En cambio, mover consultas al cliente del usuario (1.2) sin RLS puesta las
> dejaría sin ninguna protección.

- [x] Políticas escritas en [`docs/sql/1.3-activar-rls.sql`](sql/1.3-activar-rls.sql):
      propietario para las diez tablas de datos personales, `profiles` de solo lectura
      (dejar escribir su propia fila sería dejar que un alumno se ascienda a admin), y RLS
      sin políticas en las tablas de contenido, que cierra el acceso directo con la clave
      pública sin tocar lo que hace la aplicación.
- [x] Empieza con un PASO 0 que comprueba que el esquema coincide con lo deducido del
      código, y trae la comprobación real con `curl` y la vuelta atrás.
- [x] **Ejecutado.** Las 21 tablas quedan con RLS activa. Comprobado desde fuera: con
      la clave pública, `question_bank`, `flashcard_bank`, `test_results`, `profiles` y
      `workout_logs` devuelven `[]`. Antes el banco entero era volcable **con las
      respuestas correctas** por cualquiera que supiera la URL.
- [x] Volcado del esquema en [`supabase/migrations/0001_esquema_actual.sql`](../supabase/migrations/0001_esquema_actual.sql).
      Sin `supabase db pull`, que pide la contraseña de la base de datos: lo genera
      `node scripts/dump-migration.mjs` a partir de una función instalada en el propio
      proyecto ([`2.6-funcion-volcado.sql`](sql/2.6-funcion-volcado.sql)).

**Lo que apareció al contrastarlo con la base de datos real**, y por qué el PASO 0
existía:

- `workout_logs` tiene `user_id` y no estaba en ninguna lista. Habría quedado abierta.
- `content_documents` y `flashcard_bank` faltaban en el paso de contenido, y el segundo
  guarda las respuestas.
- Siete tablas **ya tenían RLS** con políticas correctas. La versión anterior del guion
  les habría añadido una política `FOR ALL` por encima y, como las permisivas se
  combinan con OR, eso **ampliaba** el acceso: `flashcard_results`, `profiles_psych` y
  `profiles_biodata` no dejan borrar, y habrían pasado a dejarlo. Se quedan intactas.

### 1.4 Cerrar la asignación masiva §1.2 ✅ HECHA

Hecha junto con 1.1: lista blanca de campos (`BIODATA_FIELDS`, `PHYSICAL_FIELDS`) en vez de
`{ user_id, ...formData }`. Nunca expandir un objeto del cliente sobre una fila.

### 1.5 Límite de frecuencia en las rutas de IA ✅ HECHA

- [x] Cuota **por usuario y por ruta** en las nueve llamadas a Gemini
      (`app/lib/rate-limit.ts`). Por ruta y no global: si el contador fuera compartido, un
      alumno activo dejaría sin servicio a todos los demás — peor fallo que no tener cuota.
      Y agotar el chat no puede dejar a nadie sin flashcards.
- [x] Guarda estática que recorre las acciones **siguiendo la cadena de llamadas**: en
      `exams.ts` el modelo se invoca desde un ayudante privado al que llaman dos acciones,
      así que mirar solo la función que envuelve la llamada daba falsos positivos.
- [x] Segunda guarda, menos obvia: **sin `await`**, `checkQuota` devuelve una promesa,
      `.ok` es `undefined` y la comprobación deja pasar **todo** sin fallar de forma visible.

**El matiz ya no aplica (26 ago 2026).** La cuota la lleva ahora la base de datos:
`consume_ai_quota` incrementa la fila de forma atómica en una sola sentencia, así que dos
peticiones simultáneas del mismo usuario no pueden leer el mismo contador y escribir
ambas. Probado contra el proyecto real: con límite 2, la tercera llamada devuelve
`allowed = false`.

El contador en memoria se queda como **respaldo**: se consume siempre, también cuando la
base de datos responde. Es lo que sostiene el límite si la BD deja de contestar a mitad
de una ventana, y contar de más en ese caso es justo lo que se busca.

### 1.6 Decidir qué se manda a Gemini §1.3 ✅ HECHA

- [x] **Lista blanca explícita** (`buildInterviewProfile`): lo que sale del sistema es una
      decisión auditable, no lo que pase a estar en la tabla. Antes se mandaba
      `JSON.stringify(biodata)` — la fila entera, en cada turno.
- [x] **Los antecedentes no salen en texto.** Se manda un derivado de tres estados. El
      simulador necesita saber que hay algo que preguntar, no qué es.
- [x] Fuera el `user_id`, las columnas internas y las respuestas crudas del psicotécnico.
      Texto libre recortado.
- [x] Lo mismo en el entrenador físico (`buildCoachProfile`): la fila traía `user_id` y el
      texto de `injuries`, que es información de salud. Va la **edad**, no el año de
      nacimiento.
- [x] Un aviso en la pantalla de biodata: el alumno tiene derecho a saber qué sale de ahí
      antes de escribirlo.
- [x] Un test añade una columna inventada a la fila y comprueba que **no** aparece en el
      prompt: es la razón de ser de la lista blanca.

**Salida de la fase:** un documento corto `docs/SEGURIDAD.md` con el modelo de amenazas y
las políticas RLS aplicadas.

---

## Fase 2 — Que el producto haga lo que dice

Los fallos que hacen que un alumno tenga una experiencia rota. Ordenados por impacto.

### 2.1 Ciclo de vida de las preguntas §2.1 ✅ HECHA

Era el fallo de producto más caro: ningún test usaba el banco.

- [x] Modelo de estados en un solo sitio: `QUESTION_STATUS` en `app/lib/questions.ts`.
      Se acabaron los literales sueltos que no casaban entre ficheros.
- [x] **Opción A aplicada, pero como decisión visible.** `seedQuestionBank` acepta
      `autoApprove` (por defecto `true`) y la UI lo expone como interruptor
      **Destino: Banco / Moderación**. Sembrar es un acto deliberado del admin sobre su
      propio temario, pero quien quiera revisar antes puede hacerlo sin tocar código.
- [x] "Banco Maestro" filtra por estado (por defecto **todos**) y cada pregunta lleva su
      chip de estado. Antes filtraba `active` en duro: se sembraban 500 preguntas y la
      lista salía vacía, sin forma de llegar a las pendientes desde esa pantalla.
- [x] Aprobación en lote (`approveQuestions`) con botón "Publicar las N" sobre las
      pendientes visibles. Filtra por `status = candidate`, así que un id de una pregunta
      descartada no la resucita.

**Dos fallos más que aparecieron al mirar de cerca, corregidos aquí:**

- [x] **Resembrar corrompía el banco.** El `upsert` sobre `question_hash` no llevaba
      `ignoreDuplicates`, así que reescribía la fila existente **incluido el estado**: una
      pregunta ya aprobada volvía a `candidate` (saliendo del banco de los alumnos) y una
      descartada resucitaba en moderación. También se perdían las ediciones manuales del
      admin. Ahora ningún upsert toca una fila que ya existe.
- [x] **Las preguntas duplicadas llegaban con `id: null`** (era §2.10): no se podían votar
      ni reportar y se guardaban en `test_results` sin referencia. Ahora, si el hash choca,
      se recupera la fila existente y la pregunta llega con su id real.

- [x] El seed informa del desglose real (`inserted` / `duplicated` / `failed`). Antes solo
      devolvía `inserted`: un lote que fallaba entero se veía igual que uno duplicado.
- [x] 13 tests en `tests/question-lifecycle.test.ts`, verificados reintroduciendo los dos
      fallos a propósito.

**Pendiente de verificar contra el proyecto real:** sembrar un tema y comprobar que las
preguntas aparecen en el banco y llegan a un test de alumno.

### 2.2 Arreglar el panel de estadísticas §2.2 ✅ HECHA

Al abrirlo apareció que **el fallo estaba en dos módulos, no en uno**: `DashboardHome`
—la pestaña de inicio, lo primero que ve un alumno— hacía exactamente la misma lectura
sin proteger. Con un solo resultado guardado, la app era inusable desde el arranque.

- [x] **Join en vez de desnormalizar.** `getUserStats` trae el enunciado de `question_bank`
      y el nombre del tema de `subjects`. Sin migración y sin copias que se queden obsoletas
      si un admin edita la pregunta. Lleva un respaldo que degrada a consulta plana si las
      FK no están declaradas en la BD, con aviso en el log (quitar al cerrar 1.3).
- [x] Render blindado en los dos módulos, más dos fechas sin proteger que encontró el propio
      test (`AdminActivity`, `AdminModeration`).
- [x] `ModuleErrorBoundary` envolviendo cada pestaña del alumno y del admin, más
      `app/error.tsx`. Antes, cualquier excepción de render dejaba la app entera en blanco:
      todo el dashboard vive en una sola ruta, así que `error.tsx` por sí solo no basta.
- [x] **La aritmética se movió a `app/lib/stats.ts`** y se agrega en el servidor sobre la
      muestra completa. Corregidos: el índice de incertidumbre (sumaba los cambios de las 5
      últimas y dividía entre el total de hasta 100), el progreso al ascenso (`winRate /
      (min + 20)`, que nunca llegaba al 100 %), el denominador de la taxonomía de errores y
      la media de tiempo (contaba como 0 ms las respuestas sin medir, hundiéndola).
- [x] Fuera la barra de progreso cableada al **65 %**. El KPI de dominadas lee ahora el campo
      que de verdad se escribe (`baseline_metrics.pullups_score`) y distingue **"sin datos"**
      de **"cero dominadas"**, que no son lo mismo para el alumno. Unificar del todo los dos
      nombres de campo se cerró después, en la fase 2.7.
- [x] 22 tests nuevos (17 de aritmética + 5 estáticos de render), verificados reintroduciendo
      los fallos a propósito.

**Pendiente de verificar contra el proyecto real:** hacer un test y comprobar que Inicio y
Estadísticas cargan con datos reales; si el join no resuelve, saldrá el aviso en el log.

### 2.3 Recuperar las métricas de comportamiento §2.3 ✅ HECHA

- [x] **Contrato tipado en `app/lib/exam-results.ts`**, usado por los dos lados. `toResultRow`
      es el único punto donde camelCase se convierte en columnas. En cuanto se puso el tipo,
      el compilador señaló el desajuste que llevaba meses en producción.
- [x] `saveExamResults` deja de recibir `any[]`. El `r.time` / `r.changes` que nunca existió
      ya no está, y hay un test estático que impide que vuelva.
- [x] `saveTestResult` usa el mismo helper: los dos caminos de guardado (pregunta a pregunta
      en entrenamiento, en bloque al terminar un examen) ya no pueden divergir.
- [x] `safeCount` filtra NaN, Infinity y negativos antes de tocar la BD. `Date.now() - undefined`
      da NaN, y un NaN en una columna numérica es un error de inserción en producción.

**El fallo era mayor de lo documentado.** En modo entrenamiento, `ActiveTest` llamaba a
`setOptionChanges(prev => prev + 1)` y leía `optionChanges` en la misma función: por el
cierre obsoleto guardaba **siempre 0**. Sumado al desajuste de nombres en modo examen, la
métrica de titubeo no había funcionado nunca, en ningún modo.

- [x] El contador pasa a un `useRef`: se escribe y se lee de forma síncrona.
- [x] **`option_changes` cuenta cambios reales**, no pulsaciones. La primera respuesta no
      cuenta y volver a marcar la misma tampoco. Antes contestar una sola vez ya marcaba 1.
- [x] Ajustados los umbrales de `stats.ts` a la nueva semántica (`HESITATION_THRESHOLD`
      2 → 1, `MAX_AVG_CHANGES` 3 → 2). No hay histórico que preservar: la columna valía 0
      en todas las filas.
- [x] De paso, §2.9: `ActiveTest` ya no muta el estado en su sitio (la copia era superficial
      y mutaba las mismas preguntas que tiene el padre), y fuera el `@ts-ignore` que ocultaba
      precisamente el desajuste de nombres.
- [x] 20 tests en `tests/exam-results.test.ts`, verificados reintroduciendo el desajuste.

**Ojo con la fila duplicada:** etiquetar un fallo sigue insertando una segunda fila (fase
2.4). A propósito NO lleva tiempo ni cambios, para que `summarizeResults` la descarte de
ambas métricas en vez de contaminar la media con el tiempo de la pantalla de diagnóstico.

**Pendiente de verificar contra el proyecto real:** hacer un simulacro y comprobar que
`test_results` guarda `response_time_ms` y `option_changes` distintos de 0.

### 2.4 Un resultado por respuesta §2.4 ✅ HECHA

**Se descartó el `upsert` sobre `(user_id, question_id, session_id)` que proponía este
plan.** Exige una columna y una restricción única que no existen y que no se pueden crear
sin acceso a la base de datos; y además colapsaría intentos legítimos de la misma pregunta
en tests distintos, que sí deben ser filas separadas.

En su lugar, insertar y actualizar por id:

- [x] `saveTestResult` devuelve el **id** de la fila que crea.
- [x] `setResultErrorType(resultId, errorType)` **actualiza** esa fila. Solo toca
      `error_type`: reescribir el tiempo aquí lo sustituiría por el de la pantalla de
      diagnóstico, que no es el de la respuesta.
- [x] Filtra por `user_id`, así que no se puede etiquetar el resultado de otro aunque se
      conozca su id.
- [x] Si el guardado de la respuesta falló, se inserta la fila completa con la etiqueta
      incluida: ahí no hay nada que duplicar.

**Una carrera que no estaba en el plan:** los botones de diagnóstico aparecen en cuanto se
marca la respuesta, mientras el insert sigue viajando. Un clic rápido leería el id a `null`
y volvería a insertar. `handleErrorTag` espera al guardado en vuelo antes de decidir.

- [x] 10 tests en `tests/single-result.test.ts`, verificados reintroduciendo el doble insert.

**El guion de duplicados NO hay que ejecutarlo (26 ago 2026).** Al lanzar su PASO 1
contra el proyecto real falló: `test_results` no tiene columna `error_type`. Y la tabla
estaba **vacía**, así que no había histórico que reparar.

Lo que sí había era peor, y sale en la fase 2.8.

### 2.8 Los resultados se guardaban en la tabla equivocada ✅ HECHA (26 ago 2026)

Había **dos tablas para lo mismo** y el código escribía en la que no era:

| | columnas |
|---|---|
| `test_results` | id, user_id, question_id, is_correct, response_time_ms, option_changes, created_at |
| `question_attempts` | id, user_id, exam_id, question_id, **topic**, is_correct, selected_index, **error_type**, response_time_ms, created_at |

`toResultRow` mandaba `subject_id` y `error_type` a `test_results`, que no tiene ninguna
de las dos. **PostgREST rechaza la inserción entera si una sola columna no existe**, y el
error solo se registraba en consola: la pantalla seguía como si nada.

Resultado: **nunca se guardó un resultado de test**. Cero filas.

No era una regresión de la fase 2.4 — el código anterior al merge escribía esas mismas
dos columnas (`git show 343393a:app/actions/exams.ts`). Venía de antes.

- [x] Se elige `question_attempts` y no ampliar `test_results`: `user_id`, `topic` e
      `is_correct` son NOT NULL (en `test_results` `user_id` admite nulos, que en una
      tabla de resultados por usuario no tiene sentido), ya tenía RLS con tres políticas
      correctas, y guarda `topic` como texto, que es lo que el historial pinta.
- [x] [`docs/sql/2.5-question-attempts.sql`](sql/2.5-question-attempts.sql), ejecutado:
      la columna `option_changes` que le faltaba, la clave ajena hacia `question_bank`
      (sin declararla PostgREST no resuelve el join y las estadísticas se quedan sin el
      enunciado) y el índice `(user_id, created_at desc)`.
- [x] Cada pregunta se etiqueta con el tema del que salió, tanto las del banco como las
      generadas por IA: `question_bank` guarda `subject_id` y `question_attempts` guarda
      `topic`, así que sin arrastrarlo no había forma de saberlo al terminar el examen.
- [x] Verificado contra el proyecto real: insert, join y update de `error_type`.

**La causa de fondo, y ya está cerrada:** el esquema solo vivía dentro de Supabase. Sin
copia en el repo, el código y la base de datos derivaron sin que nada lo cantara. Ahora
`supabase/schema.json` lo versiona y [`tests/schema-drift.test.ts`](../tests/schema-drift.test.ts)
compara contra él las columnas que el código escribe, los filtros `.eq` y las listas
blancas. Ese test encontró solo el desajuste que quedaba vivo.

`test_results` se deja en pie a propósito: no se borra nada todavía.

### 2.5 Que la dificultad sirva de algo §2.5

1. Añadir columna `difficulty` a `question_bank`.
2. Que el prompt de generación reciba la dificultad (hoy está fija en "Media/Alta").
3. Aplicar el filtro en `getQuestionsFromBank` y **quitar el comentario "PENDIENTE"** que
   dejé en la firma.

Alternativa honesta si esto se pospone: ocultar el selector en la UI. Un control que no
hace nada es peor que no tenerlo.

### 2.6 Indexado de PDFs §2.6 ✅ HECHA

`chunkLegalText` reescrito con tres garantías, y los tres tests `BUG:` invertidos:

- [x] **Nunca emite fragmentos vacíos.** Un PDF que empezara por un párrafo largo producía
      `''` como primer fragmento; `embedContent('')` falla y el documento quedaba indexado
      a medias sin que nadie se enterara.
- [x] **Ningún fragmento supera el máximo.** Los párrafos largos se parten primero por
      frases (los textos legales están llenos de puntos) y solo entonces con corte duro.
- [x] **El solape no se acumula:** se toma del contenido del fragmento anterior, no del
      fragmento ya solapado. Y el presupuesto reserva sitio para el separador — sin eso el
      fragmento se pasaba del máximo por un carácter.
- [x] Un texto vacío devuelve cero fragmentos en vez de uno vacío.
- [x] `uploadTopicPDF` distingue indexado **completo** de **parcial**, devuelve cuántos
      fallaron y con qué error, y la UI avisa de que ese contenido no aparecerá en las
      búsquedas del chat. Antes pintaba el mismo `✅` en ambos casos y el fallo solo salía a
      la luz cuando el chat no encontraba el artículo.

Verificado restaurando el troceador antiguo: cuatro tests lo señalan.

### 2.7 Perfil físico §2.7 ✅ HECHA

- [x] **Una sola definición del perfil**: `app/lib/physical.ts`. `stats.ts` la reexporta,
      las acciones y las cuatro pantallas del entrenador la importan. La duplicación era
      justo lo que dejó al panel leyendo una ruta que no escribía nadie.
- [x] **`toNumberOrNull` en vez de `Number()`.** Un `<input>` devuelve cadenas: `"180"`
      llegaba a una columna numérica, y `""` se convertía en `0`. Ahora un campo en blanco
      es `null`, y el `0` escrito a propósito sigue siendo un dato.
- [x] **Normalización también en el servidor.** Una Server Action es un endpoint público:
      normalizar solo en el formulario no basta.
- [x] **La pantalla ya no avanza sin comprobar el guardado** (regla 4), y el error se
      pinta. Igual con el generador de planes, que fallaba en silencio.
- [x] **No se puede confirmar una prueba en blanco.** `Number('')` es `0`: el hub daba la
      prueba por hecha y el plan salía de una marca inventada.
- [x] **El plan semanal, tipado y normalizado** (`app/lib/training-plan.ts`): `title` que
      el prompt nunca pedía, `exercises` que podía no ser un array, progreso con `NaN%`.
- [x] 44 tests nuevos (`physical`, `training-plan`), seis de ellos guardas estáticas.
- [x] 23 `any` menos: el lint baja de 74 a 51 errores.

Queda fuera, porque necesita la consola: migrar las filas históricas que tengan
`baseline_test.pullups` o cadenas vacías en las columnas numéricas. La lectura las tolera
(`readMaxPullups` acepta las tres rutas), así que no corre prisa.

---

## Fase 3 — Calidad de la IA ✅ HECHA

- [x] **Modo JSON con esquema.** `questionModel` y `flashcardModel` en `core.ts` llevan
      `responseMimeType: application/json` y `responseSchema`: el formato lo impone el SDK,
      no el prompt. Se acabaron las vallas de markdown y el texto de cortesía por delante.
- [x] **`cleanAIResponse` retirado.** Era un regex ciego que corrompía el contenido cuando
      una cadena llevaba `, }` o una llave. Lo sustituye `parseAIJson`, que escanea
      respetando cadenas y escapes. Los dos tests `BUG:` quedaron invertidos.
- [x] **Validación antes de guardar** (`validateGeneratedQuestion`): enunciado con
      contenido, exactamente tres opciones, distintas y no vacías, y **`correctIndex` dentro
      de rango**. Ese último era el peligroso: un índice inválido se colapsaba en `'c'` y el
      alumno estudiaba un dato falso. Ahora la pregunta se descarta y se genera otra.
- [x] **Variedad en las flashcards.** `randomContextWindow` toma un trozo aleatorio del
      documento. Antes era siempre `substring(0, 2500)`: los mismos 2500 caracteres, así que
      repasar un tema daba tarjetas prácticamente idénticas. Se valida además que anverso y
      reverso no vengan vacíos ni sean iguales.
- [x] 27 tests en `tests/ai-output.test.ts`.

- [x] **Memoria en el chat §2.13.** Y la parte que importaba no era el prompt: `askAtenea`
      embebía solo la frase actual, así que una repregunta no recuperaba **nada** del
      temario. `buildRetrievalQuery` reconstruye qué se busca, anteponiendo la pregunta
      anterior solo cuando la actual depende de ella. Heurística deliberada: reescribir la
      consulta con la IA costaría una llamada de pago por mensaje.

Pendiente de esta fase:

- [ ] **Persistir las conversaciones.** Hoy la memoria dura lo que dura la pestaña abierta;
      guardar el histórico necesita una tabla.
- [ ] **Repasar los modelos.** `core.ts` usa el mismo para `chatModel` y `smartModel`;
      el comentario sobre embeddings admite dudas sobre cuál funciona. Medir y decidir.
- [ ] **Coste.** Instrumentar el gasto por módulo antes de optimizar nada.

---

## Fase 4 — Pedagogía y datos

Ahora que los datos son fiables, que sirvan para algo.

- [x] **Repetición espaciada de verdad.** `BOX_INTERVALS` fija el intervalo por caja y
      **"Duda" baja una caja**. Eso resuelve las tres rarezas de golpe: ya no coincide con
      "Bien" desde la caja 1, ya no deja tarjetas atascadas, y desde la caja 5 la progresión
      es continua en vez de saltar de 3 a 30 días. Los tres tests `BUG:` se reescribieron
      (dos fallaron al arreglarlo; el tercero pasaba por el motivo equivocado).
      SM-2 / FSRS queda descartado de momento: necesita columnas nuevas (factor de facilidad,
      número de repeticiones) y Leitner bien hecho ya cubre el caso.
- [x] **Analítica de flashcards conectada.** `saveFlashcardResult` estaba exportada y sin un
      solo consumidor: la tabla `flashcard_results` existía y nunca se escribía. Ahora
      `saveFlashcardProgress` apunta el repaso en el mismo paso, best-effort: si la tabla
      falla, el progreso ya está guardado y no tiene sentido tumbar la sesión por una fila
      de estadísticas.
- [x] El guardado del repaso deja de darse por bueno a ciegas, y una tarjeta de repaso se
      normaliza a camelCase en el servidor (venía con `subject_id` y el guardado esperaba
      `subjectId`, así que cada repaso hacía una consulta de más).
- **Tabla propia para el log de entrenamiento §2.11.** `completeTrainingDay` ya guarda el
  log dentro del JSON del plan (antes lo recibía y lo tiraba), pero para comparar la
  progresión entre semanas hace falta una tabla consultable.
- [x] **Semana siguiente del plan físico.** Era un `alert("Procesando tus métricas…")` que
      no hacía nada, y el botón decía "GENERAR SEMANA 2" para siempre. **No hacía falta la
      tabla nueva:** el registro de cada día ya vive dentro del JSON del plan, que es donde
      lo deja `completeTrainingDay`.

      Lo que decide la progresión es código, no el prompt (`decideProgression`): el modelo
      solo redacta. **El orden de las reglas importa**: una molestia declarada manda sobre
      cualquier RPE, y no haber terminado la semana manda sobre haberla encontrado fácil —
      sin esa precedencia, quien completó dos de cinco días "porque le dolía el hombro"
      recibiría *más* carga sobre la zona que le duele. La media de esfuerzo cuenta solo
      los días que traen dato: contar como 0 los que no lo traen la hunde.

      `generateNextWeek` cierra la semana anterior **antes** de insertar la nueva y
      filtrando por `user_id`: al revés quedarían dos planes activos y
      `getActiveTrainingPlan` elegiría uno en silencio. Y un fallo que encontró su propio
      test: `Object.entries('texto')` enumera los **caracteres** de la cadena, así que un
      `feedback` corrupto generaba una anotación por letra dentro del prompt.
- [x] **Evaluación de la entrevista.** `evaluateInterview` genera un informe estructurado
      (puntuación, veredicto, fortalezas, **contradicciones detectadas** y qué preparar) a
      partir de la transcripción, con modo JSON y esquema. Antes se presionaba al aspirante
      toda la sesión y al terminar no quedaba nada.
      Se exige un mínimo de respuestas: un informe sobre una sola respuesta sería inventárselo.

      De paso, tres fallos de la máquina de estados de la sala:
      - Un navegador sin reconocimiento de voz mostraba un `alert()` y dejaba la pantalla
        congelada en "TRIBUNAL HABLANDO" sin salida. Ahora tiene su propia pantalla, detectada
        con `useSyncExternalStore` (es una capacidad del navegador, no estado de React).
      - El manejador `onend` se reasignaba desde un efecto en cada cambio de transcripción; el
        envío se decide ahora leyendo un ref, y un `onend` tardío no puede reenviar.
      - El historial se leía del cierre y podían perderse turnos.

- [ ] **Persistir la transcripción y los informes.** Hoy el informe se ve y se pierde al
      cerrar: guardarlo necesita una tabla.
- **Arreglar la estadística que miente.** Índice de incertidumbre (muestras distintas en
  numerador y denominador), "progreso al ascenso" (nunca llega al 100%), barra del 65%
  cableada, columnas de `AdminUsers` siempre a cero.

---

## Fase 5 — Higiene

Baja urgencia, alto efecto compuesto. Se puede ir haciendo en paralelo.

- **Los `any` que quedan.** No es cosmética: son la razón de que §2.3 y §2.7 pasaran
  inadvertidos. El módulo de entrenamiento está ya **limpio de lint entero** (74 → 50
  errores en el repositorio). Para el resto, empezar por tipar las filas de la base de
  datos (`supabase gen types typescript`).
- Las 41 variables sin usar y los 12 `react/no-unescaped-entities`.
- Las 11 dependencias de efectos incompletas. (Las mutaciones de estado de §2.9 se
  cerraron en la fase 2.3, dentro de `ActiveTest`.)
- [x] **Cronómetro §2.8.** Fuga de `AudioContext` (uno por pitido, sin cerrar) y efectos
      dentro del actualizador de `setState`. Y algo que no estaba documentado: contaba
      restando 1 por tick de `setInterval`, que no es exacto — en el test de Cooper, de 12
      minutos, el desfase se acumula y **el alumno mide mal su marca**. Ahora el tiempo se
      deriva de marcas de reloj. `playBeep('milestone')` estaba en el tipo y no tenía rama:
      pedirlo no hacía nada.
- [x] Borrados `VipButton.tsx` / `VipCard.tsx` (vacíos y huérfanos).
- Sustituir los `alert()` / `confirm()` que quedan por componentes de UI propios. Los del
  entrenador físico ya son estado de React, con el error pintado en la propia pantalla;
  quedan los del panel de administración y los de biodata.
- [x] **`README.md` reescrito.** Era el de `create-next-app`: no decía ni qué es el
      proyecto. Ahora explica el arranque, las cuatro variables obligatorias, el mapa del
      código, las dos clases de test y lo que sigue bloqueado por la consola de Supabase.
- [x] **CI en GitHub Actions** (`.github/workflows/check.yml`): `npm run check` en cada
      push, más `lint` informativo. Las guardas estáticas solo sirven si corren solas.
      El `build` queda fuera a propósito: `core.ts` construye los clientes al importarse,
      así que el prerender exige las cuatro variables reales.
- [x] Fisher-Yates en lugar de `sort(() => Math.random() - 0.5)`, con test de reparto.

---

## Cómo trabajar cada fase

```bash
npm ci
cp .env.example .env.local     # y rellenar las 4 variables
npm run dev

npm run check                  # typecheck + tests, antes de cada commit
npm run build                  # requiere las variables de entorno definidas
```

Sugerencia de ritmo: una rama por fase, y dentro de cada fase un commit por punto. Las
fases 1 y 2 conviene no mezclarlas: la primera cambia la firma de casi todas las acciones
y va a tocar todos los ficheros.

---

## Siguiente paso

Lo de la lista anterior ya está hecho: RLS ejecutada (1.3), cuota de IA enchufada a la
base de datos (1.5), esquema volcado al repo y resultados movidos a `question_attempts`
(2.8). El guion de duplicados no aplicaba.

1. **Hacer un test completo entrando como alumno.** Es lo único que no se ha podido
   probar de punta a punta: hace falta una sesión de verdad. Comprobar que
   `question_attempts` recibe la fila con `response_time_ms` y `option_changes`
   distintos de 0, y que al fallar en entrenamiento y etiquetar el error queda **una**
   sola fila con su `error_type`. Las tres operaciones están verificadas por separado
   contra la base de datos real, pero no encadenadas desde la interfaz.
2. **Desplegar.** No hay nada en producción: el repo no tiene configuración de
   despliegue. Vercel es el camino natural (la aplicación son Server Actions de punta a
   punta, que Firebase Hosting a secas no ejecuta). Hacen falta las cuatro variables de
   `.env.example` y añadir la URL resultante en Supabase → Authentication → URL
   Configuration, o el login no funcionará.
3. **Fase 2.5** (que la dificultad sirva de algo) o **fase 1.2** (mover consultas al
   cliente del usuario). La 1.2 ya no está bloqueada: RLS está activa, que era su
   condición.
4. **Retirar `test_results`** cuando lleve un tiempo confirmado que nadie la lee. Hoy
   sigue en pie y vacía.

> El estado vivo del proyecto está en [`CLAUDE.md`](../CLAUDE.md), en la raíz. Al cerrar una
> fase, actualiza los dos.

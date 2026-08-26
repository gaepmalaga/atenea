# Auditoría técnica — Atenea Policial

**Fecha:** 2026-08-26
**Commit auditado:** `343393a` (rama `main`)
**Stack:** Next.js 16.1.6 (App Router, Turbopack) · React 19.2 · Supabase · Google Gemini · Tailwind 4

---

## 0. Resumen ejecutivo

El proyecto es una plataforma de preparación de oposiciones a Policía Nacional con
siete módulos (chat RAG, tests, flashcards, entrenamiento físico, entrevista por voz,
biodata/psicotécnico, estadísticas) más un panel de administración. La arquitectura de
producto está bien pensada y la UI es sólida. El problema no es el diseño: es que
**el código lleva tiempo sin ejecutarse de verdad**.

Estado al empezar la auditoría:

| Comprobación | Resultado |
|---|---|
| `npm run build` | ❌ **Falla** — 7 errores de TypeScript |
| `npm run typecheck` | ❌ 7 errores |
| `npm run lint` | ⚠️ 145 errores + 52 avisos |
| `npm test` | ❌ No existía suite de tests |

Estado a 26 ago 2026: build ✅, typecheck ✅, **303 tests** ✅, RLS activa, y la aplicación
arranca y guarda contra el Supabase real (ver `docs/PLAN-DE-TRABAJO.md`).

**Los tres asuntos que había que mirar antes que nada, y todos están cerrados:**

1. ~~**No hay autenticación real en el servidor.**~~ Todas las Server Actions recibían el
   `userId` como argumento desde el cliente y ninguna verificaba una sesión. Como además
   usan la clave de servicio de Supabase (que salta RLS), cualquiera podía leer y
   escribir datos de cualquier usuario. §1. **Cerrado**, y RLS ya está activa (§1.6).
2. ~~**El banco de preguntas nunca llega a los alumnos.**~~ Todo lo generado se guardaba
   con `status: 'candidate'` y los alumnos solo leen `status: 'active'`. §2.1.
3. ~~**El panel de estadísticas revienta en blanco**~~ por leer una columna que no existe.
   §2.2.

> **Lo que esta auditoría no pudo ver, y era lo más grave.** Los hallazgos se sacaron
> leyendo el código, porque el esquema de la base de datos no estaba en el repositorio.
> Al ejecutar por fin contra el Supabase real aparecieron dos fallos que ningún análisis
> del código podía delatar: **no se guardaba ni un resultado de test** (§2.15) **ni un
> repaso de flashcards** (§2.16), porque el código escribía columnas que no existen y
> PostgREST rechaza la escritura entera cuando eso pasa — registrándolo solo en consola.
> La causa de fondo y su cierre, en §2.18.

---

## 1. Seguridad

> Estos hallazgos son de lectura estática. Antes de dar ninguno por resuelto conviene
> reproducirlos contra el proyecto real de Supabase.
>
> **Y no es retórico:** al hacerlo aparecieron §2.15, §2.16 y §2.17, que la lectura del
> código no podía ver. Si vas a cerrar un hallazgo, ejecútalo.

### 1.1 · CRÍTICO — Las Server Actions no autentican a nadie

Una Server Action de Next.js es un **endpoint HTTP público**. No hay `middleware.ts`,
y ninguna acción comprueba la sesión: todas confían en el `userId`/`adminId` que les
llega como parámetro.

```ts
// app/actions/user.ts
export async function getUserStats(userId: string) {
  const { data } = await supabaseAdmin.from('test_results')
    .select('*').eq('user_id', userId)   // userId viene del cliente, sin verificar
```

Agravante: el cliente usado es `supabaseAdmin`, creado con `SUPABASE_SERVICE_ROLE_KEY`,
que **salta todas las políticas RLS** (`app/actions/core.ts:30`). Aunque hubiera RLS bien
configurada en la base de datos, no se aplicaría en ninguna de estas rutas.

Consecuencias directas, sin necesidad de credenciales:

- Leer las estadísticas, la biodata y el perfil físico de cualquier usuario cuyo UUID se
  conozca (`getUserStats`, `getBiodata`, `getPhysicalProfile`, `getActiveTrainingPlan`).
- Volcar el banco de preguntas **con las respuestas correctas**: `getAdminQuestionBank`
  ni siquiera recibe un `adminId` (`app/actions/admin.ts:202`).
- Quemar la cuota de Gemini de la cuenta: `askAtenea`, `generateAndSaveCandidate` y
  `seedQuestionBank` son invocables sin sesión y sin límite de frecuencia. `seedQuestionBank`
  acepta un `count` arbitrario.

Para escalar a administrador hace falta conocer el UUID de un admin, lo cual no es trivial
— pero tampoco es un secreto de diseño: cualquier tabla que exponga `user_id` puede
filtrarlo. La comprobación `getUserRole(adminId)` no es un control de acceso, es una
consulta a una tabla con un dato que aporta el atacante.

**Dirección de arreglo:** verificar la sesión en el servidor (`supabase.auth.getUser()`
sobre la cookie), derivar el `userId` de ahí y **eliminar el parámetro de la firma** de
todas las acciones. Reservar la clave de servicio para lo que realmente la necesite.

### 1.2 · ALTO — Asignación masiva en el guardado de perfiles

```ts
// app/actions/interview.ts
export async function saveBiodata(userId: string, formData: any) {
    await supabase.from('profiles_biodata').upsert({ user_id: userId, ...formData });
}
```

`formData` se expande **después** de `user_id`, así que un `formData` que incluya su
propio `user_id` lo sobrescribe. Como el cliente controla el objeto entero, esto es una
primitiva de escritura sobre la fila de cualquier usuario. Mismo patrón en
`savePhysicalProfile` (`app/actions/training.ts`).

Además, `BiodataManager` carga la fila completa de la BD en el estado del formulario y la
reenvía tal cual al guardar, así que columnas como `id` o `created_at` viajan de vuelta en
cada `upsert`.

### 1.3 · ~~MEDIO~~ ✅ CERRADO — Datos personales sensibles enviados a Gemini sin filtrar

`processInterviewTurn` serializaba la biodata **completa** en el prompt, en cada turno de la
entrevista: `JSON.stringify(biodata)` sobre la fila entera de la base de datos. Eso incluía
el `user_id`, las columnas internas (`id`, `created_at`), las 30 respuestas crudas del
psicotécnico y, sobre todo, `legal_issues` — el texto libre donde el aspirante escribe sus
antecedentes, con un *"sinceridad absoluta obligatoria"* encima del campo.

**Cerrado.** Lo que sale del sistema es ahora una decisión explícita y auditable
(`buildInterviewProfile`, `app/lib/interview.ts`), no lo que pase a estar en la tabla:

- **Los antecedentes no salen en texto.** Se manda un derivado de tres estados: *sin
  declarar* / *declara no tener* / *declara incidencias, pregunta por ellas*. El simulador
  necesita saber que hay algo que preguntar, no qué es.
- Fuera el `user_id`, las columnas internas y las respuestas crudas del psicotécnico (las
  puntuaciones derivadas ya viajaban aparte y son las que se usan).
- El texto libre se recorta: el aspirante escribe en un `textarea` sin límite.
- **Un campo nuevo en la tabla ya no sale solo.** Es la razón de ser de la lista blanca, y
  hay un test que añade una columna inventada y comprueba que no aparece en el prompt.

Mismo patrón, más leve, en el entrenador físico: `athleteBrief` hacía
`JSON.stringify(profile)` sobre la fila, que trae `user_id` y el texto libre de `injuries`
(información de salud). `buildCoachProfile` manda las medidas y las marcas, y la **edad** en
lugar del año de nacimiento.

Y en la pantalla de biodata, un aviso: el alumno tiene derecho a saber qué sale de ahí
**antes** de escribirlo.

### 1.4 · ~~MEDIO~~ ✅ CERRADO DEL TODO (26 ago 2026) — Sin límite de frecuencia en las rutas de IA

Ocho acciones llamaban a Gemini sin ningún control de cuota. Combinado con §1.1, la factura
la marcaba cualquiera.

`app/lib/rate-limit.ts` aplica una cuota por usuario **y por ruta**: agotar el chat no puede
dejar al alumno sin flashcards, y el contador no es global — si lo fuera, un alumno activo
dejaría sin servicio a todos los demás, que es peor fallo que no tener cuota.

**La limitación que llevaba escrita por delante ya no aplica.** El contador vivía en
memoria del proceso, así que con varias instancias el límite real se multiplicaba por el
número de instancias vivas. Desde el 26 ago 2026 la cuota la lleva la base de datos:
`consume_ai_quota` incrementa la fila en una sola sentencia atómica, de modo que dos
peticiones simultáneas del mismo usuario no pueden leer el mismo contador y escribir las
dos. Probado contra el proyecto real: con límite 2, la tercera llamada devuelve
`allowed = false`.

El contador en memoria se queda como **respaldo** y se consume siempre, también cuando la
base de datos responde: es lo que sostiene el límite si la BD deja de contestar a mitad de
una ventana. Si la consulta falla se registra y se cae a él; nunca se deja la acción sin
límite.

La guarda del `await` sigue en pie, y sigue importando: sin él el resultado es una promesa,
`.ok` es `undefined` y la comprobación dejaría pasar **todo** sin fallar de forma visible.

### 1.5 · ~~BAJO~~ ✅ CERRADO — Mensajes de error crudos hacia el cliente

`getOfficialSyllabus` devolvía `e.message` *"para debug"* (comentario incluido), lo que
filtraba estructura interna de la base de datos. **Cerrado:** el detalle se queda en el log
del servidor y al cliente le llega *"No se pudo cargar el temario."*

---

## 2. Fallos funcionales

### 2.1 · ~~CRÍTICO~~ ✅ CERRADO — El banco de preguntas nunca se servía

| Dónde | Qué hace |
|---|---|
| `exams.ts:121` (`generateAndSaveCandidate`) | guarda `status: 'candidate'` |
| `exams.ts:210` (`seedQuestionBank`) | guarda `status: 'candidate'` |
| `exams.ts:250` (`getQuestionsFromBank`) | filtra `status: 'active'` |
| `admin.ts:205` (`getAdminQuestionBank`) | filtra `status: 'active'` |

El único camino a `active` es aprobar una a una en la pestaña de Moderación. Por tanto:

- Cada test que hace un alumno se genera **entero en vivo con IA**: varios segundos de
  espera por pregunta y una llamada de pago cada vez.
- La pestaña "Banco Maestro" del admin aparece **vacía** aunque se hayan sembrado miles de
  preguntas, porque también filtra por `active`.

El comentario del código decía lo contrario de lo que hacía: *"En seed masivo, asumimos
activas"* justo encima de `status: 'candidate'`.

**Cerrado.** Los estados salen ahora de `QUESTION_STATUS` (`app/lib/questions.ts`), el seed
publica en el banco por defecto con un interruptor **Destino** visible en la UI, y el
"Banco Maestro" filtra por estado en vez de fijar `active`. Al mirarlo de cerca aparecieron
dos fallos más, corregidos en el mismo cambio:

- **Resembrar corrompía el banco.** El `upsert` sobre `question_hash` no llevaba
  `ignoreDuplicates`, así que reescribía la fila existente **incluido el estado**: una
  pregunta aprobada volvía a `candidate` y salía del banco de los alumnos; una descartada
  resucitaba en moderación; y las ediciones manuales del admin se perdían.
- **Aprobar de una en una no daba abasto** con la generación en vivo alimentando la cola.
  Añadida `approveQuestions` en lote, que solo toca las que están en `candidate`.

### 2.2 · ~~CRÍTICO~~ ✅ CERRADO — El panel de estadísticas reventaba

```tsx
// StatsPanel.tsx:460
<p ...>{item.question_text.replace('[FLASHCARD] ', '')}</p>
```

`item` es una fila de `test_results`, y nada en el código escribe `question_text` en esa
tabla (se insertan `user_id`, `question_id`, `subject_id`, `is_correct`, `created_at`,
`response_time_ms`, `option_changes`, `error_type`). En cuanto el usuario tenía un solo
resultado guardado, `undefined.replace(...)` lanzaba y la pestaña se quedaba en blanco.
`item.topic` tampoco existía.

**Y estaba en dos módulos, no en uno.** `DashboardHome` —la pestaña de inicio, lo primero
que ve un alumno al entrar— hacía exactamente la misma lectura. Con un solo resultado
guardado, la aplicación era inusable desde el arranque.

**Cerrado.** El enunciado y el tema se traen por *join* en `getUserStats` (sin migración y
sin copias que se queden obsoletas si un admin edita la pregunta), el render está blindado
en ambos módulos, y cada pestaña va envuelta en `ModuleErrorBoundary`: una excepción de
render ya no puede llevarse por delante toda la aplicación. El test estático encontró
además dos fechas sin proteger en `AdminActivity` y `AdminModeration`.

### 2.3 · ~~ALTO~~ ✅ CERRADO — Las métricas de comportamiento se perdían

`ExamManager.handleFinish` construye el payload con unas claves y `saveExamResults` lee
otras distintas:

| Envía la UI | Lee el servidor | Resultado |
|---|---|---|
| `response_time_ms` | `r.time` | siempre `0` |
| `option_changes` | `r.changes` | siempre `0` |

Todo el apartado "Atenea Mind" (índice de incertidumbre, perfil cronométrico) se alimentaba
de columnas que en modo examen siempre valían cero.

**Y en modo entrenamiento tampoco funcionaba.** `ActiveTest` llamaba a
`setOptionChanges(prev => prev + 1)` y leía `optionChanges` en la misma función: por el
cierre obsoleto guardaba **siempre 0**. La métrica de titubeo no había funcionado nunca,
en ningún modo.

**Cerrado.** Contrato tipado en `app/lib/exam-results.ts` usado por los dos lados, con
`toResultRow` como único punto de traducción camelCase → columnas. El contador pasa a un
`useRef` y `option_changes` cuenta cambios **reales** (la primera respuesta no cuenta, ni
volver a marcar la misma). Los umbrales de `stats.ts` se ajustaron a la nueva semántica.

### 2.4 · ~~ALTO~~ ✅ CERRADO EN CÓDIGO — Modo práctica: dos filas por cada fallo

En `ActiveTest`, al fallar se llamaba a `saveTestResult` en `handleAnswer` y **otra vez** en
`handleErrorTag` al etiquetar el error. Ambas hacían `INSERT`. Cada fallo contaba doble y el
`winRate` quedaba sesgado hacia abajo de forma permanente.

**Cerrado.** `saveTestResult` devuelve el id de la fila y `setResultErrorType` la actualiza.
Se descartó el `upsert` sobre una clave compuesta que proponía el plan: exigía una columna y
una restricción únicas inexistentes, y habría colapsado intentos legítimos de la misma
pregunta en tests distintos. Se cerró además una carrera que no estaba documentada: los
botones de diagnóstico aparecen mientras el insert viaja, así que un clic rápido volvía a
duplicar.

**No había duplicados que reparar.** Al lanzar el guion contra el proyecto real (26 ago
2026) falló: `test_results` no tiene columna `error_type`. Y la tabla estaba vacía. Lo que
sí había era mucho peor: §2.15.

### 2.15 · CRÍTICO ✅ CERRADO (26 ago 2026) — Ningún resultado de test se guardaba, nunca

Había **dos tablas para lo mismo** y el código escribía en la que no era.

| | columnas reales |
|---|---|
| `test_results` | id, user_id, question_id, is_correct, response_time_ms, option_changes, created_at |
| `question_attempts` | id, user_id, exam_id, question_id, **topic**, is_correct, selected_index, **error_type**, response_time_ms, created_at |

`toResultRow` mandaba `subject_id` y `error_type` a `test_results`, que no tiene ninguna de
las dos. **PostgREST rechaza la inserción entera si una sola columna no existe**, y el
error solo se registraba en consola: la pantalla seguía como si nada.

Los tres caminos —`saveTestResult`, `saveExamResults`, `setResultErrorType`— fallaban en
silencio. La tabla llevaba **0 filas**.

No era regresión de §2.4: el código anterior escribía esas mismas dos columnas
(`git show 343393a:app/actions/exams.ts`). Venía de antes de la auditoría, y esta no lo
detectó porque los hallazgos eran de lectura estática **contra el código, no contra el
esquema**, que no estaba en el repositorio.

**Cerrado** moviendo el guardado a `question_attempts` (mejor tabla: `user_id`, `topic` e
`is_correct` son NOT NULL, ya tenía RLS con políticas correctas, y guarda el tema como
texto, que es lo que el historial pinta). Ver `docs/sql/2.5-question-attempts.sql`.

### 2.16 · ALTO ✅ CERRADO (26 ago 2026) — Los repasos de flashcards tampoco se guardaban

El mismo fallo, en otra tabla. `saveFlashcardProgress` escribía `subject_id` en
`flashcard_progress`, que tampoco tiene esa columna — la que sí la tiene es
`flashcard_results`, que es otra. El alumno veía:

> No se pudo guardar el repaso: Could not find the 'subject_id' column of
> 'flashcard_progress' in the schema cache

Y había un tercer efecto más callado: la búsqueda de tarjetas pendientes filtraba por
`.eq('subject_id', ...)` sobre esa misma tabla, así que **nunca podía devolver nada**.
Los datos anteriores a febrero de 2026 que hay en la tabla confirman que esto funcionaba
antes y se rompió después.

### 2.17 · CRÍTICO ✅ CERRADO (26 ago 2026) — La aplicación no arrancaba

No pasaba de la pantalla de carga. Tres fallos encadenados:

1. `ReferenceError: TrainingDayLog is not defined`. `app/actions/training.ts` es
   `'use server'`, y Next exige que un módulo así exporte solo funciones async. El
   `export type { TrainingDayLog }` —reexportación de un tipo **importado**, no una
   declaración— acababa siendo una referencia real en el bundle y el servidor reventaba al
   evaluar el módulo. Con eso caía `getCurrentUser` y con ella la página entera.
2. `checkSession` no tenía `try/catch`: al fallar, `loadingUser` se quedaba en `true` para
   siempre y no había ni pantalla de login a la que volver. Este fallo **tapaba** al
   anterior, y habría tapado cualquier otro.
3. `next dev` no compilaba: Turbopack infiere mal la raíz del proyecto en desarrollo y se
   va al directorio padre, desde donde no resuelve el `@import "tailwindcss"`. `next build`
   no lo sufre. `npm run dev` pasa a `--webpack`.

### 2.18 · LA CAUSA DE FONDO ✅ CERRADA (26 ago 2026) — El esquema no estaba en el repositorio

§2.15 y §2.16 son el mismo fallo, y ninguno de los dos lo habría dejado pasar un test.
Pero no había con qué escribirlo: **el esquema vivía solo dentro de Supabase**. Por eso
los guiones de `docs/sql/` se escribieron deduciendo los nombres del código —y de ahí que
el de RLS dejara `workout_logs` fuera y el de duplicados nombrara una columna inexistente.

Cerrado con tres piezas:

- `supabase/schema.json` — el esquema real, versionado.
- `tests/schema-drift.test.ts` — compara contra él las columnas que el código escribe, los
  filtros `.eq`/`.in` y las listas blancas. Al añadirlo detectó solo el desajuste que
  quedaba vivo.
- `npm run smoke` — inserta una fila de verdad por cada camino de escritura y la borra.
  Coge lo que el test estático no ve: tipos, NOT NULL y claves ajenas.

Ninguna de las tres necesita la contraseña de la base de datos.

### 2.5 · ALTO — La dificultad elegida no hace nada

`ExamConfig` deja elegir Básica/Estándar/Extrema, `ExamManager` la traduce a un número y
la pasa a `getQuestionsFromBank`… que nunca la usó. Era, de hecho, uno de los 7 errores de
compilación. El prompt de generación tiene la dificultad **fija** en "Media/Alta"
(`exams.ts:41`).

### 2.6 · ~~ALTO~~ ✅ CERRADO — Fragmentos vacíos al indexar PDFs

El troceado de `uploadTopicPDF` hace `push(currentChunk)` **antes** de acumular nada. Si el
documento empieza con un párrafo de más de 1000 caracteres —lo normal en un texto legal—
el primer fragmento es la cadena vacía, `embedContent('')` falla, y el documento queda
indexado a medias sin avisar al administrador. Cubierto por
`tests/text.test.ts` (*"genera un primer fragmento VACIO"*).

Relacionado: el algoritmo nunca partía un párrafo, así que un artículo largo producía un
fragmento único gigantesco; y el solapamiento se tomaba del fragmento *ya solapado*, de modo
que los tamaños crecían por encima del máximo.

**Cerrado.** `chunkLegalText` reescrito con tres garantías bajo test: sin fragmentos vacíos,
ningún fragmento por encima del máximo (partiendo por frases antes que a ciegas), y solape
tomado del contenido anterior sin acumularse. Además `uploadTopicPDF` distingue ahora un
indexado completo de uno parcial y dice cuántos fragmentos fallaron: antes pintaba el mismo
`✅` en los dos casos.

### 2.7 · ~~MEDIO~~ ✅ CERRADO — Perfil físico: nombres de campo que no casan

`StatsPanel` leía `physProfile.baseline_test.pullups`, pero `savePhysicalProfile` y
`generateWeeklyPlan` escriben y leen `baseline_metrics.pullups_score`. El KPI "Dominadas
Máximas" mostraba siempre `0`. La barra de progreso de esa tarjeta estaba además cableada
al `65%`.

**Cerrado.** La lectura del KPI ya se arregló en §2.2 (`readMaxPullups`) y la barra se
retiró. Al abrirlo del todo aparecieron **cuatro fallos que no estaban documentados**, y
todos venían de lo mismo: el perfil cruzaba la frontera cliente-servidor sin tipo.

1. **Números guardados como cadenas.** `SetupWizard` mandaba `height`, `weight` y
   `birth_year` tal y como salen del `<input>`: `"180"`, o `""` si el campo se dejaba en
   blanco. A columnas numéricas les llegaba una cadena vacía. Ahora la conversión ocurre
   en un solo sitio (`normalizeProfileInput`, `app/lib/physical.ts`) y `''` se convierte en
   `null`, **no en `0`**: "sin dato" y "cero" no son lo mismo para el alumno.
2. **La pantalla avanzaba aunque el guardado fallara.** `handleSaveBio` hacía
   `await savePhysicalProfile(data); setView('hub')` sin mirar el resultado (regla 4). El
   alumno se quedaba convencido de que sus datos estaban en el servidor.
3. **Confirmar una prueba en blanco registraba un 0.** `TestRunner` hacía
   `onSave({ pullups_score: Number(result) })`, y `Number('')` es `0`: el hub daba la
   prueba por superada y el plan se generaba sobre una marca inventada. El botón ahora
   está deshabilitado hasta que hay una marca real.
4. **La normalización estaba solo en el formulario.** Una Server Action es un endpoint
   público: `savePhysicalProfile` normaliza también en el servidor.

`app/lib/physical.ts` es ahora la única definición del perfil; `stats.ts` la reexporta.
28 tests en `tests/physical.test.ts`, cuatro de ellos guardas estáticas verificadas
rompiendo el código a propósito.

### 2.7b · MEDIO ✅ CERRADO — El plan semanal se leía sin garantizar su forma

Salió al tipar el módulo, y no estaba documentado:

- **`day.title` se pintaba en tres sitios y el prompt nunca lo pedía.** La estructura que
  se le mandaba a Gemini era `{ "day", "type", "exercises" }`. Las tarjetas del panel
  salían sin encabezado y el registro de la sesión guardaba `day_title: undefined`.
- **`day.exercises.length` y `day.exercises.map` sin proteger** (regla 5): un día sin
  ejercicios dejaba el módulo en blanco.
- **`ActiveSession` recibía `day` sin comprobar que hubiera día activo**, así que un
  `view === 'session'` con `activeDay` a null reventaba al leer `day.title`.
- **`generateWeeklyPlan` devolvía `{ success: true, plan: null }`** si el insert fallaba
  (regla 4), y el entrenador se quedaba en blanco sin decir por qué.

`app/lib/training-plan.ts` define el plan y lo normaliza **al escribirlo y al releerlo de
la BD** — hay filas anteriores a esta fase generadas sin `title`. `PLAN_SHAPE` vive junto
al tipo para que el prompt no se separe de lo que la UI lee. El progreso de la semana sale
de `planProgress` (regla 8): `completed / total` con `total: 0` pintaba `NaN%`.
16 tests en `tests/training-plan.test.ts`.

### 2.8 · ~~MEDIO~~ ✅ CERRADO — Fuga de AudioContext en el cronómetro

`TacticalTimer.playBeep` crea un `new AudioContext()` en cada llamada y no lo cierra nunca.
Durante los últimos 10 segundos de una cuenta atrás se llama una vez por segundo: los
navegadores limitan los contextos simultáneos por documento, así que los pitidos se
apagan (y en algunos motores lanza).

Además, `speak()`, `playBeep()` y `onFinish()` se ejecutaban **dentro del actualizador de
`setTime`**, que debe ser una función pura. En StrictMode se ejecuta dos veces: pitidos y
voz duplicados. `playBeep('milestone')` estaba en el tipo pero no tenía rama: no sonaba.

**Cerrado**, y al abrirlo apareció algo peor que no estaba documentado: el cronómetro
contaba **restando 1 en cada tick de `setInterval`**, que no es exacto. En el test de
Cooper, de 12 minutos, ese desfase se acumula y el alumno mide mal su marca. Ahora el
tiempo se deriva de marcas de reloj y el intervalo solo decide cada cuánto se repinta.

### 2.9 · ~~MEDIO~~ ✅ CERRADO — Mutación directa del estado en `ActiveTest`

```tsx
const updated = [...localQuestions];
updated[currentIndex].userAnswer = optionId;   // copia superficial: muta el objeto original
```

La copia es superficial, así que se mutan los mismos objetos que están en el array
`questions` del padre. ESLint lo marca (`react-hooks/immutability`). Mismo patrón en
`handleErrorTag` y `handleNext`.

En la misma función, `saveTestResult` enviaba `optionChanges` justo después de
`setOptionChanges(prev => prev + 1)`: por el cierre obsoleto siempre guardaba el valor
anterior — es decir, 0.

**Cerrado** junto con §2.3: las tres funciones copian el objeto además del array, y el
contador vive en un `useRef`.

### 2.10 · ~~MEDIO~~ ✅ CERRADO — Preguntas duplicadas llegaban con `id: null`

Cuando el `upsert` por `question_hash` chocaba, `generateAndSaveCandidate` devolvía
`{ ...qData, id: null, status: 'unsaved' }`. Esa pregunta se mostraba igual, pero no se
podía votar ni reportar, y se guardaba en `test_results` con `question_id` null.

**Cerrado** junto con §2.1: si el hash choca, se recupera la fila existente y la pregunta
llega a la UI con su id real. Si además está descartada, ya no se sirve.

### 2.11 · MEDIO — El log de entrenamiento no se persiste en tabla propia

`completeTrainingDay` recibía `logData` y lo ignoraba por completo: solo marcaba
`isCompleted`. Las series, repeticiones y sensaciones que introduce el usuario se perdían al
recargar. **Corregido:** el log se guarda dentro del JSON del plan, y de ahí lo lee
`summarizeWeek` para generar la semana siguiente. Falta una tabla consultable si algún día
se quiere comparar la progresión entre meses sin recorrer todos los planes.

### 2.11b · ~~MEDIO~~ ✅ CERRADO — La semana siguiente del plan físico no existía

`handleGenerateNextWeek` era un `alert("Procesando tus métricas…")` que no hacía nada, y el
botón decía "GENERAR SEMANA 2" para siempre. El alumno terminaba su semana y se quedaba ahí.

**Cerrado sin necesidad de tabla nueva:** el registro de cada día ya vive dentro del JSON del
plan. `summarizeWeek` lo resume (días completados, esfuerzo medio, molestias, anotaciones) y
`decideProgression` decide **en código** si la semana siguiente sube, mantiene, baja o se
repite; el modelo solo redacta.

El orden de las reglas es lo que importa: una molestia declarada manda sobre cualquier RPE, y
no haber terminado la semana manda sobre haberla encontrado fácil. Sin esa precedencia, un
alumno que completó dos de cinco días *"porque le dolía el hombro"* recibiría **más carga**
sobre la zona que le duele.

Tres detalles que salieron al escribirlo:
- La media de esfuerzo cuenta **solo los días que traen dato**. Contar como 0 los que no lo
  traen la hunde, y la semana siguiente sale más fácil de lo que toca.
- La semana anterior se cierra **antes** de insertar la nueva y filtrando por `user_id`: al
  revés quedarían dos planes activos y `getActiveTrainingPlan` elegiría uno en silencio.
- `Object.entries('texto')` enumera los **caracteres** de la cadena. Un `feedback` corrupto
  generaba una anotación por letra, y eso acababa dentro del prompt. Lo encontró su propio
  test.

### 2.12 · ~~MEDIO~~ ✅ CERRADO — Variedad nula en las flashcards

`generateFlashcard` tomaba siempre `full_text.substring(0, 2500)` — los mismos 2500 primeros
caracteres, sin desplazamiento aleatorio. Repasar un tema producía tarjetas casi idénticas
una y otra vez.

**Cerrado** con `randomContextWindow`, compartido con el generador de preguntas. Se valida
además que la tarjeta traiga las dos caras y que no sean iguales.

### 2.13 · ~~MEDIO~~ ✅ CERRADO — El chat RAG no tenía memoria

`askAtenea(query)` recibía solo la consulta actual. La UI mantenía el historial en pantalla
pero nunca lo enviaba, así que no se podía preguntar "¿y en ese caso, qué plazo aplica?".

**Cerrado**, y el arreglo de fondo no era el prompt: se embebía **solo la frase actual**, de
modo que una repregunta no recuperaba ningún fragmento del temario. `buildRetrievalQuery`
reconstruye la consulta de búsqueda anteponiendo la pregunta anterior cuando la actual
depende de ella. Persistir las conversaciones sigue pendiente: necesita una tabla.

### 2.14 · ~~BAJO~~ ✅ PARCIALMENTE CERRADO — Varios

Cerradas en la fase 2.2 las cuatro estadísticas que mentían (marcadas abajo). La
aritmética vive ahora en `app/lib/stats.ts`, se agrega en el servidor sobre la muestra
completa y está cubierta por 17 tests.

- `AdminUsers` pinta `u.total_tests` y `u.win_rate`, que no están en `profiles`
  (`select('*')`): las columnas "Tests" y "Efectividad" salen siempre a `0`.
- `ExamResults` dividía entre `questions.length` sin protección → `NaN%` con 0 preguntas.
  *(Corregido vía `scoreExam`, con test.)*
- ✅ La media de tiempo contaba como `0 ms` las respuestas sin medir, hundiéndola a la mitad.
- `cleanLegalText` contenía `.replace(/[]/g, '')`. Una clase de caracteres **vacía** en JS
  no casa con nada: la línea nunca hizo nada. Con test que lo documenta.
- ✅ `indexToOptionId` colapsaba **cualquier** índice fuera de rango en `'c'`. Cerrado en la
  fase 3: `validateGeneratedQuestion` descarta la pregunta antes de guardarla.
- ✅ El índice de incertidumbre dividía los cambios de las **5** últimas preguntas entre el
  total de hasta **100**: el número no significaba lo que decía significar.
- ✅ `PROGRESO AL ASCENSO` calculaba `winRate / (min + 20)`; en rango Inspector (min 90) el
  denominador era 110 y nunca llegaba al 100%. Ahora mide el tramo real entre rangos.
- ✅ La barra del KPI físico estaba cableada al 65%. Retirada: el KPI lee el campo que de
  verdad se escribe y distingue "sin datos" de "cero dominadas".
- ✅ `sort(() => Math.random() - 0.5)` era un barajado sesgado: el comparador es
  inconsistente y unas posiciones salen mucho más que otras, así que el alumno veía
  siempre las mismas preguntas. Sustituido por Fisher-Yates, con test de reparto.

---

## 3. Estado del código

### 3.1 Compilación (resuelto en esta sesión)

7 errores de TypeScript impedían `npm run build`. Tres eran síntoma de un fallo real: las
acciones `updateQuestion`, `completeTrainingDay` y el resto de moderación **descartaban
los errores de Supabase** y devolvían `{ success: true }` a ciegas, mientras la UI
intentaba leer un `res.error` que no existía en el tipo. La UI daba por buena una escritura
que podía haber fallado.

### 3.2 Lint

197 avisos, dominados por:

| Regla | Nº |
|---|---|
| `@typescript-eslint/no-explicit-any` | 126 |
| `@typescript-eslint/no-unused-vars` | 41 |
| `react/no-unescaped-entities` | 12 |
| `react-hooks/exhaustive-deps` | 11 |
| `react-hooks/immutability` | 4 |

Los 126 `any` no son cosmética: son la razón por la que ninguno de los desajustes de
nombres de campo de §2.3 y §2.7 se detectó en compilación.

### 3.3 Estructura

- ✅ `VipButton.tsx` y `VipCard.tsx` estaban **vacíos** (0 bytes) y sin importar: borrados.
- Acciones exportadas sin consumidor: `deleteTopic`, `getPsychProfile`. ✅ Resueltas:
  `generateTestQuestion` pasó a helper interno (fase 1.1), `getTopicsList` se eliminó
  (fase 1.1) y `saveFlashcardResult` se conectó (fase 4) — la tabla de analítica
  `flashcard_results` existía y **nunca se escribía**.
- No hay `middleware.ts`, ni `error.tsx`, ni `loading.tsx`, ni Error Boundaries: cualquier
  excepción de render (§2.2) deja la pantalla en blanco.
- El esquema de la base de datos no está en el repositorio. No hay migraciones ni
  documentación de RLS. Hoy el esquema solo existe dentro del proyecto de Supabase.
- No había `.env.example` pese a que la app se niega a arrancar sin 4 variables.
- El `README.md` sigue siendo el de `create-next-app`.
- No hay CI.

---

## 4. Estado de la remediación

| Fase | Estado |
|---|---|
| 0 · Recuperar el terreno | ✅ cerrada |
| 1.1 · Sesión en el servidor | ✅ cerrada |
| 1.4 · Asignación masiva | ✅ cerrada |
| 2.1 · Ciclo de vida de las preguntas | ✅ cerrada (§2.1 y §2.10) |
| 2.2 · Estadísticas y Error Boundaries | ✅ cerrada (§2.2 y §2.14) |
| 2.3 · Métricas de comportamiento | ✅ cerrada (§2.3 y §2.9) |
| 2.4 · Un resultado por respuesta | ✅ cerrada en código (§2.4) |
| **2.6 · Indexado de PDFs** | ✅ **cerrada** (§2.6) |
| 3 · Calidad de la IA + memoria del chat | ✅ cerrada (§2.12, §2.13) |
| **4 · SRS, analítica e informe de entrevista** | ✅ **cerrada en parte** |
| **1.3 · Activar RLS** | 📄 **SQL escrito, falta ejecutarlo** |
| 1.2 / 1.3 · Clave de servicio y RLS | pendiente |
| 1.5 / 1.6 · Cuotas y datos a Gemini | parcial (tope de seed puesto) |
| 2.2 – 5 | pendiente |

Los hallazgos de §1.1, §1.2, §1.5, §2.1, §2.2, §2.3, §2.4, §2.9, §2.10 y §2.14 quedan
cerrados en código;
**falta verificarlos contra el proyecto real de Supabase**.

---

## 5. Qué se ha cambiado en esta sesión

**No se ha corregido ningún fallo funcional de §2** — eso es lo que ordena el plan de
trabajo, fase por fase.

### Fase 0 — poder trabajar

- Build y typecheck en verde (7 errores).
- `moderation.ts`, `completeTrainingDay` y `getAdminQuestionBank` ya propagan los errores
  de la base de datos en vez de tragárselos.
- `completeTrainingDay` filtra además por `user_id` (antes lo recibía y lo ignoraba).
- Lógica pura extraída a `app/lib/` (`text.ts`, `srs.ts`, `questions.ts`) y usada como
  única fuente de verdad desde las acciones y los componentes.
- Vitest + **35 tests** que documentan el comportamiento actual, incluidos los fallos
  conocidos (marcados con `BUG:` para que al arreglarlos el test falle y avise).
- `.env.example` y scripts `typecheck`, `test`, `check`.

### Fase 1.1 — sesión de verdad en el servidor

- La sesión pasa de `localStorage` a **cookies** (`@supabase/ssr`). Este era el bloqueo
  técnico de fondo: con la sesión en `localStorage` el servidor no puede verla, así que
  ninguna Server Action tenía forma de saber quién llamaba aunque quisiera.
- `app/lib/auth.ts` con `requireUser()` / `requireAdmin()`, sobre `auth.getUser()` (valida
  el token contra Supabase; `getSession()` solo lee la cookie sin comprobar la firma).
- Las **37 acciones** dejan de aceptar `userId`/`adminId`. El parámetro se ha borrado de la
  firma: dejarlo ignorado habría invitado a volver a usarlo.
- Lista blanca de campos en `saveBiodata` y `savePhysicalProfile` (§1.2).
- Tope de 200 en `seedQuestionBank`; `generateTestQuestion` deja de ser acción pública;
  `getOfficialSyllabus` deja de devolver el mensaje crudo de la BD (§1.5).
- **6 tests estáticos** (`tests/actions-auth.test.ts`) que leen el código fuente y fallan si
  alguna acción vuelve a aceptar un id del cliente o se queda sin guarda. Verificados
  reintroduciendo el fallo a propósito: el test señala la acción culpable por su nombre.

---

*Continúa en [`PLAN-DE-TRABAJO.md`](./PLAN-DE-TRABAJO.md).*

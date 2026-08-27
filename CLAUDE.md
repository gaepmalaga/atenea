# Atenea Policial — guía para trabajar en este repo

Plataforma de preparación de oposiciones a Policía Nacional (CNP).
Next.js 16 (App Router) · React 19 · Supabase · Google Gemini · Tailwind 4.

> **Hay un plan de producto abierto:** [`docs/PLAN-PRODUCTO.md`](docs/PLAN-PRODUCTO.md).
> Recoge lo que la plataforma todavía no sabe hacer (ingesta fiable, preguntas a mano,
> super admin con módulos configurables, panel de academia y cobros) y está **pendiente
> de tres decisiones** que solo puede tomar el dueño del proyecto. No empieces nada de
> ahí sin leerlo.

> **Empieza leyendo esto.** El proyecto estuvo abandonado un tiempo y se está
> recuperando por fases. Aquí está dónde estamos y qué reglas se aplican.
> El detalle vive en [`docs/AUDITORIA.md`](docs/AUDITORIA.md) (32 hallazgos con
> fichero y línea) y [`docs/PLAN-DE-TRABAJO.md`](docs/PLAN-DE-TRABAJO.md) (6 fases).

---

## Estado actual

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Recuperar el terreno: build, typecheck, tests | ✅ cerrada |
| 1.1 | Sesión verificada en el servidor | ✅ cerrada |
| 1.4 | Asignación masiva en perfiles | ✅ cerrada |
| 2.1 | Ciclo de vida de las preguntas | ✅ cerrada |
| 2.2 | Panel de estadísticas + Error Boundaries | ✅ cerrada |
| 2.3 | Métricas de comportamiento | ✅ cerrada |
| 2.4 | Un resultado por respuesta | ✅ cerrada (el histórico no existía: ver 2.8) |
| 2.6 | Indexado de PDFs | ✅ cerrada |
| **3** | **Calidad de la IA + memoria del chat** | ✅ **cerrada** |
| **1.3** | **Activar RLS** | ✅ **cerrada** (ejecutada el 26 ago 2026) |
| 1.2 | Acotar la clave de servicio | ⬜ ya desbloqueada: la 1.3 está hecha |
| **1.5 / 1.6** | **Cuota por usuario en IA · qué se manda a Gemini** | ✅ **cerradas** (la cuota, ya en la BD: regla 20) |
| **4** | **SRS, analítica e informe de la entrevista** | ✅ **cerrada en parte** |
| **2.7** | **Perfil físico y plan de entrenamiento** | ✅ **cerrada** |
| **5** | **Higiene** | ✅ **cerrada** (0 `any`, lint en 4 falsos positivos) |
| **2.8** | **Resultados a `question_attempts` + esquema versionado** | ✅ **cerrada** (26 ago 2026) |
| **2.5** | **Dificultad** | ✅ **cerrada** (la columna ya existía: `difficulty_level`) |
| **P1** | **Ingesta fiable del temario** (plan de producto) | ✅ **cerrada** (27 ago 2026) |
| — | **Despliegue** | ⬜ **no hay nada en producción** |

### Lo que solo puedes hacer tú

Los tres guiones de Supabase que estaban pendientes **ya están ejecutados** (RLS, cuota
de IA y `question_attempts`). Lo que queda necesita algo que no se puede hacer desde
aquí:

1. **Desplegar.** No hay nada en producción y el repo no tiene configuración de
   despliegue. Vercel es el camino natural: la aplicación son Server Actions de punta a
   punta, y Firebase Hosting a secas no las ejecuta (haría falta App Hosting). Hacen
   falta las cuatro variables de [`.env.example`](.env.example) y **añadir la URL
   resultante en Supabase → Authentication → URL Configuration**, o el login no
   funcionará.
2. **Login con Google**, si se quiere. Hoy el proveedor Google está *Disabled* y el
   código solo tiene email + contraseña. Hacen falta credenciales OAuth de Google Cloud
   pegadas en Supabase, y un botón `signInWithOAuth` en `app/page.tsx`.
3. **Hacer un test entrando como alumno.** Es lo único del flujo de resultados que no se
   ha probado encadenado desde la interfaz.

> **Cuidado con `Confirm email`:** está activado. Quien se registre no podrá entrar hasta
> pulsar el enlace del correo, y en el plan Free el envío es limitado.

**Verificado contra el Supabase real (26 ago 2026):** RLS cierra el acceso anónimo a las
21 tablas (comprobado con `curl` y la clave pública); `consume_ai_quota` corta a la
tercera llamada con límite 2; e `question_attempts` acepta el insert, resuelve el join
con `question_bank` y admite el update de `error_type`.

**Sin verificar:** el flujo completo desde la interfaz con una sesión de alumno. El punto
de más riesgo es el login, porque la sesión pasó de `localStorage` a cookies.
---

## Comandos

```bash
npm ci
cp .env.example .env.local     # las 4 variables son obligatorias: la app no arranca sin ellas
npm run dev

npm run check                  # typecheck + tests — pásalo ANTES de cada commit
npm run build                  # necesita las variables de entorno definidas
npm run lint                   # 3 errores, todos el mismo falso positivo (ver abajo)

node scripts/schema-snapshot.mjs   # refresca supabase/schema.json desde el proyecto real
node scripts/dump-migration.mjs    # regenera supabase/migrations/0001_esquema_actual.sql
```

Los 3 errores de `lint` son el mismo falso positivo de
`react-hooks/set-state-in-effect` en tres paneles de administración: la regla ve
el `setState` dentro de la función que el efecto llama, pero va **después** del
`await`. Retorcer el código para callarla sería peor que el aviso.

**`npm run dev` usa webpack, no Turbopack.** Turbopack infiere mal la raíz del proyecto
en modo desarrollo y se va al directorio padre, desde donde no resuelve el
`@import "tailwindcss"` de `app/globals.css`; la página no compila. `next build` no lo
sufre. Queda `npm run dev:turbo` para reintentarlo cuando lo arreglen aguas arriba.

Los dos guiones de esquema se apoyan en `public.__esquema_json()`, instalada en el
proyecto ([`docs/sql/2.6-funcion-volcado.sql`](docs/sql/2.6-funcion-volcado.sql)). Solo
lee catálogos y solo la alcanza la clave de servicio; así no hace falta la contraseña de
la base de datos que pediría `supabase db pull`.

---

## Reglas que salieron de los fallos encontrados

No son preferencias de estilo: cada una corresponde a un fallo real que llegó a
producción en este repo. Los tests de `tests/` las vigilan.

### 1 · Ninguna Server Action acepta un identificador de usuario

Una Server Action es un **endpoint HTTP público**. El `userId` sale siempre de
la cookie de sesión, nunca de un parámetro.

```ts
// MAL — así estaba: cualquiera podía leer los datos de cualquiera
export async function getUserStats(userId: string) { ... }

// BIEN
export async function getUserStats() {
  const auth = await requireUser();       // app/lib/auth.ts
  if (!auth.ok) return { success: false as const, error: auth.error };
  const userId = auth.user.id;
}
```

- `requireUser()` / `requireAdmin()` **devuelven un resultado, no lanzan**: las
  Server Actions redactan las excepciones en producción y el usuario vería un
  error genérico inútil.
- La verificación usa `auth.getUser()`, que valida el token contra Supabase.
  **`getSession()` no sirve**: lee la cookie sin comprobar la firma.
- La sesión vive en **cookies** (`@supabase/ssr`). Si alguien vuelve a meter
  `createClient` de `@supabase/supabase-js` en el navegador, la sesión se irá a
  `localStorage` y el servidor dejará de verla.

### 2 · Nunca expandir un objeto del cliente sobre una fila

```ts
// MAL — un user_id dentro de formData sobrescribe el del servidor
.upsert({ user_id: userId, ...formData })

// BIEN — lista blanca de campos (ver BIODATA_FIELDS, PHYSICAL_FIELDS)
```

### 3 · Los estados de una pregunta salen de una constante

`app/lib/questions.ts` → `QUESTION_STATUS`. Nada de literales `'active'` sueltos.
El fallo original fue exactamente ese: se escribía `'candidate'` en dos ficheros
y se leía `'active'` en otros dos, así que el banco nunca se servía.

| Estado | Significado |
|---|---|
| `candidate` | Generada en vivo. Se sirve a quien la pidió, pero no entra en el banco reutilizable hasta que un admin la revisa. |
| `active` | En el banco: reutilizable en los tests de cualquier alumno. |
| `disabled` | Descartada. No se sirve **ni se resucita al resembrar**. |

Todo `upsert` sobre `question_hash` lleva **`ignoreDuplicates: true`**. Sin eso,
la fila existente se reescribe: una pregunta aprobada volvía a `candidate` y una
descartada resucitaba en moderación.

### 4 · No tragarse los errores de la base de datos

```ts
// MAL — la UI daba por buena una escritura que había fallado
await supabase.from('x').update(...);
return { success: true };

// BIEN
const { error } = await supabase.from('x').update(...);
return { success: !error, error: error?.message };
```

Para uniones discriminadas, marca los literales: `success: true as const`.
Sin el `as const`, TypeScript infiere `boolean` y `if (res.success)` no estrecha
el tipo — así aparecieron 3 de los 7 errores de compilación originales.

### 5 · Nada de leer una columna sin comprobar que existe

`question_attempts` guarda `question_id`, no el enunciado. La UI pintaba
`item.question_text.replace(...)` y reventaba con un solo resultado guardado —
en **dos** módulos, incluido el de inicio. El enunciado se trae por **join**
(`getUserStats`), no desnormalizado: sin copias que se queden obsoletas si un admin
edita la pregunta. El nombre del tema sí viaja en la propia fila, en `topic`.

Y el join solo resuelve si la **clave ajena está declarada** en la base de datos.
`question_attempts.question_id -> question_bank.id` se declaró en la fase 2.8; antes de
eso PostgREST devolvía error y las estadísticas se quedaban sin enunciado.

Todo módulo va envuelto en `ModuleErrorBoundary`. Sin él, una excepción de render
deja la aplicación entera en blanco, porque todo el dashboard vive en una sola
ruta con pestañas y `app/error.tsx` solo cubre la ruta completa.

### 6 · El cliente habla camelCase, la base de datos snake_case

Y la traducción ocurre en **un solo sitio**: `toResultRow` en
`app/lib/exam-results.ts`. El fallo original: `ExamManager` enviaba
`response_time_ms` / `option_changes` y `saveExamResults` leía `r.time` /
`r.changes`. Como el parámetro era `any[]`, ambos lados compilaban tan tranquilos
y las dos métricas se guardaban a 0 en **todos** los exámenes.

Ninguna Server Action recibe `any[]`. Si un payload cruza la frontera
cliente-servidor, tiene un tipo compartido en `app/lib/`.

**`option_changes` cuenta cambios reales**, no pulsaciones: la primera respuesta
no cuenta y volver a marcar la misma tampoco. Ojo con los datos anteriores a la
fase 2.3 — la columna valía 0 en todas las filas, así que no hay histórico que
preservar.

### 7 · Una fila de `question_attempts` por respuesta

> La tabla de resultados es **`question_attempts`**, no `test_results` (fase 2.8).
> `test_results` sigue en pie y vacía; no la uses.

En entrenamiento se insertaba dos veces por cada fallo etiquetado (una al
responder y otra al diagnosticar), así que cada error contaba doble y el
porcentaje de acierto quedaba sesgado a la baja para siempre.

`saveTestResult` devuelve el **id** de la fila; `setResultErrorType` la
**actualiza**. Nada de un segundo insert. Y `handleErrorTag` espera al guardado
en vuelo antes de decidir: los botones de diagnóstico aparecen mientras el insert
viaja, y sin esa espera un clic rápido volvía a duplicar.

Se descartó el `upsert` sobre `(user_id, question_id, session_id)` que proponía
el plan: exige una columna y una restricción única que no existen, y además
colapsaría intentos legítimos de la misma pregunta en tests distintos.

**El tema viaja como TÍTULO en `topic`, no como `subject_id`.** `question_bank` guarda
`subject_id` y `question_attempts` guarda `topic`, así que cada pregunta se etiqueta con
su tema al cargarla: sin arrastrarlo, al terminar el examen ya no hay forma de saber a
qué tema pertenecía cada respuesta. Si entras por id, resuélvelo con `getSubjectNameById`
— guardar el número deja un `topic` que ninguna consulta encuentra.

### 8 · La aritmética que se muestra al alumno va en `app/lib/stats.ts`

Numerador y denominador de la misma muestra. El índice de incertidumbre sumaba
los cambios de las 5 últimas preguntas y dividía entre el total de hasta 100; el
"progreso al ascenso" usaba `winRate / (min + 20)` y nunca llegaba al 100 %.
Distingue siempre **"sin datos"** de **"cero"**: no son lo mismo para el alumno.

### 9 · El troceado de PDFs tiene tres garantías

`chunkLegalText` (`app/lib/text.ts`), vigiladas por tests:

1. **Nunca emite fragmentos vacíos.** Antes, un PDF que empezara por un párrafo
   largo producía `''` como primer fragmento, `embedContent('')` fallaba y el
   documento quedaba indexado a medias **sin avisar al administrador**.
2. **Ningún fragmento supera `maxChars`.** Se parten los párrafos largos, primero
   por frases y solo entonces con corte duro.
3. **El solape no se acumula:** se toma del contenido del fragmento anterior, no
   del fragmento ya solapado.

Y `uploadTopicPDF` distingue un indexado **completo** de uno **parcial**. Antes
pintaba el mismo `✅` en ambos casos y el fallo solo salía a la luz cuando el chat
no encontraba el artículo.

### 10 · Lo que devuelve el modelo no vale hasta que se comprueba

Los modelos van en **modo JSON con esquema** (`questionModel`, `flashcardModel`
en `core.ts`): el formato lo impone el SDK, no el prompt. La salida se lee con
`parseAIJson` y se valida con `validateGeneratedQuestion` / `validateFlashcard`
(`app/lib/ai-output.ts`) **antes de guardar nada**.

La regla que más importa: **un `correctIndex` fuera de rango descarta la
pregunta**. Antes se colapsaba en `'c'` en silencio y el alumno estudiaba un
dato falso. También se rechazan opciones repetidas o vacías, y enunciados vacíos.

`cleanAIResponse` se retiró: era un regex ciego que corrompía el contenido
cuando una cadena contenía `, }` o una llave. `parseAIJson` parsea de verdad,
respetando cadenas y escapes.

**El contexto que se manda al modelo se toma con `randomContextWindow`.** Las
flashcards usaban siempre `substring(0, 2500)` — los mismos 2500 caracteres del
mismo documento, así que repasar un tema daba tarjetas casi idénticas.

### 11 · En un chat con recuperación, la memoria empieza por la búsqueda

Meter el historial en el prompt no basta. `askAtenea` embebía solo la frase
actual, así que una repregunta —*"¿y qué plazo aplica en ese caso?"*— no
recuperaba **nada** del temario: el prompt tenía contexto pero el buscador no.

`buildRetrievalQuery` (`app/lib/chat.ts`) antepone la pregunta anterior cuando
la actual depende de ella, y la deja tal cual cuando se sostiene sola —
arrastrar contexto de más mete ruido si el alumno cambia de tema.

Es una **heurística a propósito**, no una llamada extra al modelo: reescribir la
pregunta con la IA costaría una petición de pago por cada mensaje.

### 12 · El intervalo de repaso depende solo de la caja

`BOX_INTERVALS` en `app/lib/srs.ts`: `[1, 3, 7, 15, 30]` días, indexado por
`box - 1`. Antes cada valoración calculaba su intervalo por separado, y de ahí
venían tres rarezas: "Duda" y "Bien" daban lo mismo desde la caja 1, "Duda"
nunca movía de caja (tarjeta atascada de por vida) y desde la caja 5 se saltaba
de 3 a 30 días de golpe.

**"Duda" baja una caja.** Fallar vuelve a la 1, acertar sube una. Nada más.

### 13 · Un `setState` no se puede leer en la línea siguiente

El actualizador de `setState` **no se ejecuta de forma síncrona**. En
`InterviewRoom` el historial se lleva además en un `historyRef` que se actualiza
a la vez; leer el estado justo después de llamarlo devolvía el valor anterior y
se perdían turnos de la conversación.

Mismo motivo por el que el contador de cambios de opción vive en un ref
(regla 6) y por el que el transcripción del micro se lee de `transcriptRef`.

**Las capacidades del navegador no son estado de React.** El soporte de
reconocimiento de voz se lee con `useSyncExternalStore`, no dentro de un efecto:
así no hay render en cascada ni desajuste de hidratación.

### 14 · El tiempo sale del reloj, no de contar intervalos

`setInterval(1000)` no es exacto: se retrasa con la pestaña en segundo plano,
con la carga del móvil y con el ahorro de batería. El cronómetro restaba 1 en
cada tick, así que en el test de Cooper (12 minutos) el desfase se acumulaba y
**el alumno medía mal su marca**. Ahora el intervalo solo decide cada cuánto se
repinta; el tiempo se deriva de marcas de reloj (`app/lib/timer.ts`).

Dos cosas más de ese componente, por si vuelven:

- **Un solo `AudioContext`**, reutilizado y cerrado al desmontar. Se creaba uno
  por pitido: en los últimos 10 segundos se llama una vez por segundo y el
  navegador limita los contextos simultáneos, así que el audio se apagaba justo
  en el tramo que más importa.
- **Nada de efectos dentro del actualizador de `setState`.** `speak`, `playBeep`
  y `onFinish` vivían dentro de `setTime(prev => ...)`, que debe ser puro: en
  StrictMode se ejecuta dos veces y sonaba todo por duplicado.

Y cuando un valor se puede **derivar**, se deriva: `finished` y `running` salen
del tiempo en vez de guardarse, lo que elimina de raíz el `setState` dentro del
efecto que vigila el reloj.

### 15 · Barajar es Fisher-Yates, nunca `sort(() => Math.random() - 0.5)`

`shuffle` en `app/lib/questions.ts`. El comparador aleatorio es inconsistente y
el resultado depende del algoritmo de ordenación del motor: unas posiciones
salen mucho más que otras, así que el alumno veía siempre las mismas preguntas.

### 16 · Un campo en blanco es `null`, nunca `0`

`Number('')` es `0`. Un `<input type="number">` devuelve **cadenas**, y `''` cuando el
alumno deja el campo vacío. Así llegaba `"180"` a una columna numérica, y `0` donde no
había dato: 0 cm de altura, 0 dominadas para quien aún no ha hecho el test.

`toNumberOrNull` (`app/lib/physical.ts`) es la única conversión. Y se aplica **también en
el servidor**: una Server Action es un endpoint público, así que normalizar solo en el
formulario no basta.

El mismo error, en su versión más cara: confirmar una prueba física con el campo vacío
guardaba `Number('') === 0`, el hub daba la prueba por superada y el plan de entrenamiento
salía de una marca que el alumno nunca hizo.

### 17 · Lo que escribe la IA se normaliza al guardarlo **y al releerlo**

El plan semanal lo escribe Gemini y lo lee la UI: exactamente el payload de la regla 6.
`normalizePlan` (`app/lib/training-plan.ts`) garantiza que `exercises` sea siempre un
array y compone un `title` si el modelo no lo manda — la UI lo pintaba en tres sitios y el
prompt nunca lo pedía.

Se normaliza también **al leer de la base de datos**, no solo al escribir: hay filas
anteriores a la fase 2.7 guardadas sin esas garantías. Una validación que solo corre en la
escritura deja desprotegido todo el histórico.

`PLAN_SHAPE` (la estructura que se le pide al modelo) vive en el mismo fichero que el
tipo. Separarlos es cómo el prompt acabó pidiendo unos campos y la UI leyendo otros.

### 18 · La progresión del entrenamiento decide antes de preguntarle a la IA

`decideProgression` (`app/lib/training-plan.ts`) resuelve en código si la semana
siguiente sube, mantiene, baja o se repite; el modelo solo redacta el plan. **El
orden de las reglas importa y no es negociable:** una molestia declarada manda
sobre cualquier RPE, y no haber terminado la semana manda sobre haberla
encontrado fácil. Sin esa precedencia, un alumno que completó dos de cinco días
"porque le dolía el hombro" recibiría *más* carga sobre la zona que le duele.

La media de esfuerzo cuenta **solo los días que traen dato** (regla 8). Contar
como 0 los que no lo traen la hunde, y la semana siguiente sale más fácil de lo
que toca.

Y ojo con `Object.entries` sobre algo que no has comprobado que es un objeto:
`Object.entries('texto')` enumera los **caracteres**. Un `feedback` corrupto
generaba una anotación por letra, y eso acababa dentro del prompt.

### 19 · Lo que sale hacia el modelo es una lista blanca, nunca la fila

`processInterviewTurn` hacía `JSON.stringify(biodata)`: la fila **entera** de la base de
datos, en cada turno. Ahí van el `user_id`, las columnas internas, las 30 respuestas del
psicotécnico y `legal_issues` — el texto libre donde el aspirante escribe sus antecedentes,
con un *"sinceridad absoluta obligatoria"* encima del campo.

`buildInterviewProfile` y `buildCoachProfile` construyen lo que viaja. Dos consecuencias
que importan más que el ahorro de tokens:

1. **Un campo nuevo en la tabla ya no sale solo.** Con la fila entera, cualquier columna que
   se añadiera empezaba a salir del sistema sin que nadie lo decidiera.
2. **Los antecedentes no salen en texto.** Va un derivado de tres estados: *sin declarar* /
   *declara no tener* / *declara incidencias, pregunta por ellas*. El simulador necesita
   saber que hay algo que preguntar, no qué es.

El nombre de la variable es parte de la guarda: `biodata` es la fila y no sale de la acción;
`promptProfile` es lo único que viaja. Un test estático prohíbe
`JSON.stringify(biodata|profile|data|row)` en las acciones.

Y en la pantalla de biodata hay un aviso de qué sale de ahí. El alumno tiene derecho a
saberlo **antes** de escribirlo.

### 20 · La cuota de IA es por usuario y por ruta, y la lleva la base de datos

`app/lib/rate-limit.ts`. Tres decisiones:

- **Por usuario**, no global: un contador compartido dejaría sin servicio a todos los
  alumnos porque uno esté activo. Es peor fallo que no tener cuota.
- **Por ruta**: agotar el chat no puede dejar al alumno sin flashcards.
- **En la base de datos**, con `consume_ai_quota` (`docs/sql/1.4-cuota-ia.sql`). Una sola
  sentencia atómica: dos peticiones simultáneas del mismo usuario no pueden leer el mismo
  contador y escribir ambas. En memoria no bastaba — con varias instancias el límite real
  se multiplicaba por el número de instancias vivas, y cada llamada a Gemini se paga.

**El contador en memoria se queda como respaldo**, y se consume siempre, también cuando
la base de datos responde: es lo que sostiene el límite si la BD deja de contestar a
mitad de una ventana. Contar de más ahí es justo lo que se busca. Si la consulta falla,
se registra y se cae al de memoria; nunca se deja la acción sin límite.

El import de `actions/core` dentro de `rate-limit.ts` es **dinámico** a propósito: ese
módulo es `server-only` y arrastra el cliente de Gemini, así que cargarlo arriba obligaría
a tener entorno de servidor solo para importar la aritmética de cuotas.

`checkQuota` es **`async`**. Y ojo: **sin
`await` la comprobación no falla, deja pasar todo** — el resultado es una promesa y `.ok`
es `undefined`. Hay una guarda estática que lo vigila, y otra que recorre las acciones
siguiendo la cadena de llamadas, porque en `exams.ts` el modelo se invoca desde un ayudante
privado.

### 21 · La lógica pura vive en `app/lib/`, no dentro de las acciones

`core.ts` construye clientes en tiempo de importación, así que nada de lo que
esté ahí se puede testear. Lo puro (texto, SRS, mapeo de preguntas) está en
`app/lib/` y las acciones lo importan.

---

## Los tests

```
tests/text.test.ts              limpieza de respuestas IA, texto legal, troceado de PDF
tests/srs.test.ts               repetición espaciada (Leitner)
tests/questions.test.ts         mapeo BD/IA → UI, puntuación de examen
tests/actions-auth.test.ts      guardas estáticas sobre las 37 Server Actions
tests/question-lifecycle.test.ts ciclo de vida de las preguntas
tests/stats.test.ts             agregación de resultados, rangos, perfil físico
tests/render-safety.test.ts     lecturas sin proteger, aislamiento de módulos y ausencia de `any`
tests/exam-results.test.ts      contrato de resultados cliente↔servidor
tests/single-result.test.ts     una fila por respuesta, sin doble inserción
tests/ai-output.test.ts         parseo y validación de lo que devuelve el modelo
tests/chat.test.ts              memoria del chat y reconstrucción de la búsqueda
tests/interview.test.ts         transcripción, informe final y máquina de estados
tests/timer.test.ts             cronómetro de las pruebas físicas
tests/physical.test.ts          perfil físico: normalización y guardas del entrenador
tests/training-plan.test.ts     forma del plan semanal, progreso y progresión a la siguiente
tests/rate-limit.test.ts        cuota de IA por usuario y ruta, y sus guardas estáticas
tests/schema-drift.test.ts      el código no escribe NI PIDE columnas que no existen
```

**`schema-drift` es el guardián más importante de la lista.** Compara contra
`supabase/schema.json` las columnas que el código escribe, las que pide en cada
`select` (joins anidados incluidos), los filtros `.eq`/`.in` y las listas blancas
`BIODATA_FIELDS` y `PHYSICAL_FIELDS`. Existe porque el esquema vivía solo
dentro de Supabase y el código derivó sin que nada lo cantara: `test_results` recibía
`subject_id` y `error_type`, y `flashcard_progress` recibía `subject_id`. Ninguna de las
tres columnas existe. **PostgREST rechaza la escritura entera si una sola columna no
existe**, y el error solo se registraba en consola, así que ni un resultado de test ni un
repaso llegaron a guardarse nunca.

`.github/workflows/check.yml` ejecuta `npm run check` en cada push. Las guardas
estáticas solo sirven si corren solas: depender de que alguien se acuerde de
lanzarlas es lo mismo que no tenerlas. El `build` no está en CI a propósito —
`core.ts` construye los clientes al importarse, así que el prerender exige las
cuatro variables reales.

`srs.test.ts` cubre la repetición espaciada; el resto de la tabla sigue igual.

**Dos convenciones importantes:**

1. **Los tests marcados `BUG:` describen el comportamiento *actual*, no el
   deseado.** Al corregir ese fallo, el test **debe** fallar: se invierte la
   aserción y se le quita el prefijo. Es el aviso de que el arreglo surtió efecto.
   Ya se invirtieron todos: troceado (2.6), parseo de la IA (3) y repetición
   espaciada (4). No queda ninguno marcado `BUG:`.

2. **Los tests estáticos leen el código fuente** y fallan si vuelve un patrón
   peligroso. No necesitan Supabase. Si añades uno, recuerda quitar los
   comentarios antes de analizar (`stripComments`): un comentario que *cita* el
   patrón para explicarlo cuenta como si fuera código — pasó y costó un rato.

Cuando toques algo cubierto por un test estático, compruébalo **rompiéndolo a
propósito** y viendo que el test lo señala. Un guardián que no muerde no sirve.

**Lo estático no lo ve todo.** `schema-drift` compara nombres; no ve los tipos, ni los
`NOT NULL`, ni si una clave ajena está declarada (sin ella PostgREST no resuelve el
join). Para eso está `npm run smoke`, que inserta una fila de verdad por cada camino de
escritura y la borra. Los dos se complementan: el primero corre en CI sin credenciales,
el segundo necesita el proyecto real.

---

## Mapa del código

```
app/
  actions/          Server Actions. Una por dominio + core.ts (clientes) e index.ts (barril).
                    core.ts NO se reexporta al cliente: rompería la serialización.
  lib/              Lógica pura y testeable + auth.ts + supabase/{server,client}.ts
  components/
    Admin/          Panel de administración (usuarios, temario, banco, moderación, logs)
    student/        Dashboard del alumno: 7 módulos en modules/
docs/               Auditoría y plan de trabajo
tests/              Vitest
```

**El esquema de la base de datos NO está en el repositorio.** Vive solo dentro
del proyecto de Supabase. Sacarlo con `supabase db pull` a `supabase/migrations/`
sigue siendo la tarea pendiente con más riesgo de pérdida y coste cero.

---

## Trampas conocidas

- **`npm run build` necesita las 4 variables de entorno.** `core.ts` lanza en
  tiempo de importación si falta alguna, y `page.tsx` crea el cliente en el
  módulo, así que el prerender falla.
- **Ya no quedan `any` en `app/`, y hay un test que lo vigila.** Eran la razón por
  la que los desajustes de nombres de campo llegaban a producción sin que nadie se
  enterara, y no era teoría: al ponerles un tipo de verdad salieron solos tres
  campos que llevaban meses pintándose y no existen — `u.total_tests` y
  `u.win_rate` (siempre "0" y "0%" en el panel de usuarios), `q.difficulty` (la
  columna es `difficulty_level`) y `q.topic` sobre `question_bank` (la tabla
  guarda `subject_id`).
- **El orden de la fase 1 está invertido respecto al plan.** La 1.3 (activar RLS)
  fue antes que la 1.2 (acotar la clave de servicio), por lo explicado arriba.
- **Un error de escritura de Supabase no se ve en pantalla.** Se registra en consola y
  la acción devuelve `success: false`, pero si la UI no lo cuenta, el alumno cree que
  guardó. Así estuvieron rotos meses el guardado de tests y el de repasos. Cuando algo
  "no se guarda", mira el log del servidor antes que el navegador.
- **Los ficheros de `docs/sql/` se escribieron deduciendo el esquema del código.** Los
  ejecutados ya están corregidos contra la base de datos real, pero si escribes uno
  nuevo, contrástalo con `supabase/schema.json` antes. Los tres primeros nombraban
  columnas y tablas que no existían.
- **`getUserStats` hace un join que necesita la FK declarada.** PostgREST no resuelve
  un join sin ella. `question_attempts.question_id -> question_bank.id` se declaró en la
  fase 2.8. El respaldo que degrada a consulta plana sigue ahí como red.
- **Los comentarios del código mienten a veces.** El del seed decía "asumimos
  activas" justo encima de `status: 'candidate'`. Fíate del código, no del
  comentario, y corrige el comentario cuando lo veas.

---

## Cómo continuar

1. **Hacer un test completo entrando como alumno.** Es lo único del flujo de resultados
   que no se ha podido probar encadenado: hace falta una sesión de verdad. Comprobar que
   `question_attempts` recibe la fila con `response_time_ms` y `option_changes` distintos
   de 0, que Inicio y Estadísticas cargan, y que fallar una pregunta en entrenamiento y
   etiquetar el error deja **una** sola fila con su `error_type`. Las tres operaciones
   están verificadas por separado contra la base de datos real (insert, join y update),
   pero no encadenadas desde la interfaz.

   De la 2.7: rellenar el perfil físico y comprobar que `profiles_physical` guarda
   `height` y `weight` como **números** y no como cadenas; dejar un campo en blanco debe
   dejar `null`, no `0`. Generar un plan y mirar que las tarjetas del panel tienen título.

2. **Desplegar.** No hay nada en producción. Ver *Lo que solo puedes hacer tú*, arriba.

3. **Fase 1.2** (acotar la clave de servicio). **Ya está desbloqueada:** su condición era
   tener RLS activa, y lo está desde el 26 ago 2026. Cada consulta que se mueva al
   cliente del usuario queda cubierta desde el primer momento.

4. **Retirar `test_results`** cuando lleve un tiempo confirmado que nadie la lee.

**Antes de tocar cualquier tabla, mira `supabase/schema.json`.** Es el esquema real,
volcado del proyecto. Casi todos los fallos graves de este repo han sido el código
escribiendo columnas que no existen, y PostgREST rechaza la escritura **entera** cuando
eso pasa. Para refrescarlo: `node scripts/schema-snapshot.mjs`.
Al cerrar una fase: actualiza la tabla de estado de este fichero, marca la fase
en `docs/PLAN-DE-TRABAJO.md` y el hallazgo en `docs/AUDITORIA.md`.

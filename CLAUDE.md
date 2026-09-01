# Atenea Policial — guía para trabajar en este repo

Plataforma de preparación de oposiciones a Policía Nacional (CNP).
Next.js 16 (App Router) · React 19 · Supabase · Google Gemini · Tailwind 4.

> **Si retomas después de un tiempo, empieza por
> [`docs/TRASPASO.md`](docs/TRASPASO.md).** Es el estado del 30 ago 2026: qué se
> hizo, qué está sin ver funcionando y qué está bloqueado esperando SQL.

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
| **1.2** | **Acotar la clave de servicio** | ✅ **cerrada** (31 ago): lo del alumno va con su sesión |
| **1.5 / 1.6** | **Cuota por usuario en IA · qué se manda a Gemini** | ✅ **cerradas** (la cuota, ya en la BD: regla 20) |
| **4** | **SRS, analítica e informe de la entrevista** | ✅ **cerrada en parte** |
| **2.7** | **Perfil físico y plan de entrenamiento** | ✅ **cerrada** |
| **5** | **Higiene** | ✅ **cerrada** (0 `any`, lint en 4 falsos positivos) |
| **2.8** | **Resultados a `question_attempts` + esquema versionado** | ✅ **cerrada** (26 ago 2026) |
| **2.5** | **Dificultad** | ✅ **cerrada** (la columna ya existía: `difficulty_level`) |
| **P1** | **Ingesta fiable del temario** (plan de producto) | ✅ **cerrada** (27 ago 2026) |
| **P3** | **La pantalla del test** (plan de producto) | ✅ **cerrada, 8 de 8** (31 ago) |
| **P2** | **Escribir preguntas a mano** (plan de producto) | ✅ **cerrada** (30 ago) |
| **P4** | **Módulos que se encienden y se apagan** (plan de producto) | ✅ **cerrada** (31 ago) |
| — | **Repaso de lo fallado** | ✅ **hecho** (30 ago) |
| — | **El chat: prompt, documento entero y selector de tema** | ✅ **hecho** (31 ago) |
| **P5** | **Panel de academia** (plan de producto) | ✅ **cerrada en parte** (31 ago) |
| — | **Despliegue** | ✅ **en producción**: https://atenea-eight.vercel.app |

## Producción

**https://atenea-eight.vercel.app** — proyecto `atenea` en Vercel, conectado a
`gaepmalaga/atenea`. Cada push a `main` despliega solo.

El 30 ago se corrigió lo que impedía entrar: **Supabase tenía la Site URL apuntando a
`http://localhost:3000` y ninguna Redirect URL**. Ahora la Site URL es la de producción
y hay dos Redirect URLs (producción y localhost, para que el desarrollo local siga
funcionando).

> **Hay un proyecto duplicado en Vercel**, `atenea-jw3h`, apuntando al mismo repositorio.
> Despliega en paralelo y no molesta, pero conviene borrarlo para no tener dos URLs
> vivas de lo mismo. Es tu decisión: borrar un proyecto no se puede deshacer.

### Lo que solo puedes hacer tú

Los tres guiones de Supabase que estaban pendientes **ya están ejecutados** (RLS, cuota
de IA y `question_attempts`). Lo que queda necesita algo que no se puede hacer desde
aquí:

1. **Ejecutar SQL. Ya no hay nada pendiente:** los guiones de P3.7 (`legal_reference`
   en `question_bank`) y P3.8 (tabla `question_notes` con RLS) se ejecutaron el
   **31 ago 2026** y están comprobados contra la base de datos real con `npm run smoke`.
   Los ficheros siguen en `docs/sql/` y son idempotentes. Cuando aparezca uno nuevo,
   la regla no cambia: **no se escribe el código antes** de que exista la columna —
   PostgREST rechaza la escritura *entera* si falta una sola.
2. **Login con Google**, si se quiere. Hoy el proveedor Google está *Disabled* y el
   código solo tiene email + contraseña. Hacen falta credenciales OAuth de Google Cloud
   pegadas en Supabase, y un botón `signInWithOAuth` en `app/page.tsx`.
3. **Entrar como alumno y probar la pantalla del test.** Lo de P3 (blanco explícito,
   cuenta atrás, pantalla de revisión) y el repaso de fallos están cubiertos por tests y
   el build pasa, pero **no se han visto funcionando en pantalla**: hace falta una
   sesión, y una sesión pide contraseña.

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

npm run chat:probar                # QUE RESPONDE el chat, preguntándole de verdad (de pago)
npm run chat:probar -- --tema=39   # lo mismo con el desplegable de tema puesto
node scripts/medir-contexto.mjs    # cuánto ocupa el temario y si cabe entero en el modelo (de pago)
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

### 22 · La nota del simulacro es la de la convocatoria, no el porcentaje

`scoreExam` calculaba `aciertos / total`. En la oposición a Policía Nacional los
fallos **restan**, así que esa nota mentía **hacia arriba**: 60 aciertos y 40
fallos se pintaban como un 60 % cuando la nota real es un **4**. En una
plataforma de oposiciones es el peor fallo posible, porque no se nota hasta que
ya no tiene remedio.

La fórmula sale del BOE de la convocatoria, no de memoria
([BOE-A-2026-15055](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-15055),
primera prueba): `[A − E/(n−1)] × 10/P`. Con n = 3, **cada dos fallos se pierde
un acierto**, y el mínimo para superarla es **3**.

Vive en `app/lib/scoring.ts` con las reglas en un **objeto** (`CNP_SCORING`), no
en tres constantes sueltas: la fórmula cambia entre convocatorias y entre
escalas, y poder pasar otras reglas es lo único que evita reescribirlo el día que
cambie el número.

**Un blanco NO es un fallo.** Antes se calculaba `wrong = total - correct`, así
que lo que el alumno dejaba a propósito sin contestar contaba como error. Con
penalización eso le restaría nota por **no** arriesgar, que es lo contrario de lo
que dice la convocatoria: las respuestas en blanco no aparecen en la fórmula.

Y el efecto de segundo orden importa tanto como el número: como no penalizaba,
contestar a todo siempre salía a cuenta. La plataforma **enseñaba una estrategia
equivocada**, y por eso la pantalla de resultados dice en palabras lo que ha
costado cada fallo.

### 23 · Las métricas de una pregunta se acumulan, no se reinician

Desde que se puede volver atrás en el simulacro, una pregunta se visita varias
veces. `startTimeRef` se reiniciaba en un efecto sobre `[currentIndex]`, así que
revisar una respuesta al final borraba el tiempo que costó la primera vez.

`metricasRef` (`ActiveTest`) es un **mapa por pregunta** que suma tiempo y
cambios de todas las visitas, y el volcado a `timeMs`/`changes` se hace **al
terminar**, para todas, desde ese mapa. Escribirlo al pasar de pregunta dejaba la
revisada con los datos de la última visita.

El cronómetro tampoco se reinicia ya en un efecto: lo lleva `irA`, que es quien
sabe qué pregunta se deja y cuál se abre. Un efecto no puede, porque cuando corre
el índice **ya** ha cambiado y la cuenta anterior se ha perdido.

### 24 · Un blanco no es un fallo, y se distingue con `selected_index`

La nota ya trataba el blanco como neutro (regla 22), pero al **guardar** caía en
`is_correct: false`. El mismo examen daba dos verdades: la nota decía una cosa y
las estadísticas otra, y el porcentaje de acierto castigaba no arriesgar — al
revés de lo que enseña la fórmula del BOE.

`selected_index` llevaba declarada desde siempre y **nadie la escribía**. Ahora
tiene tres estados, y los tres importan:

| valor | significado |
|---|---|
| `0`, `1`, `2` … | la opción que marcó |
| `-1` (`BLANK_INDEX`) | la dejó en blanco **a propósito** |
| `null` | no se sabe: fila anterior a esto |

**El tercero es la razón de no leer `null` como "en blanco"**, que era la lectura
tentadora: la columna estaba vacía también en las contestadas, así que cada fallo
del histórico se habría leído como un blanco. Un discriminante que confunde el
pasado con el presente es peor que ninguno.

`isBlankAnswer` (`app/lib/exam-results.ts`) es la única comparación con el
centinela. Repartirlo por los módulos que leen resultados es cómo se olvida la
mitad de los sitios.

Y `toResultRow` **fuerza `is_correct: false` en un blanco** diga lo que diga
quien llame: `saveExamResults` es un endpoint público e `isCorrect` viaja desde
el navegador.

Consecuencia en las estadísticas: `winRate` se calcula sobre **las contestadas**,
no sobre el total. Quien lo pinte tiene que usar `answered` como denominador —
poner `total` ahí es numerador y denominador de muestras distintas (regla 8), y
ya pasó una vez en `StatsPanel`.

### 25 · La duración del simulacro sale del BOE, y el reloj se deriva

El «Simulacro real» decía tener cronómetro pero contaba **hacia arriba** y no
terminaba nunca. La mitad de la dificultad del examen es que el tiempo se acaba.

`CNP_SCORING.secondsPerQuestion` = 30, de las 100 preguntas en 50 minutos de la
convocatoria. Se guarda **por pregunta** y no como duración total: así un
simulacro de 20 dura 10 minutos y es comparable con el examen real. Y se cuenta
sobre las preguntas **realmente cargadas**, no las pedidas — si el banco sólo dio
12 de 20, dar 10 minutos es regalar tiempo.

Los avisos son **porcentajes** (20 % y 5 %), no minutos fijos: en un test de 5
preguntas, que dura 2:30, «quedan 5 minutos» no significa nada.

`examClock` es puro y el estado del reloj se **deriva** de `ahora`; no se guarda
(regla 14). Y la entrega automática lleva `entregadoRef`, que no es defensivo de
más: en StrictMode los efectos corren dos veces y el intervalo sigue repintando
después de expirar, así que sin él `saveExamResults` insertaría las filas
repetidas — la doble inserción de la 2.4 por otra puerta.

### 26 · Entregar no puede estar a un clic de avanzar

En la última pregunta, «SIGUIENTE» entregaba el examen. Irreversible, en el mismo
sitio y con el mismo aspecto que el botón que llevabas veinte preguntas pulsando.

Ahora la última lleva al resumen —lo que Moodle llama «Terminar intento»— y el
botón dice **REVISAR**: llamar «finalizar» a lo que abre una revisión es mentir
sobre lo que hace el botón. La entrega **por tiempo agotado** sí es directa, igual
que en un tribunal.

Vale como regla general de esta pantalla: **una acción irreversible no comparte
sitio, color ni etiqueta con la que se repite veinte veces.**

### 27 · Lo que entra a mano se valida igual que lo que escribe la IA

El alta manual y la importación desde Excel (P2) pasan por
**`validateGeneratedQuestion`**, la misma función que filtra la salida del
modelo. No es reutilización por ahorrar: una persona escribiendo en una hoja de
cálculo se equivoca igual que Gemini —opciones repetidas, una celda vacía, la
correcta mal marcada— y lo que le pasa al alumno es idéntico (regla 10).

Se valida **también en el servidor**, aunque el CSV lo lea el navegador: una
Server Action es un endpoint público (regla 1).

Tres decisiones del importador que no son cosméticas:

- **Ninguna fila desaparece en silencio.** La que no sirve sale con su número de
  línea —el que se ve en Excel— y el motivo. Un importador que se traga treinta
  filas y dice «listo» es cómo se acaba con un banco incompleto sin enterarse.
- **La columna `correcta` admite `A/B/C` o `1/2/3`, y el `0` se RECHAZA.**
  Es tentador leerlo como la A (sería el índice interno), pero entonces el mismo
  fichero significaría cosas distintas según quién lo hubiera escrito. Ante la
  duda, la fila se rechaza y se dice por qué.
- **Excel exporta con punto y coma**, no con coma, y pone un BOM delante. El
  separador se detecta contando en la cabecera; sin eso el fichero entra como
  una sola columna con todo dentro.

Y la huella (`question_hash`) se calcula en **un solo sitio**,
`app/lib/question-hash.ts`. Estaba copiada dos veces dentro de `exams.ts` y
ahora hay tres caminos de escritura —vivo, siembra y alta a mano—: si uno la
calculase distinto, la misma pregunta entraría dos veces y el alumno se la
encontraría repetida en el mismo examen. Un test estático prohíbe `createHash(`
dentro de las acciones, y otro exige `ignoreDuplicates: true` en **todos** los
upsert sobre `question_hash` (antes solo miraba `exams.ts`).

De paso salió un tipo que mentía: `Question['origin']` decía
`'bank' | 'live_ai' | 'candidate'` mientras `seedQuestionBank` guardaba
`'bank_seed'`. Ahora es `QUESTION_ORIGIN`, una constante como la de los estados
(regla 3).

### 28 · El contexto con el que se genera una pregunta decide lo que se puede citar

`generateTestQuestion` tomaba **siempre** una ventana aleatoria de 12.000
caracteres de `documents.full_text`, y el corte caía donde caía: una pregunta
podía nacer de un trozo que empieza a mitad del artículo 11 y acaba a mitad del
12. Ahora `elegirContexto` prefiere un **fragmento**, que desde P1b es un
artículo y desde P1f trae su referencia de verdad. Mejoran dos cosas a la vez: la
pregunta se redacta sobre una unidad con sentido propio, y se puede guardar **de
qué artículo sale** (`question_bank.legal_reference`), que es lo que le dice al
alumno qué releer.

**El respaldo sobre `full_text` se queda, y no es decorativo:** unos apuntes no
tienen artículos —el tema 40 tiene 40 fragmentos y cero referencias— y un tema
recién subido puede no estar indexado. Sin él, esos temas no podrían generar ni
una pregunta.

**No se cargan los fragmentos del tema para elegir uno.** Se cuenta y se salta a
una posición al azar: la Constitución son ~200 KB por cada pregunta generada, y
sembrar son hasta 200 seguidas.

Y `legal_reference` a `null` significa **dos** cosas legítimas —pregunta anterior
a la columna, o pregunta que sale de apuntes— así que la pantalla no lo pinta en
vez de inventarse una. Adivinar la referencia sería peor que no tenerla: P1f ya
costó una tanda entera de referencias falsas, en la que el artículo 37 se citaba
como el 30.

### 29 · Una nota del alumno es suya, y por eso vive aparte

Las notas (P3.8) no van en `question_bank`, que es contenido compartido por todos
los alumnos, sino en `question_notes` con el par `(user_id, question_id)`, una
restricción única y RLS de propietario.

Tres cosas que no son obvias:

- **La aplicación entra con la clave de servicio, que salta RLS.** El
  `.eq('user_id', auth.user.id)` de cada consulta no es una red secundaria: es la
  única. Hay un test estático que exige que toda consulta a `question_notes`
  filtre o escriba el usuario de la sesión.
- **Vaciar el recuadro BORRA la nota.** La alternativa —una fila con la cadena
  vacía— deja un apunte en blanco colgando de la pregunta para siempre, y además
  `note` es `NOT NULL`.
- **La nota se carga al desplegar la tarjeta**, no al pintar la lista de fallos:
  son tantas consultas como preguntas abiertas, no como preguntas falladas.

### 30 · Hay preguntas del temario que la búsqueda semántica no puede responder

Un alumno preguntó **«¿cuántos artículos tiene la Constitución?»** y el chat
respondió *«no consta en el temario oficial aportado»*. Y era **verdad**:
ningún fragmento lo dice, porque el texto de una norma no se cuenta a sí mismo.
El buscador devolvía los artículos de reforma —lo más parecido a una pregunta
sobre «la Constitución» en abstracto— y el modelo hizo lo correcto con lo que
tenía.

> **Léela junto a la regla 33.** Lo que sigue se construyó antes de medir
> cuánto cabe en el modelo, y resultó ser **un rodeo para recuperar información
> que el troceado había destruido**. Sigue en pie y sigue siendo útil —el
> recuento es determinista y el artículo exacto no falla— pero ya **no es el
> camino principal**: el camino es mandar el documento entero. Antes de añadir
> aquí un cuarto rodeo, comprueba si el documento delante ya lo resuelve.

Pero **el dato sí estaba en la plataforma**: desde P1b cada fragmento sabe de
qué artículo viene. Lo que faltaba era llevarle ese recuento al modelo. Dos
caminos, los dos en `askAtenea`, y los dos van **en paralelo** con el embedding
porque no dependen de él:

- **`construyeIndice`**, cuando la pregunta es de estructura (`cuántos` +
  `artículos/títulos/disposiciones`). Entra como una fuente más, etiquetada
  **«recuento de lo indexado, no texto de la norma»**: el modelo tiene que poder
  decir de dónde sale el número.
- **`buscaArticulo`**, cuando la pregunta nombra un artículo. Traerlo por su
  referencia es exacto; confiar en que el embedding acierte con un número no lo
  es — «artículo 27» y «artículo 127» se parecen mucho más de lo que se parecen
  sus textos.

**Los huecos son la mitad de la función.** Si el troceado se dejó artículos por
el camino, el recuento no es el de la norma, es el de lo indexado: entonces el
índice avisa y el número se da como un **mínimo**. Dar el número redondo sería
el fallo de P1f otra vez — un dato falso dicho con seguridad.

**Y el temario no numera igual en todas partes.** No es una hipótesis: la
Constitución escribe *«Artículo 82»* y la LOFCS *«Artículo cuarenta y uno»*,
mezclando ordinales en los nueve primeros. Con el lector de cifras a secas, el
índice contaba **cero** artículos en la LOFCS y la describía como «no es un
texto legal articulado» — una ley de 54 artículos. `numeroDeArticulo` lee las
dos formas, y por eso `buscaArticulo` compara el número ya leído en vez de un
`ilike` sobre el texto de la referencia.

Medido contra la base de datos real: Constitución **169 artículos (1–169), sin
huecos**, más 15 disposiciones; LOFCS **54 (1–54), sin huecos**, más 18
disposiciones; el tema 40, apuntes, sin artículos — que es lo correcto.

### 31 · Apagar un módulo tiene que apagarlo también en el servidor

P4 salió de una respuesta concreta: **«lo suyo es que se pudiera apagar
cualquiera»**. Los ocho módulos tienen interruptor, Centro de Mando y
Estadísticas incluidos.

Filtrar el menú **no es la medida**: una Server Action es un endpoint HTTP
público, así que esconder el enlace no impide que nadie la llame — y las de IA
se pagan por llamada. `requireModule` (`app/lib/module-guard.ts`) corta dentro
de la acción, **después de comprobar la sesión y antes de tocar a Gemini o la
cuota**. Ese orden lo vigila un test: comprobar el módulo después de
`checkQuota` sería pagar la llamada de un módulo apagado.

Vive en `lib/` y no en `actions/` por una razón que ya costó una vez: un
fichero `'use server'` convierte en **endpoint público todo lo que exporta**,
así que `requireModule` ahí sería una Server Action más, sin sesión propia.
Es el mismo motivo por el que la aritmética de las cuotas vive en
`rate-limit.ts` (regla 20), y el import de `actions/core` es dinámico por lo
mismo.

**Sin fila = activo**, y esa decisión sostiene tres cosas a la vez:

- Ejecutar el guion de la tabla no apaga nada: nace vacía.
- Un módulo nuevo aparece **encendido** en vez de desaparecer en silencio el día
  que se añada al código y nadie inserte su fila.
- Si la lectura falla, se cae a todo encendido. **Un fallo de lectura no puede
  parecerse a un apagado deliberado**: dejaría al alumno sin plataforma sin que
  nadie lo haya decidido.

Y como se pueden apagar los ocho, «no queda ninguno» es un estado real: el
dashboard lo dice con palabras en vez de quedarse en blanco (regla 8).

**Lo que NO se hizo, a propósito:** el rol `superadmin` que preveía el plan. Con
una sola academia, el admin es el dueño, y un rol que no separa a nadie es
ceremonia. La columna `organization_id` sí está creada —y documentado en el
guion por qué **no** forma parte de la clave: en un `UNIQUE` de Postgres dos
`NULL` se consideran distintos, así que no impediría filas duplicadas.

### 32 · Un prompt que obliga a rellenar secciones produce respuestas absurdas

La misma pregunta de la regla 31 destapó algo peor que el dato que faltaba: la
respuesta decía *«no consta en el temario oficial aportado»* y **a continuación
pegaba seis citas** —[1] a [6]— para respaldar que no sabía nada, y después
cuatro «trampas de examen» sobre la reforma constitucional, que nadie había
preguntado. Todo eso lo **obligaba el prompt**:

| Norma del prompt viejo | Lo que producía |
|---|---|
| `CITAS OBLIGATORIAS` | seis citas detrás de un «no consta» |
| `CIERRE OBLIGATORIO` | las trampas de examen aunque no hubiera respondido |
| `TONO: Militar` | «ASPIRANTE, PROCEDO A ANALIZAR SU CONSULTA» |
| `ESTRUCTURA` fija | un dato de una línea servido como ficha de cuatrocientas palabras |

Ahora todo es **proporcional y condicional**: la respuesta en la primera línea,
la longitud la marca la pregunta, las citas solo si se usa la fuente, y el
cierre solo si hay una confusión real. Una sección de relleno no es neutra:
**enseña al alumno a saltársela**, y el día que traiga algo importante ya no la
lee.

**Y el índice cuenta artículos, no la estructura.** La siguiente pregunta del
alumno —*«¿cuántos títulos tiene la Constitución?»*— volvía a caer en «no
consta», porque `document_chunks.reference` guarda el **artículo** y nada más.
Los encabezados sí están en el texto guardado: `resumeEstructura` los cuenta y
el índice los sirve. Dos trampas, las dos vistas en el BOE de verdad:

- **El PDF trae su propio índice al principio**, así que cada encabezado sale
  dos veces. Contar apariciones daría el doble.
- **Los nombres de capítulo se repiten entre títulos** —hay un «CAPÍTULO
  PRIMERO» en el Título I, otro en el III y otro en el VIII—, así que se cuentan
  como pares título→capítulo. Contar nombres distintos daría 5 donde hay 11.

Y se dice **«un Preliminar y diez numerados»**, no «once títulos» a secas: el
dato es el mismo y decirlo mal es exactamente la confusión que pregunta el
tribunal. El texto completo (~120 KB por documento) solo se trae cuando la
pregunta va de títulos o capítulos; para contar artículos bastan las
referencias.

**El prompt vive en `app/lib/chat.ts` (`buildChatPrompt`), no dentro de la
acción.** No es purismo: es que así se puede probar contra el modelo de verdad
sin levantar la aplicación. Un prompt que solo se ejecuta en producción es un
prompt que nadie revisa — y este llevaba meses así, con todos los tests en
verde.

```bash
npm run chat:probar
npm run chat:probar -- "¿qué dice el artículo 27?"
```

Le pregunta **de verdad**, con el mismo camino de recuperación y el mismo
prompt que la aplicación. Cuesta dos llamadas de pago por pregunta, y por eso es
un guion aparte y no un test. Los tests de `chat.test.ts` vigilan otra cosa: que
las tres normas de la tabla no vuelvan a colarse.

Medido después del cambio, con las preguntas reales:

| Pregunta | Antes | Ahora |
|---|---|---|
| ¿Cuántos artículos tiene la Constitución? | «no consta» + 6 citas + 4 trampas | «tiene 169 artículos, del 1 al 169 y sin huecos, según el índice» (128 car.) |
| ¿Qué dice el artículo 27? | dependía de que el embedding acertara | distingue el 27 de la CE del 27 de la LOFCS, que está derogado |
| ¿Cuál es la capital de Francia? | ceremonia y protocolo | «No consta. Sí puedo decirte que la capital del Estado español es la villa de Madrid» |

### 33 · Se le enseña el documento entero, no seis recortes

La plataforma nació troceando el temario en fragmentos de mil caracteres y
mandándole al modelo los seis más parecidos a la pregunta. Eso era obligatorio
cuando un modelo aceptaba 8.000 tokens. **Ya no**, y esto está medido, no
supuesto (`node scripts/medir-contexto.mjs`):

| | tokens |
|---|---|
| Constitución completa | 35.009 |
| El temario entero (3 documentos) | 72.355 |
| Lo que admite `gemini-2.5-flash` | 1.048.576 |

El temario entero ocupa el **6,9 %** de la ventana. Y casi todo lo que se había
ido arreglando a mano —el recuento de artículos, la búsqueda del artículo
exacto, contar los títulos— eran **rodeos para recuperar información que el
troceado había destruido**. Con el documento delante, el modelo responde «el
Título I comprende los artículos 10 a 55» sin que nadie le prepare nada.

**Lo que se queda de la búsqueda semántica: elegir.** Los fragmentos siguen
siendo la forma barata de saber *de qué documento* habla la pregunta. Lo que
cambia es que, una vez elegido, se manda entero.

**Y elegir es ahora el punto débil, no el tamaño.** Con TRES documentos ya
fallaba: *«¿qué artículos comprende el Título I de la Constitución?»* seleccionaba
la Ley de Fuerzas y Cuerpos de Seguridad, porque sus fragmentos sobre títulos y
artículos se parecen más a esa frase que el articulado de la Constitución. La
pregunta lo decía y nadie la escuchaba. Por eso `documentosNombrados` va
**delante** del parecido: si el alumno nombra el tema, no se adivina. Con 85
temas eso deja de ser un fallo ocasional para ser la norma.

**Y la pieza que lo cierra: que el alumno elija tema.** El chat tiene un
desplegable, como ya lo tienen los tests. Si elige, se manda ESE documento
entero y no se paga ni el embedding: se acabo adivinar. Si no elige, decide el
buscador como hasta ahora. El temario ya tiene 45 temas dados de alta (3 con
PDF), asi que esto no es una precaucion para el futuro.

**Dos topes que separan «hoy funciona» de «seguirá funcionando»:**

- `MAX_CHARS_DOCUMENTOS` (150.000) y `MAX_DOCUMENTOS_ENTEROS` (2). Lo que no
  cabe **no se parte**: viaja en fragmentos, como antes. Partirlo sería volver
  al problema que esto quita.
- `MIN_SIMILITUD_DOCUMENTO`. A *«¿cuál es la capital de Francia?»* la búsqueda
  devuelve igualmente los fragmentos menos malos del temario; traerse la
  Constitución entera —35.000 tokens de pago— para acabar diciendo que no consta
  es tirar el dinero.

**El coste es real y hay que mirarlo:** una pregunta sobre la Constitución pasa
de ~3.000 a ~35.000 tokens de entrada. Lo que lo sostiene es que solo se manda
**el documento que hace falta**, nunca el temario entero, y que la cuota por
usuario y ruta ya existe (regla 20).

**Y con 85 temas el coste por pregunta NO crece.** Siguen haciendo falta uno o
dos documentos: lo que no escala es *adivinar cuál*, no el tamaño del temario.
Por eso `documentosNombrados` y el desplegable van por delante del parecido.

**Cómo se revisa todo esto**, sin levantar la aplicación y con el mismo prompt y
la misma recuperación que usa el alumno:

```bash
npm run chat:probar
npm run chat:probar -- --tema=39 "¿cuántos artículos tiene?"
node scripts/medir-contexto.mjs
```

Si algún día el selector de tema deja «todo el temario» sin uso, **la búsqueda
semántica sobra entera** —embeddings, fragmentos e índice— y el chat se queda en
tema + documento. Es mucho menos código, y ahora es una decisión que se puede
medir en vez de opinar.

### 34 · Con la clave de servicio, RLS no protege nada

La fase 1.3 activó las políticas. La 1.2 es la que hace que sirvan: mientras
toda la aplicación entrara con `supabaseAdmin` —que **salta RLS**— la única
barrera real era acordarse de escribir `.eq('user_id', …)` en cada consulta. Una
barrera que depende de acordarse no es una barrera.

Ahora hay dos mundos, y un test estático los mantiene separados:

| | Cliente | Por qué |
|---|---|---|
| Lo del alumno | `createSupabaseServerClient()` (su sesión) | Tienen política de propietario: Postgres impone lo que antes imponía el cuidado del programador |
| Lo compartido y lo de administración | `supabaseAdmin` | `question_bank`, `documents`, `subjects`… tienen RLS y **cero políticas**: con la sesión del alumno no devolverían nada |

Con la sesión van: `question_notes`, `profiles_physical`, `training_plans`,
`profiles_biodata`, `profiles_psych`, `flashcard_progress`, `flashcard_results`,
`question_votes` y el `insert` de `question_reports`. **Entrenamiento y perfilado
ya no importan la clave de servicio en absoluto.**

**El modo de fallo que hay que temer aquí no es un error, es el vacío.** Si se
lee con la sesión una tabla sin políticas, Postgres no protesta: devuelve cero
filas. La pantalla se queda en blanco y nadie sabe por qué. Por eso el test
vigila **las dos direcciones**, no solo una.

**`question_attempts` se quedó fuera a propósito.** Tiene políticas de INSERT y
SELECT pero **no de UPDATE**, y `setResultErrorType` actualiza: con la sesión, ese
update no fallaría, simplemente no tocaría ninguna fila, y el diagnóstico del
error del alumno se perdería en silencio — el fallo más caro de este repo otra
vez, por otra puerta. El guion que lo desbloquea está escrito y **sin ejecutar**:
[`docs/sql/1.2-attempts-update.sql`](docs/sql/1.2-attempts-update.sql).

Y una cosa que se aprendió al hacerlo: **hay accesos partidos en dos líneas**
(`await supabase` y `.from(...)` debajo). Un reemplazo literal no los ve y los
deja con la clave de servicio sin que nada lo cante. Cinco de training.ts se
salvaron por eso hasta que el analizador aprendió a mirar entre medias.

### 35 · El panel de la academia enseña lo accionable, no lo bonito

P5 salió de una frase del plan: *«un alumno que lleva dos semanas sin entrar es
el dato más accionable que hay en una academia, y hoy no se ve en ninguna
parte»*. La lista de usuarios que había daba nombre, rol, preguntas y acierto:
sirve para administrar cuentas, no para dar clase.

Tres decisiones que no son cosméticas:

- **La lista se ordena por urgencia, no por nombre.** Primero quien nunca entró,
  después los abandonados de más a menos tiempo fuera. Una lista alfabética
  obliga al profesor a leerla entera para encontrar lo único que iba a hacer con
  ella.
- **`null` no es `0`, y aquí menos que en ningún sitio** (regla 8): 0 % de
  acierto es un alumno que va mal; `null` es uno que no ha empezado. Se llama a
  personas distintas.
- **El acierto va sobre las CONTESTADAS** (regla 24). Con los blancos dentro, un
  alumno que va al 50 % y deja la mitad en blanco sale al 25 %, y el profesor
  llama a quien no debe.

**«Preguntas que falla casi todo el mundo» no es «las difíciles».** Con
suficientes intentos, una pregunta que casi nadie acierta suele estar mal
redactada o tener marcada la opción equivocada — es exactamente lo que pasó con
las 15 preguntas de Inteligencia que vivían dentro de Constitución. Por eso hay
un **mínimo de intentos**: sin él, la primera pregunta que alguien falle sale al
0 % y encabeza la lista para siempre.

**Todo el panel va con la clave de servicio, y ahí sí es lo correcto** (regla
34): un profesor mirando a sus alumnos no está cubierto por ninguna política de
propietario, así que con el cliente de la sesión vería una lista vacía. Lo que
lo protege es `requireAdmin`, y hay un test que lo exige para cada acción.

Medido contra la base de datos real el 31 ago: 43 de 45 temas **sin una sola
pregunta**, y el alumno con más actividad al 44 % — 30 % en Constitución y 67 %
en Inteligencia.

---

## Los tests

```
tests/text.test.ts              limpieza de respuestas IA, texto legal, troceado de PDF
tests/srs.test.ts               repetición espaciada (Leitner)
tests/questions.test.ts         mapeo BD/IA → UI, barajado y dificultad
tests/actions-auth.test.ts      guardas estáticas sobre las 43 Server Actions
tests/question-lifecycle.test.ts ciclo de vida de las preguntas
tests/stats.test.ts             agregación de resultados, rangos, perfil físico
tests/render-safety.test.ts     lecturas sin proteger, aislamiento de módulos y ausencia de `any`
tests/exam-results.test.ts      contrato cliente↔servidor, el blanco, reloj y revisión
tests/single-result.test.ts     una fila por respuesta, sin doble inserción
tests/ai-output.test.ts         parseo y validación de lo que devuelve el modelo
tests/chat.test.ts              memoria, prompt, índice, artículo exacto y qué documento se manda
tests/interview.test.ts         transcripción, informe final y máquina de estados
tests/timer.test.ts             cronómetro de las pruebas físicas
tests/physical.test.ts          perfil físico: normalización y guardas del entrenador
tests/training-plan.test.ts     forma del plan semanal, progreso y progresión a la siguiente
tests/rate-limit.test.ts        cuota de IA por usuario y ruta, y sus guardas estáticas
tests/documents.test.ts         visor de fragmentos: agrupación por artículo y resumen
tests/scoring.test.ts           la nota del examen (BOE) y el reloj del simulacro
tests/review.test.ts            repaso de lo fallado: agrupación y guardas
tests/question-import.test.ts   alta manual e importación CSV, y sus guardas
tests/notes.test.ts             notas privadas del alumno y sus guardas
tests/modules.test.ts           módulos encendidos/apagados y la guarda del servidor
tests/rls.test.ts               quién entra con la clave de servicio y quién con la sesión
tests/academy.test.ts           panel de academia: abandono, fichas y cobertura del temario
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
- **El esquema es el cuello de botella, no el código.** Varias cosas del plan están
  paradas porque necesitan una columna o una tabla, y el DDL solo lo puedes ejecutar
  tú desde el editor SQL de Supabase. Cuando algo se quede bloqueado por eso: deja el
  guion escrito en `docs/sql/` con el *por qué* dentro, y sigue por otra parte. Lo que
  **no** vale es escribir el código antes — PostgREST rechaza la escritura entera y
  rompe el guardado en producción.
- **Los comentarios del código mienten a veces.** El del seed decía "asumimos
  activas" justo encima de `status: 'candidate'`. Fíate del código, no del
  comentario, y corrige el comentario cuando lo veas.

---

## Cómo continuar

1. **El simulacro ya se ha probado entero desde la interfaz** (27 ago 2026, con sesión
   de alumno). `question_attempts` recibe la fila con `response_time_ms` y
   `option_changes` **distintos de 0** —2 cambios y 25.808 ms en una pregunta revisada
   dos veces—, y la nota con penalización sale bien.

   **Lo que sigue sin probarse encadenado:** el modo entrenamiento (que fallar una
   pregunta y etiquetar el error deje **una** sola fila con su `error_type`), que Inicio
   y Estadísticas cargan con datos, y todo lo de la 2.7: rellenar el perfil físico y
   comprobar que `profiles_physical` guarda `height` y `weight` como **números** y no
   como cadenas; dejar un campo en blanco debe dejar `null`, no `0`. Generar un plan y
   mirar que las tarjetas del panel tienen título.

   > Para verlo hace falta una sesión de alumno. La forma sin fricción es cambiar
   > `profiles.role` a `student` un momento con la clave de servicio y devolverlo a
   > `admin` al terminar.

   **Y lo de P3 tampoco se ha visto en pantalla** (30 ago): blanco explícito y tecla
   `0`, cuenta atrás con entrega automática, pantalla de revisión antes de entregar, y
   la pestaña nueva de **Repasar fallos**. Todo con tests y con el build en verde, pero
   verde no es lo mismo que visto. La consulta del repaso sí está comprobada contra la
   base de datos real: el join resuelve las 17 filas falladas con sus opciones.

2. **El chat se reescribió por dentro el 31 ago** (reglas 30, 32 y 33), y lo que
   queda de él son decisiones, no trabajo: si la búsqueda semántica sobra ahora que
   hay selector de tema, y si el coste por pregunta (~35.000 tokens con el documento
   entero) pide activar caché de contexto. Antes de tocar nada ahí, ejecuta
   `npm run chat:probar`: enseña lo que responde de verdad, que es lo único que
   destapó todos los fallos anteriores — los tests estaban en verde con el chat
   contestando disparates.

3. **P2 y P3 están hechas** (30–31 ago). De P2: botón *Nueva* en Banco Maestro,
   formulario de alta e importación desde CSV con vista previa y el detalle de lo
   rechazado. De P3, los dos puntos que faltaban: la referencia legal de la pregunta
   y las notas privadas del alumno. Lo que queda ahí es **verlo funcionando con una
   sesión**, y decidir si interesa que un mismo CSV traiga preguntas de varios temas
   (hoy el tema se elige una vez y vale para todo el fichero).

4. **Fase 1.2 está cerrada** (31 ago): las tablas del alumno van con el cliente de su
   sesión y RLS por fin protege de verdad (regla 34). Lo único que queda ahí es
   ejecutar [`1.2-attempts-update.sql`](docs/sql/1.2-attempts-update.sql) —la política
   de UPDATE que le falta a `question_attempts`— y mover entonces `saveTestResult` y
   `setResultErrorType`.

5. **Retirar `test_results`** cuando lleve un tiempo confirmado que nadie la lee.

**Antes de tocar cualquier tabla, mira `supabase/schema.json`.** Es el esquema real,
volcado del proyecto. Casi todos los fallos graves de este repo han sido el código
escribiendo columnas que no existen, y PostgREST rechaza la escritura **entera** cuando
eso pasa. Para refrescarlo: `node scripts/schema-snapshot.mjs`.
Al cerrar una fase: actualiza la tabla de estado de este fichero, marca la fase
en `docs/PLAN-DE-TRABAJO.md` y el hallazgo en `docs/AUDITORIA.md`.

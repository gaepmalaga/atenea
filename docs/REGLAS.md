# Las reglas, en detalle

Cada regla salió de un fallo real que llegó a producción en este repo. El
resumen de una línea de cada una está en [`CLAUDE.md`](../CLAUDE.md); aquí está
el porqué entero. **No hace falta leerlo de corrido:** busca la que toca
(`### 34 ·`, `### 74 ·`…) cuando trabajes en esa zona. El código cita «regla N»
en sus comentarios con esta misma numeración.

Al añadir una regla nueva: va al final con el número siguiente, y su línea de
resumen va en la tabla de `CLAUDE.md`.

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
> `test_results` se **retiró** (`docs/sql/retirar-tablas-en-desuso.sql`, junto con
> `exams`, `exam_questions` y `content_documents` — vacías y sin usar). Un test
> estático (`schema-drift`) impide que ningún `.from()` vuelva a nombrarlas.

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

> Con el temario completo (51 documentos) esto tiene un fleco nuevo: **el mismo
> número de artículo aparece en varias leyes** —el «Artículo 27» está en el
> Código Civil, la CE, Extranjería y el Código Penal— y `buscaArticulo` los
> trae todos. Que el modelo responda por el que encaja y no liste los cinco lo
> resuelve **el prompt**, no la recuperación (regla 32).

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
la longitud la marca la pregunta, las citas solo si se usa la fuente. Una
sección de relleno no es neutra: **enseña al alumno a saltársela**, y el día
que traiga algo importante ya no la lee.

**La «🎯 FOCO EXAMEN» se retiró del todo (5 sep 2026).** El «CIERRE OPCIONAL»
sonaba a mejora sobre el obligatorio, pero el modelo lo disparaba en casi toda
respuesta con relleno genérico —«identifica siempre el tema», «conoce los seis
principios»—: la misma clase de fallo, un escalón abajo. Si hay una confusión
de verdad con el contenido, va en una frase dentro de la respuesta.

**Dos flecos más, arreglados el 5 sep con el temario ya completo (51
documentos):**

- **Las citas mostraban «tema-02», «tema-09»** —el nombre del fichero desde que
  el temario está completo— y el modelo lo copiaba tal cual («según el
  tema-02…»). `resuelveTemas` (`actions/chat.ts`) pone el TÍTULO del tema en
  cada fuente antes del prompt; `citaDe` lo antepone al fichero. El prompt
  además prohíbe escribir el nombre del fichero.
- **Un número de artículo que está en varias leyes** —«¿qué dice el artículo
  27?» trae el 27 del Código Civil, la CE, Extranjería, el Código Penal…— hacía
  que el modelo listara las cinco. El prompt ahora manda responder por la que
  encaja con la pregunta y mencionar en una frase que el número existe en otras.

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

**Lo mismo vale para el prompt que ESCRIBE LAS PREGUNTAS** (4 sep). Estaba
dentro de `actions/exams.ts`, así que el prompt del que sale todo el banco solo
corría en producción. Ahora está en `app/lib/question-prompt.ts` junto al
esquema JSON del modelo —los dos tienen que cambiar a la vez, separarlos es
cómo el prompt acabó pidiendo unos campos y la UI leyendo otros— y lo usan las
dos vías: la Server Action y el guion de siembra masiva. Sin sacarlo habría
dos prompts, y dos prompts son dos preguntas distintas.

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
cuando un modelo aceptaba 8.000 tokens. Con TRES documentos dejó de serlo. Pero
el temario ya está **completo: 45 temas en 51 documentos**, y eso vuelve a
cambiar la cuenta (`node scripts/medir-contexto.mjs`, 5 sep 2026):

| | tokens |
|---|---|
| El temario entero (51 documentos) | 643.208 |
| Lo que admite `gemini-2.5-flash` | 1.048.576 |

El temario entero ya ocupa el **61 %** de la ventana: **«todo el temario» de
golpe ya no cabe**, y sería carísimo aunque cupiera. Así que el chat funciona en
dos modos:

- **Con tema elegido en el desplegable:** se mandan los documentos ENTEROS de
  ese tema (`documentosDelTema`), y no se paga ni el embedding. Un documento
  entero responde muchísimo mejor que seis recortes, y de un solo tema cabe de
  sobra.
- **Sin tema:** solo la búsqueda semántica en FRAGMENTOS (los 8 más parecidos,
  `match_document_chunks`), como funcionó siempre. Cuesta ~3.000 tokens. El
  desplegable avisa de que elegir tema afina la respuesta.

**El índice y el artículo buscado por su número van delante en los dos modos**
(`construyeIndice`, `buscaArticulo`): son coincidencias exactas y deterministas,
no parecidos, y no cuestan un documento entero. Siguen siendo lo que contesta
«¿cuántos artículos tiene la Constitución?» (regla 30).

**Código que ya no se usa pero se conserva a propósito:** `documentosNombrados`,
`documentosPorRelevancia`, `documentosQueCaben`, `MIN_SIMILITUD_DOCUMENTO`,
`MAX_DOCUMENTOS_ENTEROS` eran la maquinaria de elegir documentos por parecido y
mandarlos enteros SIN tema. Se apagó por coste (sin tema se pagaba el embedding
Y podían viajar dos documentos enteros — la opción cómoda era la más cara). Se
deja porque ahí está escrita, con tests, la lección de que si el alumno NOMBRA
el tema no se adivina — y es lo que habría que re-enchufar el día que se quiera
un modo «buscar en todo con el documento delante». Si se decide que ese día no
llega: **se borra**, empezando por `medir-contexto.mjs`, que aún prueba ese
camino muerto.

**Cómo se revisa**, con el mismo prompt y la misma recuperación que el alumno
(`probar-chat.mjs` se realineó con `askAtenea` el 5 sep — había divergido):

```bash
npm run chat:probar
npm run chat:probar -- --tema=39 "¿cuántos artículos tiene?"
```

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

**`question_attempts` ya va con la sesión** (6 sep 2026). Fue la última tabla
del alumno en salir de la clave de servicio, porque le faltaba la política de
UPDATE: `setResultErrorType` actualiza, y sin política ese update con la sesión
no fallaba —solo no tocaba ninguna fila, y el diagnóstico del error se perdía
en silencio, el fallo más caro de este repo—. `1.2-attempts-update.sql` (5 sep)
añadió la política, y `saveTestResult` / `setResultErrorType` /
`saveExamResults` (`exams.ts`) pasaron a `createSupabaseServerClient()`. Ahora
Postgres impone `auth.uid() = user_id` en las tres operaciones.

**Lo que SIGUE con la clave de servicio, y a propósito:** `getUserStats` y
`getFailedQuestions` (`user.ts`). Hacen join con `question_bank`, que no tiene
ninguna política de lectura —es contenido compartido—, así que con la sesión el
join devolvería vacío. El test `rls.test.ts` vigila las dos direcciones.

**Verificado el 6 sep, end-to-end:** con una sesión de alumno real en el
preview, una pregunta de entrenamiento fallada y diagnosticada (`OLVIDO` /
`LAGUNA` / `TRAMPA` / `LECTURA`) guarda la fila con su `error_type` en
`question_attempts` — la escritura que fallaba en silencio sin la política de
UPDATE. A nivel de RLS: un `user_id` ajeno lo rechaza Postgres (403).

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

**P5f se rehízo como P7 y luego P8** (6 sep). El primer intento fue
`profiles.class_group`, un texto libre por alumno; era muchos-a-muchos. P7 lo
pasó a `class_groups` + `class_members`. P8 fusionó este panel de academia con
«Usuarios» y «Acceso & Pagos» en una sola pestaña **«Alumnos»**
(`AdminStudents.tsx`) y movió la asignación de grupos a **desde el alumno**
(`setStudentGroups`). Ver **regla 53**.

### 36 · Todo lo que se pinta sale de `app/components/ui/`

No es una preferencia de orden: es la regla que cierra la clase de fallo que
más tiempo ha costado en este repo. Cada pantalla se inventaba su versión de
una tarjeta, así que **cada pantalla fallaba a su manera** y había que
descubrirlas de una en una, en un móvil, una captura detrás de otra.

Medido antes de existir la capa: **nueve radios distintos** (`rounded-xl` ×112,
`2xl` ×96, `3xl` ×43, más seis valores a mano: `[2rem]`, `[2.5rem]`, `[1.5rem]`,
`[3rem]`, `[30px]`, `[1.25rem]`) y **trece rellenos**, de `p-1` a `p-32`.

Y el aviso más caro: `globals.css` traía desde el principio un sistema escrito
—`.vip-card`, `.vip-button`, `.vip-input`, `.text-display`— que **no usaba ni un
componente**. Cero. Un sistema de diseño que no obliga se ignora; por eso este
tiene un test que muerde (`tests/design-system.test.ts`).

**La regla de oro: la decisión responsiva se toma en el primitivo, no en la
pantalla.** Una pantalla pide "tarjeta mediana"; cuánto encoge eso en 360px no
es asunto suyo. Cuando esto no se cumplía, el resultado era literal: el modo de
examen usaba `grid-cols-2` fijo, así que "ENTRENAMIENTO" en mayúsculas se
quedaba con ~110px y **tocaba el borde de su caja**. `OptionGroup` apila en
móvil por definición y ese fallo ya no puede volver.

Cuatro cosas que el sistema arregla de raíz y que ninguna pantalla debe volver
a decidir por su cuenta:

- **44px de área táctil** en todo lo que se toca. Había botones de 32px en el
  panel de administración.
- **`text-base` en los campos en móvil.** Safari de iPhone hace zoom sobre
  cualquier campo con letra menor de 16px y deja la página descuadrada. Toda la
  aplicación usaba `text-sm`: escribir en el chat daba un salto de pantalla.
- **`dvh`, nunca `vh`.** `100vh` es la altura CON la barra de direcciones
  plegada. Los cinco modales escritos a mano usaban `max-h-[85vh]`/`[95vh]`, así
  que el pie —donde están "Guardar" y "Publicar"— se salía de la pantalla al
  abrirlos.
- **`StatTile` obliga a distinguir `null` de `0`** (regla 8), porque el sitio
  donde más se confunden es justo un número grande en una tarjeta.
- **Un tamaño de letra SIN prefijo es el de MÓVIL**, y de `text-6xl` (60px)
  hacia arriba no hay pantalla de 360px que lo aguante. Estaban así el
  cronómetro de las pruebas físicas (72px), el contador de series (`text-9xl`,
  128px) y los dos campos donde se escribe la marca. Lo grande vive detrás de
  un `sm:`. El límite está en 6xl y no en 4xl a propósito: 36-48px en un móvil
  es un número protagonista legítimo —`TEXT.display` es `text-4xl sm:text-6xl`—
  y una guardia que se queja de lo razonable acaba desactivada.
- **Un formulario dentro de un `Modal` NO puede usar la paleta del panel.**
  El panel de administración es oscuro siempre; el `Modal` sigue el tema del
  usuario. El compositor de preguntas (P2) mezclaba las dos: en un móvil en
  modo claro salían recuadros casi negros con texto blanco dentro de un
  diálogo blanco, y dos de las tres opciones eran gris sobre gris. Los campos
  salen de `ui/Field`, que ya lleva los dos temas — y de paso el
  `text-base sm:text-sm` que evita el zoom de Safari.
- **`text-slate-400` sobre blanco son 2,6:1, y `text-slate-600` sobre el panel
  oscuro, 2,4.** Los dos estaban por toda la aplicación. El par
  `text-slate-500 dark:text-slate-400` funciona en los dos temas. Lo mide
  `contraste.cjs` (80 textos por debajo de 3:1 → 0).
- **`Card` lleva `min-w-0`.** Un hijo de `grid` o de `flex` tiene
  `min-width: auto`, y el ancho mínimo de un texto con `truncate` es el texto
  ENTERO: **`truncate` no sirve de nada si el contenedor crece para no
  truncar**. Dos tarjetas del panel de academia empujaban la página a 470px de
  ancho en una pantalla de 390. El mismo fallo tenía el registro de actividad,
  con filas de 634px.

**El hueco de la barra de navegación se reserva UNA vez**, en el `<main>` de
`StudentDashboard`. `MobileNav` es `fixed`: no empuja el contenido, se pinta
encima. Cada módulo se lo había ido apañando con su propio `pb-20` —una vez en
unos, ninguna en otros, y **ninguna en `ExamConfig`**, que es donde se vio: el
botón "Iniciar operación" quedaba físicamente debajo de la barra.

### 37 · Una aplicación de una sola ruta tiene que fingir que son varias

Toda la plataforma vive en `/` con pestañas. Eso no es un detalle de
implementación: es lo que rompía **cuatro comportamientos** que el usuario da
por hechos en cualquier aplicación, y ninguno de ellos se ve leyendo el código
ni en una captura de pantalla. Se encontraron **usándola** (regla 38).

- **El scroll no se reinicia solo.** Al cambiar de pestaña no hay navegación
  del navegador, así que la posición se queda donde estaba. Y como la barra de
  pestañas vive ABAJO, cuando pulsas una llevas por definición la página
  bajada: entrabas en cada pantalla nueva **por el final**. Era el
  *"siempre me lleva al final de la página"*. Un `window.scrollTo({ top: 0 })`
  al cambiar de `activeTab`, sin `smooth`: cambiar de sección tiene que ser
  instantáneo.
- **Atrás salía de la aplicación.** En Android es el gesto que más se usa: el
  alumno lo pulsaba esperando volver del test al menú y se encontraba fuera,
  con el examen perdido. Cada pestaña deja su entrada con `pushState`, y el
  `popstate` la restaura. Con un examen abierto, además, pregunta antes.
  **El `pushState` va FUERA del actualizador de `setState`** (regla 14): metido
  dentro, StrictMode lo ejecuta dos veces y hacían falta dos Atrás para volver
  uno.
- **Cambiar de pestaña DESMONTA el módulo.** `{activeTab === 'chat' && ...}`
  destruía la conversación entera: preguntabas algo, ibas a mirar el temario,
  volvías y no había nada. El chat se guarda en `sessionStorage` —de trabajo,
  no un historial que deba quedarse en el móvil para siempre— y el examen en
  `localStorage` (`app/lib/exam-session.ts`), con versión y caducidad.
- **Un examen a medias no existía en ningún sitio hasta entregarlo.** En
  simulacro no se escribe nada en la base de datos hasta el final, así que una
  recarga, un Atrás o que el móvil descartara la pestaña se llevaban cuarenta
  minutos de trabajo. Ahora se guarda en cada respuesta y se ofrece reanudarlo.
  **Nunca se reanuda solo**: el reloj del simulacro sigue corriendo y decidir
  eso por el alumno es decidir su nota.

### 38 · Lo que no se ha usado, no funciona

Muchas de las reglas de arriba salieron de leer el código. Estas dos no, y son
las que más han corregido:

1. **Verde no es lo mismo que visto.** El chat contestaba disparates con los
   tests en verde (regla 32). La pantalla de repaso de fallos tenía 24 tests y
   nadie la había abierto NUNCA con datos. El plan de entrenamiento tampoco.
2. **Un banco de pruebas puede mentir**, y entonces es peor que no tenerlo. Si
   un stub devuelve otra forma que la acción de verdad, la pantalla se pinta
   con `undefined` y el recorrido la da por buena. Por eso las formas se
   comprueban a nivel de tipos y `npm run check` lo exige
   ([`docs/BANCO-DE-PRUEBAS.md`](BANCO-DE-PRUEBAS.md)).

Antes de dar por buena una pantalla:

```bash
cd .banco-pruebas && node todas-las-pantallas.cjs
```

### 39 · El gasto de IA no lo decide quien no paga la factura

Había **dos sitios** donde un alumno disparaba llamadas de pago con un clic, y
el dinero era el menor de los tres problemas:

- **La pantalla del examen** tenía una «FASE IA (Relleno)»: si el banco no
  cubría los temas elegidos, le pedía a Gemini las que faltaban, **en paralelo
  y sin avisar**. Abrir un simulacro de 100 preguntas sobre un tema vacío eran
  100 llamadas de pago.
- **Drills** generaba una ficha nueva por alumno y por tarjeta.

Los otros dos problemas: el alumno estudiaba con preguntas **sin revisar**
mezcladas con las del banco y sin forma de distinguirlas; y cada alumno veía
contenido distinto del mismo tema, así que **«esta pregunta la falla el 40 %»**
—el panel de academia— dejaba de significar nada.

Ahora **el contenido lo siembra el administrador**: `generateAndSaveCandidate`
y `seedFlashcardBank` exigen `requireAdmin`, y si el banco no llega, la pantalla
del examen **dice cuántas faltan** en vez de gastar. Un examen más corto y
dicho es mejor que uno completo a medias de preguntas sin revisar.

**Y lo que apareció al hacerlo:** `flashcard_bank` existía desde el principio,
con su `card_hash` y su `status`, igual que `question_bank`, y **no la usaba
nadie**; `flashcard_progress` tenía una columna `card_id` que **no se escribía
nunca**. El esquema estaba diseñado exactamente para esto y se quedó sin
conectar, así que el cambio no necesitó **una sola línea de SQL**. Sin
`card_id` no hay forma de saber qué fichas ha visto ya un alumno, que es justo
lo que hace falta para servirle la siguiente.

Los dos finales legítimos de Drills —«este tema aún no tiene fichas» y «ya las
has visto todas»— **no son errores** y por eso no salen en un `alert()`: uno
pide avisar a la academia y el otro es una buena noticia.

### 40 · El tope por hora acota la ráfaga; el que acota la factura es el del día

30 chats/hora son **720 al día**. A ~0,005 € la pregunta —el chat manda el
documento entero, regla 33— eso son 4 €/día y **~120 € al mes de un solo
alumno**. Nadie estudia así, pero el límite lo consentía, y **un límite que
consiente lo que no puedes pagar no es un límite**.

`TOPES_DIARIOS` en `app/lib/rate-limit.ts`. **No necesitó SQL**:
`ai_quota.bucket` es texto libre y `consume_ai_quota` recibe límite y ventana
como parámetros, así que el contador del día cabe en la misma tabla con otro
nombre (`chat:dia`).

**El tope del día se comprueba ANTES que el de la hora**, y el orden no es
casual: al revés, una petición que el día ya no admite habría consumido
igualmente un hueco de la hora. Contar de más en el contador que corta es
inofensivo; contar de más en el que no corta le quita al alumno peticiones que
sí podía hacer.

**Pero esto son LLAMADAS, no tokens, y no es la unidad correcta.** Una pregunta
sobre el tema 7 son 34.675 tokens y sobre el más corto 1.419 —25×— y las dos
cuentan como una. Es un tope provisional y a propósito conservador mientras se
instrumenta el gasto real (regla 41).

### 41 · No se afina lo que no se mide

`app/lib/ai-usage.ts` calcula el gasto de cada llamada en tokens y en dólares,
y lo escribe en el registro del servidor con un prefijo filtrable
(`[gasto-ia] ruta=… usuario=… entrada=… salida=… usd=…`). Así hay **números
reales desde hoy**, antes de que exista ninguna tabla.

Tres decisiones que no son obvias:

- **Un campo que falta cuenta CERO, nunca `NaN`.** Un `undefined` propagándose
  convierte la suma entera en `NaN`, y entonces el contador enseña «NaN €» y
  **ciega la vigilancia**. Cero infravalora una llamada; `NaN` ciega el
  contador entero. Un recuento negativo se descarta por lo mismo.
- **`registraGasto` nunca lanza.** Se llama DESPUÉS de una respuesta buena del
  modelo: un fallo aquí no puede llevarse por delante una respuesta que el
  alumno ya tiene y que ya se ha pagado.
- **El precio lleva la fecha en que se comprobó** (`PRECIO_FLASH.revisadoEl`).
  Un precio sin fecha es un precio que nadie sabe si sigue vigente. Y va en un
  objeto, no en dos constantes sueltas, por lo mismo que `CNP_SCORING`.

Hay una guarda que exige que **ningún `generateContent` se quede sin su
`registraGasto`**: es fácil añadir una llamada nueva y olvidar el contador, y
entonces el gasto se va por un sitio que nadie mira.

Persistirlo lo hace [`docs/sql/gasto-ia.sql`](sql/gasto-ia.sql)
(`ai_usage`), **ejecutado**. El panel que lo lee es la regla 51.

### 42 · El documento entero se paga solo si el alumno elige tema

La opción cómoda del desplegable era **la más cara**: sin tema se pagaba el
embedding Y podían viajar **dos** documentos enteros (hasta 34.675 tokens cada
uno). Con tema viaja uno y el embedding no se paga. Como la gente tira de lo
cómodo, el desplegable empujaba a todo el mundo por el camino caro.

Ahora, sin tema, se responde con los fragmentos de la búsqueda semántica: como
funcionó la plataforma siempre, ~3.000 tokens. **La regla 33 sigue en pie donde
importa** — con tema, documento entero.

**No se quitó la opción**, que era la otra salida sobre la mesa. Un alumno que
no sabe en qué tema entra *«la prueba de alcoholemia»* —lo normal las primeras
semanas— se quedaría sin poder preguntar justo lo que más le ayuda. En vez de
eso el desplegable lo dice: **«Todo el temario — respuesta más general»**. Que
lo sepa antes, en lugar de descubrirlo con una respuesta floja y pensar que la
plataforma no sabe.

**Lo que NO se tocó:** el índice y el artículo buscado por su número siguen
yendo delante. Son coincidencias exactas y deterministas, no parecidos, y no
cuestan un documento entero (regla 30).

`documentosEnteros` se borró en vez de quedarse comentada. Lo que queda en
`lib/chat.ts` —`documentosNombrados` y compañía— **se conserva con un aviso
encima** de que ahora mismo no lo usa nadie: ahí está escrita la lección de la
regla 33 con sus tests, y es lo que habría que volver a enchufar para un modo
«todo el temario con el documento delante». Código muerto que nadie marca es
como este repo acabó con `flashcard_bank` sin usar y `.vip-card` en
`globals.css`.

### 43 · Una puerta y un escritorio no hacen el mismo trabajo

> **El aspecto que se describe aquí (brutalista sobre hueso) se sustituyó el
> 6 nov por el de la regla 90**, que sigue a la pantalla de carga. Lo que sigue
> en pie de esta regla es lo que protege: `TAP`, `text-base` en los campos,
> `dvh`, ningún tamaño grande sin escalón, y que la puerta no siga el tema.

El login es brutalista sobre hueso: plano, bordes de 3px, mayúsculas enormes y
el filete de la bandera en proporciones reales (1:2:1 — en tres franjas iguales
la bandera canta).

**No sale de `Card` y `Button`**, que es la regla 36, y es deliberado: meter un
diseño plano de bordes gruesos en unos primitivos redondeados con sombra índigo
lo convertiría en otra cosa. Es la misma excepción que ya se acepta con el
panel de administración, que es oscuro pase lo que pase. Lo que **no** se salta
es lo que esa regla protege de verdad: el área táctil sale de `TAP`, los campos
llevan `text-base` en móvil, la altura va en `dvh` y ningún tamaño grande se
queda sin escalón. Hay tests que lo fijan.

**Y al llevar ese aire a `ActiveTest` apareció el límite.** Viaja la *firma*
—superficies planas, bordes en vez de sombras, el filete, el rojo como
acento— pero **el enunciado BAJA de peso**, de `font-black` a `font-bold`. Es
el texto que el alumno mira cincuenta minutos seguidos, y la tipografía del
login a ese tamaño y durante ese rato cansa. La firma vive en los bordes y las
etiquetas; **la zona que se LEE se deja tranquila**. Es la misma lección que el
prompt del chat: lo que impresiona en una lectura, en la décima estorba.

De paso salió un fallo real: la opción marcada tenía `scale-[1.02]`, así que al
cambiar de respuesta **las opciones de abajo se movían**.

### 44 · Guardar el historial y usarlo como contexto son dos cosas distintas

La conversación vivía solo en el `sessionStorage`: se borraba al cerrar la
pestaña y no llegaba nunca a la base de datos. Un alumno que hacía una buena
pregunta el martes no podía releer la respuesta el jueves.

**Guardar es casi gratis; lo que cuesta dinero es meter el historial en el
prompt.** Así que se guarda TODO y se le manda al modelo MUY POCO. Y el recorte
lo impone el SERVIDOR (`trimHistory`: 6 turnos, 600 caracteres cada uno), no el
cliente — una Server Action es un endpoint público y el navegador podría mandar
quinientos turnos.

**Una conversación CERRADA no es contexto de nada.** Se relee, pero no viaja al
modelo: `contextoDeConversacion` devuelve vacío si tiene `closed_at`. Eso es lo
que hace que tener historial entero no encarezca ni una pregunta.

**Pero una ABIERTA sí arrastra sus últimos turnos**, y esto no es negociable: si
«el historial no es contexto» se aplicara también a la abierta, volvería el
fallo de la regla 11 — *«¿y qué plazo aplica en ese caso?»* dejaba de recuperar
nada del temario porque el buscador no sabía de qué se hablaba.

Tres decisiones de la implementación:

- **Todo va con el cliente de la SESIÓN** (regla 34). Las dos tablas tienen
  política de propietario `for all`, así que es Postgres quien impone que un
  alumno solo vea lo suyo. Con la clave de servicio, RLS no protegería nada.
- **La pregunta y la respuesta se guardan en UN solo insert.** En dos, una
  caída entre medias dejaría una pregunta sin respuesta y al releerla parecería
  que Atenea no contestó. Y la respuesta lleva un milisegundo más: dos filas con
  el mismo `created_at` pueden salir al revés.
- **El guardado NO bloquea la respuesta.** Se escribe después de pintarla: si
  falla, se pierde el archivo, no el trabajo.

En la pantalla, una conversación archivada **apaga el recuadro de escribir**, no
solo el envío. Un campo que se puede escribir y no manda nada es peor que uno
apagado: el alumno teclea la pregunta entera antes de descubrir que no iba a
ninguna parte.

### 45 · El panel de administración sigue el tema, menos su barra

Era oscuro **a fuego**: de los 367 colores que tenía, solo 27 llevaban variante
`dark:`. No había un interruptor apagado — no había interruptor. Y se usa en un
móvil, de día, donde el oscuro se lee peor.

Ahora el **contenido** sigue el tema del sistema, como el resto de la
plataforma. La **barra de arriba se queda oscura siempre**, con el filete de la
bandera, y eso no es un resto del panel viejo: es la **señal de contexto**. Este
es el sitio donde se borra temario y se publican preguntas para todos los
alumnos, y conviene saber de un vistazo que ya no estás en el de estudiar.

**La conversión se hizo con un guion, y hacía falta**: 367 colores en 10
ficheros. A mano se olvida uno, y **un texto blanco sobre fondo blanco no da
error — simplemente desaparece**. Tres trampas, y las tres las cantó
`contraste.cjs`, no una revisión a ojo:

- **`text-white` significa dos cosas.** Sobre `bg-slate-900` es «el texto de un
  panel oscuro» y debe volverse `text-slate-900 dark:text-white`. Sobre
  `bg-indigo-600` —un botón— es «blanco sobre el color de marca» y **tiene que
  quedarse blanco**. Por eso se analiza la clase entera, no cada palabra.
- **Los prefijos.** `hover:bg-slate-800` no puede convertirse en
  `hover:bg-slate-100 dark:bg-slate-800`: la mitad oscura pierde el `hover:` y
  pasa a aplicarse siempre. Lo correcto es `dark:hover:bg-slate-800`.
- **Los acentos estaban elegidos para fondo oscuro.** `text-emerald-400` sobre
  blanco son 1,8:1: el porcentaje de acierto de un alumno quedaba ilegible en
  el panel de academia. En claro hay que bajar a la versión 700.

Y lo que el guion NO debe tocar: la propia barra (se convirtió a sí misma y
dejó «Centro de Mando» blanco sobre casi blanco, 1,0:1) y lo que va dentro de
`Card tone="contrast"`, que es oscura en los dos temas por diseño.

Medido: de 0 a **64** textos por debajo de 3:1 tras la conversión automática, y
de vuelta a **0** tras arreglar esas tres clases. Sin `contraste.cjs` esto no se
podía hacer: son 80 textos por pantalla y siete secciones.

### 46 · «Viene» y «estudia» son cosas distintas

El estado del alumno salía de `question_attempts`, o sea de haber CONTESTADO
PREGUNTAS, y se le llamaba «ha entrado». Un alumno que entra a diario a
repasar fichas, usar el chat o entrenar —pero que aún no ha hecho un test—
aparecía como «nunca ha entrado» y **encabezaba la lista de a quién llamar**.

El profesor actúa sobre esa lista: el dato falso no era un número feo, era una
llamada de teléfono a quien está estudiando todos los días.

Ahora `estado` sale de `auth.users.last_sign_in_at` (¿viene?) y `estudiando`
de las respuestas (¿hace algo cuando viene?), y el panel enseña las dos. No es
un matiz: piden dos conversaciones distintas. Al que no viene se le pregunta
si sigue interesado; al que viene a diario y no contesta ni una pregunta se le
pregunta si se ha atascado — y ese es de los que **más se pueden salvar y
antes se pierden**.

### 47 · Generar es una sola pregunta con tres respuestas

Generar diez preguntas del tema 7 costaba cinco pasos y dos saltos de scroll:
bajar al árbol del temario, desplegar el bloque, encontrar el tema, pulsar una
estrella —que además devolvía arriba de golpe— y solo entonces elegir cuántas.
Y el orden estaba al revés: obligaba a elegir el **tema** antes de saber **qué**
se iba a generar.

`GeneradorPanel` es una caja con las tres respuestas seguidas: qué (preguntas
o fichas), de qué tema, cuántas. El desplegable trae los temas con lo que ya
tiene cada uno — sembrar a ciegas son llamadas de pago tiradas — y avisa de
los que no tienen PDF. La estrella del árbol se queda como atajo; deja de ser
la única puerta.

### 48 · El entrenador real es otro productor del mismo plan

Una academia puede tener preparador físico de verdad en vez de un plan
generado. La solución no es una tabla nueva ni una pantalla aparte para el
alumno: **el entrenador es otro productor del mismo `WeeklyPlan`**, con un
campo `source: 'ia' | 'entrenador'` para que la pantalla del alumno pueda decir
quién lo escribió. `TrainingDashboard` y `ActiveSession` no cambian una línea.

Va con `requireAdmin`, no con un rol «entrenador» propio: con una academia, el
admin es quien la dirige, y un rol que no separa a nadie es ceremonia (misma
decisión que «superadmin», regla 31). Y va con la clave de servicio a
propósito —es la excepción legítima de la regla 34: un admin escribiendo sobre
la fila de OTRO usuario no puede ir con la sesión de ese usuario, porque su
política es `auth.uid() = user_id` y quien actúa es el admin, no él.

Lo que entra a mano se valida IGUAL que lo que escribe la IA (regla 27):
`buildManualPlan` construye la entrada y pasa por el mismo `normalizePlan` —
un preparador se equivoca con un campo vacío igual que Gemini.

> **El editor por filas y la biblioteca de ejercicios se retiraron el 6 nov**
> (`PlanEntrenadorEditor`, `exercise-library.ts`): el preparador escribe ahora
> SESIONES con descripción libre, como en la herramienta que usaba Alphapol.
> Ver la regla 86.

**El editor se rehízo el 9 sep** (`PlanEntrenadorEditor`, feedback del dueño:
«más intuitivo, visual»). Ya no son siete `<textarea>` con la sintaxis
`nombre; series; reps; descanso` —había que recordar el orden y un error se
guardaba en silencio—: cada día es una lista de FILAS con campos de verdad. Lo
que NO cambió: sigue produciendo el mismo `GuardarParams` (`{weekFocus, days}`)
y pasando por `buildManualPlan` + `normalizePlan`, así que el guardado y el
esquema del plan son idénticos. Piezas nuevas:

- **`app/lib/exercise-library.ts`** (pura, `tests/exercise-library.test.ts`):
  biblioteca de ejercicios (las 3 pruebas del CNP primero) para el desplegable
  de cada fila —texto libre SIEMPRE permitido—, y `kindDeEjercicio` +
  `camposDeKind`: el `kind` (`fuerza`/`carrera`/`circuito`/`general`) decide
  **qué campos tiene la fila** (una serie de 200 m no son «series y reps»). Se
  guarda en `Exercise.metric_type`, columna que ya existía y no escribía nadie.
  El kind se deduce del nombre (biblioteca → pistas por palabra → `fuerza`).
- **Vista previa** = el MISMO `CalendarioEntrenamiento` del alumno, construido
  del mismo `buildManualPlan`. Lo que ve el preparador es lo que verá el alumno,
  no una aproximación (regla 6/17). Es la única importación de un componente de
  `student/` en `Admin/`, y es a propósito.
- **«Partir de la semana pasada»** (`semanaAnteriorPlan`, lo pasa `AdminPhysical`
  desde `semanas`): un preparador trabaja por progresión, no reescribe de cero.
- **`SemanaSoloLectura`** (semana pasada) también usa `CalendarioEntrenamiento`.

**El interruptor de la IA de físicas se ocultó el 9 sep** (regla 58, como el
chat): el dueño no quiere publicar «que el alumno se genere su plan» todavía.
El mecanismo sigue entero (`training_ai`, apagado por defecto); solo se retiró
su `SwitchCard` de `AdminPhysical`.

### 49 · «Logs» no es un registro si no dice quién

La pestaña enseñaba las últimas 20 respuestas de cualquier alumno a cualquier
pregunta. Eso no dice QUIÉN hizo QUÉ, y con un solo admin no importaba — pero
en cuanto hay más de una persona con acceso, borrar un tema o apagar un
módulo sin dejar rastro de quién lo hizo es el fallo que solo se nota cuando
ya ha pasado.

`admin_audit_log` (`app/lib/admin-audit.ts`, mismo patrón que `ai-usage.ts`:
se registra en el log del servidor SIEMPRE, con prefijo filtrable
`[admin-audit]`, y se intenta persistir; nunca lanza) guarda quién borró un
documento, quién publicó preguntas, quién apagó un módulo. Generar contenido
con IA no se duplica aquí: ya lo cuenta `ai-usage.ts` con su propio detalle.

**El mapa de etiquetas vive separado del registro**, en
`app/lib/audit-labels.ts`. No es capricho de organización: `admin-audit.ts`
importa `actions/core` (de forma dinámica, pero lo importa) para persistir, y
ese módulo es `server-only`. La pantalla (`AdminActivity.tsx`) es un
componente de CLIENTE que solo necesita leer la etiqueta de cada acción —
importarla del fichero que arrastra el cliente de Supabase de servicio se lo
llevaría entero al navegador, y el bundle del banco de pruebas dejó de
compilar la primera vez que se probó, con `server-only` sin resolver. Separar
el dato puro (`ACCION_LABEL`) del efecto (`registraAccion`) es la misma idea
que ya obliga la regla 21 con `core.ts`.

**La tabla puede no existir todavía y la pantalla lo dice**, no un error
genérico: `getAdminAuditLog` reconoce el mensaje de PostgREST
("could not find the table") y `AdminActivity` enseña un aviso ámbar en vez
de un "algo ha ido mal". El guion [`docs/sql/admin-audit-log.sql`](sql/admin-audit-log.sql)
**ya está ejecutado** (5 sep 2026), así que ese aviso ya no salta; la degradación
con gracia se queda por si la tabla se cae.

**La pestaña también lista el ÚLTIMO ACCESO de cada usuario** (8 sep 2026),
alumnos y admin — `getInicioSesiones` cruza `auth.users.last_sign_in_at` (vía
`auth.admin.listUsers`, mismo patrón que `academy.ts`) con `profiles` para el
rol, y ordena por quién ha entrado más reciente. **Aquí SÍ salen los admin**, a
diferencia de «Alumnos» (regla 54): el objeto es auditar quién entra, no a quién
llamar. Supabase solo guarda la última fecha por usuario, no el historial de
sesiones — para eso haría falta exponer `auth.audit_log_entries`, que no pasa por
PostgREST. Si `listUsers` falla, la lista sale igual sin la fecha (`sinFechas`),
no se cae.

### 50 · Los datos de la academia no viven solo en la cabeza del dueño

Pregunta directa: *"algún lugar para poner el nombre de la academia,
dirección, horarios, emails, profesores...?"*. No había ninguno: ese texto
vivía fuera de la aplicación, en la cabeza de quien la lleva.

`academy_settings` es una fila única (`id = 1`, forzado por un `CHECK`) con
nombre, dirección, horario y contacto; `academy_staff` es la lista de quién da
clase, con su propio alta/edición/borrado. Los dos con `requireAdmin` y la
clave de servicio (regla 34/35: es administración pura, no del alumno). El guion
[`docs/sql/academia-ajustes.sql`](sql/academia-ajustes.sql) es idempotente y
**ya está ejecutado** (5 sep 2026): las dos tablas existen en producción.

Vive en la pestaña que antes se llamaba «Módulos» — renombrada a «Ajustes» —
porque los dos son la misma clase de pantalla: cosas que se configuran una
vez y rara vez se tocan, no algo que el alumno vea. El aviso «falta ejecutar»
(mismo patrón que la regla 49) se queda en el código por si la tabla se cae,
pero ya no salta.

Un profesor sin nombre no se guarda (`normalizeStaffInput` devuelve `null`), y
`role` cae a `'profesor'` si llega vacío — un puesto sin nombre es un
formulario a medio rellenar, no un dato ausente legítimo.

### 51 · El panel de consumo suma, no cobra

P6 salió de *«pagos etc…»* y el plan lo aplazó entero hasta después del piloto,
menos una pieza: **saber cuánto cuesta servir a un alumno antes de ponerle
precio**. `ai_usage` (regla 41) ya guarda cada llamada a Gemini; la pestaña
**Consumo IA** la agrega.

`app/lib/ai-cost.ts` es lógica pura (regla 21) y repite los dos errores de
siempre a propósito para que los tests los vigilen:

- **`cost_usd` llega como CADENA.** Es `numeric` en Postgres y PostgREST lo
  serializa como `"0.001234"`. Sumarlo sin `parseFloat` da 0, y el panel diría
  que servir a los alumnos es gratis (regla 4).
- **El coste medio por alumno es `null` sin alumnos, no `0`** (regla 8): dividir
  entre cero da `NaN`, y «0,00 $» es la misma mentira tranquilizadora.
- **Por debajo de un céntimo se dice «< $0.01», no «$0.00»** (`formateaUSD`).

Va con la clave de servicio y `requireAdmin` (regla 34/35: `ai_usage` tiene RLS
y cero políticas).

### 52 · El cobro es en efectivo; el código solo controla el acceso

La decisión de P6 se tomó al final: **no hay pasarela**. La academia cobra en
persona, y lo que hace falta es una puerta que el administrador abre y cierra y
un registro de lo que cada alumno ha pagado. Nada de Stripe, suscripciones ni
IVA de la UE — construir eso habría sido trabajo tirado.

Tres tablas ([`docs/sql/P6-acceso-y-pagos.sql`](sql/P6-acceso-y-pagos.sql)),
todas de administración (RLS y cero políticas):

- **`membership_settings.required`** — el interruptor global. **Por defecto
  `false`**: la plataforma sigue abierta para todos, y ejecutar el guion no
  cierra nada. Solo cuando se pone a `true` empieza a filtrar.
- **`memberships`** — acceso y estado de pago por alumno. **SIN FILA =
  PENDIENTE**, al revés que `module_settings` (P4): allí un módulo nuevo debe
  aparecer, aquí un alumno nuevo NO debe entrar solo. `access_status` es
  `active` | `suspended`; no hay `pending`, que es la ausencia de fila.
- **`academy_payments`** — un registro por pago en efectivo. **Retirada en P8**
  (0 filas, modelo equivocado): el registro de pagos es ahora `monthly_payments`,
  una rejilla mes a mes. Ver **regla 53**.

La puerta la decide `decideAccess` (`app/lib/membership.ts`, pura) y la aplica
`getSessionUser` (`auth.ts`), no la pantalla: una Server Action es un endpoint
público, así que `requireUser` también corta a un alumno suspendido que
conserve la sesión. Un admin es siempre `ok`. **El orden de las reglas no es
negociable:** admin → interruptor apagado → fallo de lectura → sin fila → fila
suspendida. Si la lectura falla se ABRE la puerta (regla 34): dejar a la
academia entera fuera por un blip de la BD es peor que colar a alguien sin
activar — y aquí el coste es mayor que en `module-guard` porque son alumnos que
sí han pagado.

**El acceso NO caduca solo.** `payment_status` (`al_dia` | `debe`) es un aviso
visual; cortar el acceso lo hace el administrador a mano. Un despiste apuntando
un pago no puede dejar fuera a quien sí pagó.

**El importe de un pago vacío es `null`, nunca `0`** (regla 16): `setPayment`
(P8) convierte `''` en `null` antes de escribir, y `formateaEUR(null)` es «—».

Antes de encender el interruptor, `activateAllCurrentStudents` da acceso de
golpe a todos los alumnos que ya existen (`ignoreDuplicates: true`: no
resucita a un suspendido).

**El guion está ejecutado** (5 sep 2026): las tres tablas existen y
`membership_settings` tiene su fila `id = 1` con `required = false`, así que
hoy la puerta está abierta para todos. Encenderla es un clic en la pestaña
**Alumnos** (P8 fusionó «Acceso & Pagos» ahí), después de activar a los alumnos
actuales.

### 53 · Un solo panel de alumno: los grupos se asignan DESDE el alumno, y los pagos son una rejilla mensual

P5f montó `profiles.class_group` —UN texto libre por alumno— y no servía:
*«cada alumno puede estar en varias (inglés y teoría, físicas no)»*. P7 lo hizo
muchos-a-muchos (`class_groups` + `class_members` + `group_training_plans`). Al
probar P5/P6/P7 el dueño pidió tres cosas más, y esas son P8:

**1 · Una pantalla, no tres.** «Usuarios», «Academia» y «Acceso & Pagos» eran la
misma lista de personas mirada de tres formas. Ahora hay **una pestaña,
«Alumnos»** (`AdminStudents.tsx`): interruptor global de acceso, activar a todos,
los cuadros de estado (con acceso / sin activar / nunca ha entrado / pagó el mes),
y la lista ordenada por urgencia (regla 35). Cada alumno se despliega y ahí está
**todo lo suyo**: dar/quitar acceso, sus grupos, su pago del mes, su ficha
(temas y errores) y su plan de entrenador. `AdminUsers.tsx`, `AdminMembers.tsx` y
`AdminAcademy.tsx` **se borraron**.

**2 · Los grupos se marcan desde el alumno, no grupo a grupo.** *«Doy de alta un
alumno y le marco sus grupos; si el mes que viene se da de baja de físicas, entro
en ESE alumno y le quito el clic.»* La acción es **`setStudentGroups(studentId,
classIds)`**: recibe la lista entera que la pantalla quiere para ese alumno y
calcula la diferencia sobre `class_members`. La pantalla de grupos (`AdminGroups`)
ya no tiene checklist de miembros — solo crea grupos, les pone tipo, horario y
**varios profesores** (`class_group_staff`, un join; se retiró
`class_groups.staff_id`).

**3 · El tipo de grupo lo edita el admin.** `group_kinds` (tabla): `id` (slug),
`label`, `lleva_plan`. Antes `kind` era un `CHECK` cerrado con `'fisicas'` a
pelo; ahora `llevaPlan(kindId, kinds)` (`app/lib/groups.ts`) mira la fila. El
admin puede tener varios tipos con `lleva_plan = true`. `deleteGroupKind` no
borra un tipo que algún grupo esté usando.

**4 · Los pagos son mes a mes.** *«Elijo septiembre, me salen los activos, voy
marcando quién paga, y veo recuento y estadísticas.»* `monthly_payments`, una
fila por `(user_id, period)` con `period` = `'YYYY-MM'`; guardar es un upsert
sobre esa clave (`setPayment`). El **roster de un mes son los alumnos con acceso
`active`**, no todos. `academy_payments` (el registro libre de P6, 0 filas) se
retiró: modelo equivocado. La aritmética del resumen vive en `app/lib/payments.ts`
(pura, regla 21) y `tests/payments.test.ts` la vigila — **«sin importe» no es
«0 €»** (regla 8): `amount_eur` vacío es `null`, y un alumno que pagó sin que se
anotara importe cuenta como pagado y suma 0. También hay una pestaña **«Pagos»**
suelta (`AdminPayments.tsx`) para la vista de un mes de un vistazo.

Lo que **no cambió** de P7 y sigue en pie:

- **El plan individual manda sobre el de grupo** (`planEfectivo`, lo aplica
  `getActiveTrainingPlan`). El resultado lleva `origen` (`individual` | `grupo` |
  `ninguno`). `getActiveTrainingPlan` busca el plan de grupo por los tipos con
  `lleva_plan = true`, no por `'fisicas'`.
- **No se marcan días sobre un plan de grupo:** `completeTrainingDay` rechaza los
  ids `grupo:…`. Para llevar registro, se le pone al alumno un plan individual.
- **Todo el panel va con la clave de servicio y `requireAdmin`** (reglas 34/35):
  un profesor mirando a sus alumnos no está cubierto por ninguna política de
  propietario. `group_kinds`, `class_group_staff` y `monthly_payments` tienen RLS
  y cero políticas. `group_training_plans` sigue siendo la excepción (`SELECT`
  abierto, el plan tiene que llegar al alumno).

**Trampa de `'use server'` (pasó dos veces):** `app/actions/groups.ts` es un
módulo `'use server'`, así que **solo puede exportar `async function`**. Un
`export type { GroupKind }` al final lo compila Next a una referencia de verdad y
el servidor revienta al evaluar el barril `actions/index.ts` —
`ReferenceError: GroupKind is not defined` — y con él se cae `getCurrentUser` en
producción. `next build` **no lo detecta** (es error en tiempo de evaluación).
Los tipos se importan de `app/lib/`, nunca se reexportan desde la acción. Hay dos
guardas estáticas nuevas en `actions-auth.test.ts` que lo vigilan.

### 54 · Segunda vuelta de P8: cuatro ajustes que pidió el dueño al probarlo

- **«Alumnos» ya no lista a los admin.** `getAcademyOverview` filtra
  `role === 'admin'` antes de construir la lista, los cuadros y el filtro. Un
  profesor mirando «a quién llamar» no se llama a sí mismo. Los otros paneles de
  administración siguen sin necesitarlo.
- **El «marcar pagado» sale de la ficha del alumno.** Se hace en «Pagos». La
  ficha se queda con un aviso de solo lectura («Pagó septiembre» / «Sin pagar»).
  El editor de **plan individual manual** también se retiró de la ficha
  (`saveManualTrainingPlan` / `getStudentActivePlan` se quedan en `training.ts`,
  sin UI: `rls.test.ts` aún los nombra).
- **Las pestañas del panel se reordenan.** Botón ⇄ en la cabecera → modo con
  flechas por pestaña. El orden vive en `localStorage`
  (`atenea-admin-orden-pestanas`), envuelto en try/catch, y una pestaña añadida
  al código aparece al final en vez de desaparecer (`aplicaOrden` en
  `AdminView.tsx`). Es comodidad **por navegador**, no ajuste de academia.
- **Dos interruptores de preparación física**, aparte del módulo `training`
  entero (P4): `training_ai` (el alumno se genera el plan, de pago) y
  `training_group` (el plan manual por grupo). Se guardan en `module_settings`
  con `module_id` de **texto libre** —`toModuleSettings` ignora lo que no conoce,
  así que **sin SQL**— con la misma semántica que P4 (sin fila = encendido, fallo
  de lectura = encendido). Lo puro vive en `app/lib/training-switches.ts`
  (etiquetas, `toTrainingSwitches`); el lector con caché y el corte de servidor
  en `training-switch-guard.ts`, que arrastra `actions/core` y **no puede ser una
  Server Action** (regla 21, mismo motivo que `module-guard.ts`). El corte va
  **antes de la cuota y de Gemini** en `generateWeeklyPlan` / `generateNextWeek`,
  y en `saveGroupTrainingPlan`; `getActiveTrainingPlan` no hereda el plan de
  grupo si `training_group` está apagado. El módulo del alumno esconde «generar»
  cuando la IA está off, y **un plan activo gana sobre el wizard de biometría**
  (para que el plan de grupo se vea sin haber hecho el test de Cooper).
- **«Pagos» tiene dos vistas:** HISTÓRICO (rejilla alumnos × 12 meses, un toque
  marca/desmarca sin importe, con lo cobrado por columna — `resumeHistorico` en
  `lib/payments.ts`) y UN MES (la de antes, con importe por alumno).

**El plan de grupo va semana a semana, con histórico** (P9, ejecutado 6 sep —
[`docs/sql/P9-plan-grupo-semanal.sql`](sql/P9-plan-grupo-semanal.sql)). La
PK de `group_training_plans` pasó a `(class_id, week_start)`: caben varias
semanas por grupo. `week_start` es el **lunes** de la semana (`lunesDeSemana` en
`training-plan.ts`, en horario local: «esta semana» es la del profesor, no la de
UTC). El editor de «Prep. física» ofrece la semana actual y cuatro por venir
(`semanasEditables`); una semana ya pasada es **solo lectura** —editarla
reescribiría un plan que el alumno ya siguió, y la acción lo rechaza—. El alumno
ve la semana **vigente**: el `week_start` más reciente que no pasa del lunes de
hoy (`semanaVigente`, y `getActiveTrainingPlan` lo aplica con
`.lte('week_start', hoy)`), así que una semana preparada por adelantado no se le
enseña todavía. `getGroupTrainingPlan` devuelve **todas** las semanas del grupo
(`SemanaDeGrupo[]`, con `vigente` / `pasada`), y `saveGroupTrainingPlan` /
`deleteGroupTrainingPlan` reciben el `weekStart`.

### 55 · El «Entrenamiento» del test es adaptativo (P10)

El diferenciador. El banco de preguntas es común, pero **cada alumno tiene sus
propios cajones** por pregunta —nueva / recaída / en aprendizaje / consolidando /
dominada / atascada— y la sesión se arma con una **cuota de cada uno**, calibrada
para que acierte ~85 % (la regla del 85 %), e **intercalando** los temas. La base
está en [`docs/METODO-APRENDIZAJE.md`](METODO-APRENDIZAJE.md) (investigación)
y [`docs/P10-entrenamiento-adaptativo.md`](P10-entrenamiento-adaptativo.md)
(diseño).

- **El estado se deriva al vuelo de `question_attempts`, sin tabla nueva.** Es lo
  que ya hace `getUserStats` (leer hasta 20-30 mil respuestas y agregar en
  memoria). `computeQuestionStates` (`app/lib/question-scheduler.ts`, puro)
  recorre las respuestas en orden y calcula `box` (0-5), `dueAt`, `lapses`,
  fluidez. **P10 v1 no necesitó ni un guion SQL.** Si algún día se nota lento, se
  añade `question_state` como caché con la misma función.
- **Un blanco no penaliza** (regla 24): la caja no se mueve. Un fallo de
  **lectura** (`fallo_procesamiento`) baja a la caja 2, no a la 1 —leíste mal, no
  es que no lo sepas—. El **primer acierto** va a la caja 2: la 1 es solo para
  recaídas.
- **`buildSmartSession`** (`app/lib/smart-session.ts`, puro): recaídas primero y
  siempre; **tope del 30 % de material nuevo** (inundar de nuevo hunde el acierto
  por debajo del punto dulce); **atascadas máximo 2 por sesión** (más
  repeticiones no ayudan — se avisa de que hay que releer el artículo o hacer una
  ficha); redistribución si un cubo se queda corto; una pasada de calibración que
  NO quita recaídas salvo que dominen la sesión (> 40 %).
- **El simulacro NO se toca.** Tiene que reflejar el examen real: aleatorio, con
  reloj, sin adaptar.
- **Interruptor `training_adaptive`** en `module_settings` (texto libre, patrón de
  la regla 54), **encendido por defecto**. Apagado = vuelve a la selección
  aleatoria. `getAdaptiveSession` (`exams.ts`) lo comprueba: si está apagado hace
  `shuffle(bank).slice(limit)`. El módulo del alumno llama a esta acción en modo
  `practice`; en `exam` sigue con `getQuestionsFromBank`.
- **El tope de material nuevo ESCALA** con lo que el alumno ha visto del banco:
  ~60 % si ha tocado < 10 %, ~22 % si ha tocado > 60 % — si no, a un principiante
  le falta material nuevo y se le rellena con repaso prematuro. El «refuerzo»
  (visto hace poco, aún no vencido) no tiene cupo base: rompe el espaciado, solo
  se usa de último relleno.
- **`global_success_rate = 0` no es «todo el mundo la falla»** (regla 8): hoy esa
  columna está toda a 0 (no la puebla nadie). `tasaUsable()` la ignora salvo que
  sea un valor plausible.
- **La curva de aprendizaje**: `resumeCajonesPorTema` alimenta la sección
  «Dominio del temario» de Estadísticas — por tema, cuántas dominadas /
  consolidando / en aprendizaje / sin empezar, con una barra apilada.
- **En «Repasar fallos»**, una pregunta fallada 4+ veces sale marcada como
  atascada con un aviso de que releer el artículo, no repetir el test
  (`esAtascada` en `lib/review.ts`).
- **Para verlo sin levantar la app**: `npm run sesion:adaptativa -- correo 20`
  imprime los cajones del alumno, la curva por tema y una sesión de ejemplo con
  su mezcla y el acierto estimado. Gratis, solo lee (como `chat:probar`).
- **RLS**: las respuestas del propio alumno se leen con **su sesión** (`db`,
  regla 34 — `question_attempts` tiene política de propietario y aquí no hay join
  con `question_bank`); el banco, con la clave de servicio.
- **P10b · la marca de confianza EXPLÍCITA se retiró** (7 sep 2026). Se llegó a
  pedir por cada respuesta («¿lo tenías / a medias / a ciegas?») y, encima, el
  diagnóstico del fallo era OBLIGATORIO para avanzar: hasta 100 toques extra en
  un test de 50 preguntas, y el dato salía falseado porque quien quiere terminar
  pulsa siempre lo mismo. Ver **regla 56**, que es la que manda ahora. El código
  de la calibración (`app/lib/confidence.ts`, la columna
  `question_attempts.confidence`) se conserva sin usar, como el chat.
- **Lo que queda para v2**: FSRS (hueco dejado en los datos), y una intervención
  real para las «atascadas» más allá de avisar (generar una ficha desde la
  pregunta, o llevar al artículo).

### 56 · Se deduce todo lo deducible; se pregunta solo lo que cambia el plan

**La regla, entera:**

> Se DEDUCE todo lo que se pueda deducir. Se PREGUNTA solo lo que no se puede
> deducir **y** además cambia lo que el sistema va a hacer. Y **nunca bloquea**.

Salió de probarlo: *«no puede ser que a un alumno, por cada pregunta, se le
hagan 5 preguntas más sobre cómo ha contestado»*. Y era literal — en cada
respuesta se pedía la marca de confianza (P10b) y, si fallaba, el diagnóstico
del error **era obligatorio para poder avanzar**. En un test de 50 preguntas,
hasta 100 toques que no son estudiar. Y el dato salía además falseado: quien
quiere terminar acaba pulsando siempre lo mismo, así que se pagaba fricción por
un dato que miente.

**No hacía falta preguntarlo.** Desde la fase 2.3 cada fila de
`question_attempts` guarda `response_time_ms` y `option_changes` (cambios REALES
de opción, regla 6) — y no se usaban para decidir nada. De ahí salen las dos
señales, en `app/lib/answer-signals.ts` (puro, se deriva al **leer**, así que
funciona sobre todo el histórico y no necesitó ni una columna):

| Señal | Cómo | Qué hace con ella el método |
|---|---|---|
| **Firmeza** | sin cambios y ≤ 20 s = *firme*; ≥ 2 cambios o > 45 s = *titubeante* | Un acierto **titubeante no pasa de la caja 3** (`MAX_BOX_TITUBEANTE`): acertar peleando no es dominar. Sin el tope, tres aciertos dudosos mandaban la pregunta a la caja 5 y no volvía en 45 días |
| **Tipo de fallo** | caja previa ≥ 3 → *olvido*; cambió de opción → *trampa*; < 8 s → *lectura*; resto → *laguna* | El de **lectura** baja a la caja 2, no a la 1 (leíste mal, no es que no lo sepas) |

**El orden de `inferErrorType` no es negociable:** el historial manda sobre la
señal (si la tenías en la caja 3, fallarla es un olvido aunque además dudaras), y
dudar manda sobre la velocidad (quien cambió de opción SÍ leyó el enunciado).

**Y sin dato NO es cero** (reglas 8 y 16): sin tiempo medido la firmeza es
*normal*, no *titubeante*. Tratarlo como titubeante castigaría a todo el
histórico anterior a la fase 2.3.

**LO ÚNICO QUE SE PREGUNTA**, y casi nunca: cuando el alumno falla una pregunta
que **ya tenía aprendida o que se le atraganta** (`mereceLaPenaPreguntar`:
cajones `consolidando` / `dominada` / `atascada`), se le ofrece corregir el
diagnóstico deducido con **tres botones, un toque, saltable** — «SIGUIENTE» está
disponible desde el primer momento. Es el único caso en que la deducción no basta
y la respuesta cambia el próximo repaso: si fue un despiste, la pregunta no debe
caer a la caja 1 y volver mañana. Fallar material **nuevo o en aprendizaje no
pregunta nada**: es lo normal y el motivo no cambia nada. Con un banco asentado
sale a 1 de cada 10 fallos, no 10 de 10.

El cajón viaja con cada pregunta (`Question.cajon`, lo pone `getAdaptiveSession`)
solo para eso. Y la corrección **ACTUALIZA** la fila que creó `handleAnswer`,
nunca inserta una segunda — y si aquel guardado falló, **no se inserta nada**:
perder una corrección opcional es preferible a duplicar un intento y sesgar el
acierto para siempre (fase 2.4, regla 7).

**Consecuencias en la configuración del test:** solo hay **dos modos** —
entrenamiento (el sistema decide) y simulacro (fiel al examen real)—. La
**dificultad solo se elige en el simulacro**: en entrenamiento la decide el
método, y dejar que el alumno fuerce «extrema» rompe justo la calibración al
85 %. Se retiraron los cuadros de calibración de resultados y de Estadísticas,
y el «Origen de tus fallos»: eran la respuesta a una pregunta que ya no se hace.

### 57 · Quien tiene preparador de verdad no ve nada de la IA

Un alumno cuyo plan físico lo escribe una persona —el de su grupo, o uno
individual que le ha puesto la academia— **no necesita nada de lo que rodea al
plan generado**: ni test inicial de Cooper, ni wizard de biometría, ni «iniciar
sesión», ni barra de progreso semanal, ni «generar la siguiente». Todo eso existe
para alimentar al modelo, y ahí el modelo no pinta nada.

Ve **un calendario de la semana** (`CalendarioEntrenamiento.tsx`): cada día con
su **fecha real** («Lun 8 sep», derivada del `week_start` del plan) y sus
ejercicios, con el de hoy destacado. Si es un plan de grupo, puede **mirar
semanas anteriores** con las flechas (`getStudentGroupWeeks`, helper
`idsGruposConPlan` compartido con `getActiveTrainingPlan`); las futuras
preparadas por adelantado siguen sin enseñarse (regla 54). No son dos vistas de
lo mismo con partes escondidas: son dos módulos distintos, y `PhysicalTrainer`
elige entre ellos ANTES que cualquier otra vista —

```ts
const modoManual = !aiOn || esPlanDeGrupo || weeklyPlan?.source === 'entrenador';
```

El `!aiOn` es lo que evita el fallo obvio: si la academia lleva las físicas a
mano y el preparador todavía no ha subido la semana, sin esa guarda el alumno
caía en el test de Cooper, que no le sirve para nada. Sin plan se le dice que
aún no lo hay (regla 8), no se le manda a hacer pruebas.

**El plan no se marca, pero cada día sí se apunta** (regla 84): un plan de grupo
es compartido y escribir en él lo reescribiría para todos (regla 53), así que el
«hecho» de cada alumno vive aparte, en `group_workout_logs`.

### 58 · El chat sale del MVP sin borrar una línea

`MODULOS_FUERA_DEL_MVP` en `app/lib/modules.ts`. El módulo `chat` sigue entero
—`IntelChat`, `actions/chat.ts`, la recuperación del temario, el historial, las
reglas 30-33 y 42— y `requireModule('chat')` lo sigue protegiendo en el servidor.
Simplemente **no se le ofrece al alumno ni sale en los interruptores del panel**.

Decisión del dueño (7 sep 2026): el coste por pregunta es alto (documento entero,
regla 33), la calidad depende de que el alumno elija bien el tema, y para el
piloto no es lo que diferencia a la plataforma — eso es el entrenamiento
adaptativo. **Para devolverlo: quitarlo de esa lista. Nada más.**

Se esconde en los DOS sitios con la misma constante —el menú del alumno
(`StudentDashboard`) y los interruptores (`AdminModules`)— porque un interruptor
para algo que el alumno no ve de todas formas es una mentira.

### 59 · El test tiene DOS modos y solo dos: entrenamiento mide nada, simulacro no adapta nada

Cerrado con el dueño el 7 sep 2026 tras dos vueltas en las que el módulo se
había llenado de fricción. El planteamiento entero vive en
[`docs/TEST-Y-ENTRENAMIENTO.md`](TEST-Y-ENTRENAMIENTO.md); lo que no se
puede reabrir sin un motivo escrito:

- **Entrenamiento** (`mode: 'practice'`): la inteligencia va TODA aquí.
  `getAdaptiveSession` → `buildSmartSession`. **Sin nota, sin reloj, sin volver
  atrás, sin blancos.** El nº de preguntas lo **propone el sistema**
  (`getRecuentoEntrenamiento`: nuevas + vencidas, tope 25) y el alumno lo ajusta.
  **La dificultad NO se elige** — la calibra el método (regla del 85 %).
  `ResultadoEntrenamiento` da el balance de cajones, nunca una nota.
- **Simulacro** (`mode: 'exam'`): fiel al examen. Reloj del BOE, sin correcciones,
  nota con penalización. Presets **25 / 50 / 100** (no número libre: dos
  simulacros tienen que ser comparables). **Aquí SÍ se elige dificultad.**
- **El simulacro NO es `shuffle(banco).slice(n)`.** `planExamen`
  (`app/lib/exam-blueprint.ts`, puro): reparto por temas, cobertura por artículo
  (`legal_reference`), no repite lo de los últimos 7 días, y **mezcla de
  dificultad fija por nivel** (`MEZCLA_DIFICULTAD`). Sin esto, comparar dos notas
  no significa nada — el banco podía dar 40 preguntas del mismo artículo o salir
  fácil un día y durísimo al siguiente. `getSimulacro` lo aplica; devuelve
  `corto: true` si el banco no llegó al preset (y la pantalla lo dice, no gasta
  IA para rellenar — regla 39).
- **`ResultadoSimulacro` es una cuadrícula 1..N.** Verde acertada · rojo fallada ·
  **blanco** (borde punteado) sin contestar. Cada celda abre el detalle: qué
  marcaste, la correcta (borde verde + check), la explicación, el artículo **y
  cuánto tardaste** — una verde de 8 s y una de 90 s no son lo mismo.
- **El alcance es el mismo en los dos modos:** un tema · por bloques del temario ·
  todo. `getStudentSyllabus` (`admin.ts`) alimenta el selector **solo con los
  temas que tienen banco activo** — ofrecer un tema vacío es mandar al alumno a un
  test de 0 preguntas. «Por bloques» agrupa por `blocks`, no 45 casillas sueltas.
  El selector de «un tema» es `SelectorTema` —hoja modal con bloques y número de
  temario— y no un `<select>` nativo (regla 62).
- **La pantalla del test no tiene reloj en entrenamiento** (regla 59), ni votos
  de «buena/mala pregunta» (nadie sabía qué hacían y tapaban la etiqueta de
  origen en el móvil). Queda **«Avisar»** (la bandera → `reportQuestion`), que sí
  sirve: si la opción marcada como correcta está mal, el alumno estudia un dato
  falso (regla 10). `option_changes` **solo se cuenta en el simulacro** — en
  entrenamiento el primer toque cierra la pregunta, así que esa columna es
  siempre 0 en las filas de entrenamiento y no es un fallo.
- **`ExamConfig` NO ofrece dificultad en entrenamiento.** La tarjeta va detrás de
  `{settings.mode === 'exam' && …}`. Hay una guarda estática en
  `answer-signals.test.ts` que lo fija (`/settings\.mode === 'exam'[\s\S]{0,120}Dificultad/`).

### 60 · Se DEDUCE cómo respondió el alumno; no se le pregunta

Ya está en la **regla 56** como principio general. Su aplicación al test:
`answer-signals.ts` saca la **firmeza** de la respuesta y el **tipo de fallo** de
tres señales que ya se guardan por respuesta —`response_time_ms`,
`option_changes`, `first_touch_ms`— **sin un solo diálogo**. El único toque que
se le pide es el de corrección del diagnóstico, y **solo** cuando falla una
pregunta cara (`mereceLaPenaPreguntar`: cajones `consolidando`/`dominada`/
`atascada`), porque solo ahí acertar el motivo cambia cuándo vuelve. Es
saltable: «SIGUIENTE» está desde el primer momento.

- **Tiempo relativo, no 20/45 s fijos:** `perfilTiempos(intentos)` da la mediana
  del propio alumno; `inferFirmeza(s, base)` lee cada respuesta contra su ritmo.
  Una pregunta de tres líneas y una de «la MÁS correcta» no se responden en el
  mismo tiempo.
- **`first_touch_ms` separa recordar de deliberar.** `null` en el histórico y en
  el simulacro (regla 8). `marcarPrimerToque` en `ActiveTest` lo captura una vez,
  al primer toque en una opción.
- **Distractor fijo** (`computeQuestionStates.distractorFijo`): la opción
  equivocada que el alumno marca **siempre** al fallar (≥ 2 veces y ≥ 60 % de sus
  fallos de esa pregunta) no es una laguna, es una **creencia falsa concreta**.
  `smart-session` la trata como **atascada**: parar de repetir, ir al artículo.
- **Una respuesta titubeante correcta no llega a la caja 5** (`MAX_BOX_TITUBEANTE
  = 3`): acertar dudando no es dominar.

### 61 · Lo que se hace mientras el alumno lee, ya está hecho cuando pulsa

Puntuar una ficha y pasar a la siguiente eran **dos viajes al servidor en fila**
—guardar, luego pedir— con un spinner a pantalla completa entre cada tarjeta:
~1 s por ficha en el móvil. Ahora `FlashcardDeck` **precarga la siguiente**
mientras el alumno lee la actual (`nextRef`), así que pulsar es instantáneo
(~150 ms). El guardado va en segundo plano y no bloquea el avance.

**Guardar y precargar van EN CADENA, no a la vez.** Next serializa las Server
Actions; lanzar `saveFlashcardProgress` y `generateFlashcard` juntas hacía que
una **abortara** a la otra (`ERR_ABORTED` en el log), la precarga se perdía y
cada ficha volvía a costar un viaje entero. Se encadenan en un `(async () => {…})()`.

`generateFlashcard` acepta `exclude` (`{ dbId, cardId }`): sin él la precarga se
traía **la misma ficha** —una vencida sigue vencida hasta que se puntúa—.

Y de paso: la animación de cambio de módulo pasó de `duration-500` +
deslizamiento a `duration-150` fundido. Medio segundo por salto **se siente**
como lentitud aunque los datos ya estén.

### 62 · «Repasar fallos» va por prioridad, no por lista plana

Era una lista de tarjetas blancas idénticas, con la fila de badges recargada
(tema + «N veces» + tipo, cada uno con icono y color) y un filtro de pastillas
en mayúsculas con scroll lateral. Rediseñado:

1. **Cómo fallas** — la mezcla de tipos de error en una barra fina + una frase
   de qué hacer si hay un tipo dominante (muchas lagunas → al temario; muchas de
   lectura → leer con calma). Se oculta entera si no hay diagnósticos —muchos
   fallos vienen del simulacro, que no los pide.
2. **Se te resisten** — las falladas 4+ veces (`esAtascada`), en su propio
   bloque ámbar y arriba. Repetirlas en tests no funciona.
3. **El resto** — filtro por tema con `SelectorTema` (la hoja modal, regla 59),
   filas compactas (tema como antetítulo, enunciado a 2 líneas, chip del tipo).

**`SelectorTema`** (`app/components/student/SelectorTema.tsx`) es el único
selector de tema de la plataforma: test, fallos y fichas. El `<select>` nativo
sobre 40+ temas es una lista infinita sin número ni bloque en Android.

### 63 · Inicio dice «qué hago hoy»; Estadísticas dice «cómo voy». No se repiten.

Los dos pintaban acierto, contestadas y las últimas 20 respuestas. Repartidos:

- **Inicio** — CTA «Entrenar» arriba, con la **racha** de días seguidos
  (`calculaRacha` en `stats.ts`, con día de gracia: si aún no has estudiado hoy
  pero sí ayer, la racha vive). Tiles (acierto · racha · en blanco), accesos a
  fallos y fichas, y «lo último» son **4**, no 20.
- **Estadísticas** — el historial entero, y tres cosas que Inicio no tiene sitio
  para dar:
  - **¿Aprobaría?** — media de simulacros con la **nota del BOE**, mejor marca,
    tendencia (últimos 3 vs 3 anteriores) y una mini-racha de barras.
    `app/lib/simulacros.ts` (puro) agrupa `question_attempts` por **`exam_id`**
    —lo pone `saveExamResults`, un uuid por simulacro; la columna existía y no la
    escribía nadie; el entrenamiento no la usa— y saca la nota con `scoreExam`
    (la misma función que la pantalla de resultados, así no divergen).
  - **Dominio del temario** — los cajones P10, de protagonista, con un «%
    dominado» global.
  - **Cómo respondes** — firmes / normales / titubeantes, **deducido y relativo**
    (`stats.firmeza`, vía `answer-signals`). Sustituye al «índice de
    incertidumbre», que era el `option_changes` viejo normalizado contra un tope
    fijo.
  - El KPI **físico solo si `training_ai` está encendido**: con plan de un
    preparador de verdad el alumno no mete marcas para el modelo.
  - **Fuera**: el rango Cadete→Inspector (el % de acierto no es estar preparado),
    «Perfil de respuesta» (Francotirador/Analista), el «ID:» y el «PROGRESO A
    INSPECTOR». `rankFor` y compañía se quedan en `stats.ts` (tests) pero no se
    pintan.

### 64 · La convocatoria la fija el admin; el alumno ve la cuenta atrás

Un opositor organiza meses alrededor de UNA fecha y la plataforma no la sabía.
Es **nacional** (Escala Básica CNP): la pone el admin una vez en «Ajustes», no
es un dato por alumno.

- `academy_convocatoria` — fila única (id=1): escala, `fecha_examen`, nota.
  `docs/sql/convocatoria.sql`, **ejecutado** (8 sep). Política de SELECT abierta (el
  alumno la lee); escritura solo clave de servicio + `requireAdmin`.
- `app/lib/convocatoria.ts` (puro): `diasHasta` cuenta por **días de calendario**
  (si el examen es mañana, «falta 1 día» diga lo que diga el reloj), no por 24 h.
- **`getConvocatoria` degrada con gracia**: si el guion no está ejecutado
  (`could not find the table`) devuelve la convocatoria vacía + `tablaFalta`, y
  «Mi perfil» dice «tu academia aún no ha fijado la fecha». Mismo patrón que
  `admin_audit_log` (regla 49) e `interview_reports`.

**«Mi perfil»** (módulo `profile`, nuevo en `MODULE_IDS`) reúne lo personal que
estaba desperdigado: la convocatoria, el acceso/pago (`memberships`), los grupos,
el correo, y el **tema** (claro/oscuro/sistema, en `localStorage`
`atenea-tema` — `StudentDashboard` lo respeta antes que `prefers-color-scheme`).
Todo se lee con la clave de servicio filtrando por el propio usuario (regla 34):
`memberships` y `class_members` son de administración.

La **biodata / psicotécnico / entrevista** (`interview`) sale del MVP como el
chat (regla 58): código entero, `requireModule` sigue protegiéndolo, solo no se
ofrece. Los datos personales que importan viven ahora en «Mi perfil».

### 65 · La academia de la sesión se resuelve una vez, no se repite en cada acción

P11 (multi-academia). `profiles` no lleva `organization_id` — la pertenencia
va por `academy_members`, muchos-a-muchos— así que ni `admin` ni `student`
podían saber a qué academia pertenecían sin repetir la misma consulta en cada
Server Action. Se resuelve **una vez**, en `getSessionUser` (`app/lib/auth.ts`,
`resolveOrganizationId`), y viaja colgada de `auth.user.organizationId` —igual
que `auth.user.role`—: ninguna acción vuelve a preguntarlo.

**Cómo se resuelve, en orden:**

1. Si la cuenta pertenece a UNA sola academia (el caso de HOY: todo el mundo,
   por el backfill del guion), es esa. Sin más vuelta, y sin tocar cookies.
2. Si pertenece a varias, se usa la cookie `atenea-academia` que deja
   `middleware.ts` al visitar `/<slug>` — el único sitio que traduce la URL a
   algo que una Server Action pueda leer, porque las Server Actions no ven la
   URL desde la que se llaman.
3. Si no hay coincidencia —cero academias, o la cookie no encaja con ninguna
   de las suyas— `null`. **Nunca se adivina**: enseñar los datos de la
   academia equivocada es peor que pedir que se identifique otra vez (regla
   34 — con la clave de servicio, nada más que el código lo impide).

**`admin` y `superadmin` se tratan igual para esto.** Un `admin` con
`organizationId` nulo se rechaza en `requireAdmin()` (fallar cerrado: dejarlo
pasar sería la mitad de las academias viendo los datos de todas). Un
`superadmin` con `organizationId` nulo también pasa por `requireAdmin()`,
pero HOY administra su propia academia resuelta exactamente igual que un
`admin` — la diferencia de rol es de cara al panel transversal de varias
academias (P11f), que no existe todavía. Promover a alguien a `superadmin` no
cambia una sola pantalla mientras solo haya una academia: es a propósito, y es
como se comprobó que promover la cuenta del dueño no rompía nada del panel de
hoy.

**Un `student` sin academia resuelta no es `pending`, es `no-academy`**
(`AccessDecision`, `app/lib/membership.ts`): son huecos distintos. `pending`
tiene una fila de `memberships` que mirar y dice «espera a que te activen»;
`no-academy` no tiene ni eso, y decirlo con el mismo mensaje mandaría a
alguien a esperar una activación que nunca decidirá nadie porque nadie sabe de
qué academia es.

**Las tablas de administración llevan `organization_id` NOT NULL**
(`class_groups`, `group_kinds`, `academy_staff`, `memberships`,
`monthly_payments`, `academy_settings`, `membership_settings`,
`academy_convocatoria`); `question_bank` y `admin_audit_log` se quedan
NULABLES a propósito (banco global / acción de plataforma). Tres consecuencias
que costó ver la primera vez:

- **`group_kinds` cambió de clave**: antes era `id` (el slug, `'fisicas'`) a
  secas; ahora es `(organization_id, id)`, porque dos academias pueden llamar
  `'fisicas'` a tipos distintos sin chocar. Todo `upsert` sobre esa tabla
  necesita `onConflict: 'organization_id,id'`, y todo `.eq('id', kindId)`
  necesita ir acompañado de `.eq('organization_id', …)` — sin lo segundo, el
  slug de otra academia con el mismo nombre se ve o se borra por error.
  `memberships` y `monthly_payments` tuvieron el mismo cambio de clave
  (`organization_id,user_id` y `organization_id,user_id,period`).
- **Los tres singleton (`academy_settings`, `membership_settings`,
  `academy_convocatoria`) perdieron su columna `id`**: la fila ya no es
  `id = 1`, es `organization_id = la-que-sea`. Un `.eq('id', 1)` que
  sobreviviera aquí no daría error — devolvería la fila de OTRA academia, o
  ninguna, sin que nada lo avisara. `tests/schema-drift.test.ts` lo pilla
  porque `id` ya no existe en el volcado del esquema.
- **`setStudentGroups` tiene que filtrar los grupos "que tiene ahora" por la
  academia activa**, no traer TODOS los `class_members` del alumno: un alumno
  en dos academias (P11, decidido que puede pasar) perdería sus grupos de la
  OTRA academia en cuanto un admin tocara el interruptor de la suya. Se
  resuelve con un `class_groups!inner(organization_id)` embebido y
  `.eq('class_groups.organization_id', …)`, no con un `.eq('user_id', …)` a
  secas.

**Lo que NO lleva `organization_id`, a propósito:** el temario
(`subjects`/`documents`/`document_chunks`, decidido: lo generas tú, es
compartido) y las tablas que ya filtran por `user_id` con la sesión del propio
alumno (regla 34) — un alumno pertenece a su academia vía `academy_members`,
duplicarlo en cada una de sus tablas no añade nada.

**Verificado el 12 sep, end-to-end, contra la BD real de producción**: con la
sesión de `morato@atenea.com` (admin real de Alphapol) en el preview, Alumnos,
Grupos, Ajustes (convocatoria + datos de la academia + profesores), Pagos,
Prep. física y Logs & Auditoría cargaron los datos reales de su academia, sin
fugas y sin un solo error en consola ni en el registro del servidor.

**`question_bank` se cerró después, el mismo día (P11c, 12 sep).** No lleva
`organization_id` NOT NULL —`null` es el banco GLOBAL, a propósito— pero ya
tiene su propio filtro, `filtroBancoPorAcademia` (`app/lib/questions.ts`):
sirve el global MÁS el privado de la academia del que pregunta, nunca el de
otra. Va en las 5 rutas de `exams.ts` que sirven preguntas a un alumno, y en
las que dicen qué temas tienen banco (`getStudentSyllabus`,
`getAcademyOverview`). El alta manual y el CSV (`moderation.ts`) deciden solo
a qué banco entra lo que escribe cada uno: `null` si es el `superadmin` (el
mismo que mantiene el global con IA), la academia de quien sea si es un
`admin` normal — `bancoDestino()`. Esto obligó a la ÚNICA extensión que se le
ha hecho nunca a `questionHash` (`app/lib/question-hash.ts`): la academia se
añade al payload SOLO cuando no es `null`, así que el banco global (IA, 1000
preguntas) sigue dando exactamente el mismo hash que antes de P11 — la regla
27 ("no se toca la fórmula") se respeta porque no se tocó para nadie que ya
existía, solo se AÑADIÓ una dimensión nueva para quien no la usaba.

**Lo que queda fuera de esta regla, a propósito, y es una decisión del
dueño, no mía:** `admin.ts` (temario y documentos, compartidos por todas las
academias) y `moderation.ts` (aprobar/descartar/editar candidatas — todas del
banco GLOBAL, porque solo el `superadmin` genera con IA) siguen con
`requireAdmin` sin acotar a `superadmin`. Cerrar esto del todo se lo quitaría
HOY a `morato@atenea.com`, que administra el temario y modera el banco de
Alphapol en el piloto real — restringirlo de golpe, sin que el dueño lo pida,
sería tomar una decisión de producto que no me corresponde. Se queda pendiente
para cuando exista una segunda academia de verdad, o para cuando el dueño lo
pida explícitamente.

**Dos huecos más, encontrados al preguntarse cómo se reparte el enlace y
cómo se invita a un admin (12 sep, después de desplegar P11f/i):**

- **El admin de una academia no tenía dónde ver su propio enlace.**
  `AcademyIdentity.tsx` («Ajustes» → «Datos de la academia») ganó una
  tarjeta «Tu enlace de acceso» con la URL completa
  (`window.location.origin` + `/<slug>`, nunca un dominio a fuego) y un
  botón de copiar. `getAcademySettings` (`settings.ts`) ahora también trae
  el `slug` —vive en `academies`, no en `academy_settings`— junto a los
  datos de siempre.
- **«Añadir admin» exigía que la cuenta ya existiera**, y eso no era lo que
  se esperaba: un superadmin dando de alta una academia normalmente está
  pensando en alguien que TODAVÍA no tiene cuenta. `addAcademyAdmin`
  (`superadmin.ts`) ahora, si no encuentra el correo, **invita** con
  `auth.admin.inviteUserByEmail` —Supabase crea la cuenta y manda el correo
  con el enlace para poner contraseña— pasando la academia como la MISMA
  metadata que ya lee el disparador de P11j (`academia_slug`): así entra
  directamente en la academia correcta en la misma operación, en vez de caer
  por defecto en `atenea`. Verificado el camino de "la cuenta ya existe"
  contra la BD real (sube el rol, añade la membresía); el de la invitación
  no se pudo mandar de verdad por el mismo límite de correos del plan Free
  de Supabase — es la misma llamada estándar de la API, con los parámetros
  correctos.

**El panel transversal SÍ llegó, el mismo día (P11f/P11i, 12 sep):**
`requireSuperadmin()` (`app/lib/auth.ts`) es una guarda NUEVA, no una variante
de `requireAdmin()` — un `admin` normal, por bien resuelta que tenga su
academia, no la pasa. La pestaña **«Academias»** (`AdminAcademies.tsx`,
`app/actions/superadmin.ts`), solo visible con ese rol, es lo único que mira a
TODAS las academias a la vez: cuántos alumnos y admins tiene cada una, cuánto
cuesta en IA (`ai_usage`, cruzado por `user_id` contra `academy_members` al
leer — la misma aproximación documentada en el guion SQL para un alumno en dos
academias: cuenta en las dos) y cuánto ha entrado este mes
(`monthly_payments`, que sí lleva `organization_id`, sin cruce). Y desde ahí se
da de alta una academia nueva (P11i, decidido: ni un guion de línea de
comandos ni autorregistro) — con un segundo paso que no estaba en el plan
pero hacía falta para que sirviera de algo: **«Añadir admin» por correo**,
sobre una cuenta que ya exista. Sin eso, una academia recién creada no tiene
nadie que la administre y darla de alta sería un callejón sin salida.

**Los reportes se enrutan por la academia de la PREGUNTA, no de quien
reporta (P11e, mismo día).** `getModerationQueue` (`moderation.ts`) cambia el
embed a `question:question_bank!inner(*)` —el `!inner` es lo que deja
filtrar por una columna de la tabla embebida— y decide: `superadmin` ve los
reportes de preguntas GLOBALES (`organization_id IS NULL`, arreglarlas
beneficia a todas); un `admin` normal ve solo los de SU academia. Un alumno de
Alphapol que reporta una pregunta global no se lo lleva `morato@atenea.com`:
se lo lleva quien puede arreglarla de verdad.

**De paso, un hueco que no era nuevo pero sí relevante para la comparativa:**
`getAiCostOverview` (el panel «Consumo IA») no estaba acotado por academia —
cualquier admin veía el gasto de TODOS los alumnos, de cualquier academia.
Se scopeó con el mismo patrón (`academy_members` para un `admin`, sin filtro
para `superadmin`), porque además hacía falta ese mismo cruce para construir
`getAcademiesOverview`.

**Verificado el 12 sep, primero sin sesión de superadmin de verdad** (no
había contraseña de `gaepmalaga@gmail.com` en ese momento): las consultas de
`getAcademiesOverview` se ejecutaron directamente contra la BD real y
devolvían lo esperado, y con la sesión de `morato@atenea.com` se confirmó que
la pestaña «Academias» no aparece para un `admin` normal, y que «Moderación»
y «Consumo IA» siguen sin errores con sus filtros nuevos.

**Verificación completa el mismo 12 sep, ya con la sesión real de
`gaepmalaga@gmail.com` en producción:** las 4 pestañas correctas (Temario &
IA, Banco Oficial, Moderación, Academias — nada de Alumnos/Grupos/Pagos/Prep.
física), todas cargando sin errores de consola. «Academias» con su
comparativa completa (2 academias, alumnos/admins/coste IA/cobrado por cada
una). **«Nueva academia» y «Añadir admin» probados de verdad**: se creó una
academia de prueba (apareció al instante con 0 alumnos/admins) y se le añadió
como admin una cuenta ya existente (`morato@atenea.com`, camino de "la cuenta
ya existe" — sin disparar ningún correo), las dos operaciones sin error.
Academia y membresía de prueba borradas después. Sin nada pendiente de este
punto.

**Corregido el mismo 12 sep, tras desplegarlo y probarlo:** el `superadmin`
SÍ heredaba una academia. `resolveOrganizationId` lo resolvía igual que a un
`admin` —por `academy_members`—, y como `gaepmalaga@gmail.com` es miembro de
Alphapol desde el backfill original del guion, su sesión de superadmin
resolvía a Alphapol y veía sus alumnos, grupos, pagos y prep. física, tal
cual se los enseñaría a `morato@atenea.com`. **Un `superadmin` no administra
NINGUNA academia**, así que:

- `getSessionUser` (`app/lib/auth.ts`) ya no llama a `resolveOrganizationId`
  para un `superadmin`: su `organizationId` es SIEMPRE `null`, venga o no de
  ningún `academy_members`. Todas las acciones de administración de UNA
  academia ya fallaban cerradas sin `organizationId` (regla 65) — este cambio
  no tocó ni una de ellas, solo dejó de dárselo al superadmin.
- **El alcance real de `superadmin` es más estrecho de lo que sugería «ve
  todas las academias»**: solo administra el banco COMÚN — el temario del
  que se generan las preguntas («Temario & IA», con el generador de IA
  dentro) y sus candidatas/reportes («Moderación») — y la comparativa
  transversal («Academias»). `AdminView.tsx` reduce sus pestañas a
  exactamente esas tres; «Alumnos», «Grupos», «Prep. física», «Pagos»,
  **«Banco Oficial»** (el alta manual/CSV y la papelera del banco, que
  también toca contenido, pero no es "el temario"), «Ajustes», «Consumo IA»
  y «Logs & Auditoría» son cosa de quien administra UNA academia, y ni
  aparecen para él. Su pestaña de entrada es «Academias», no «Alumnos».
- La pestaña guardada en `localStorage` de una sesión de `admin` no se aplica
  si el `superadmin` no la tiene disponible (comprobado contra su lista de
  pestañas antes de restaurarla) — sin esto, el mismo navegador podía dejar
  el área de contenido en blanco.

Verificado tras el cambio: `morato@atenea.com` sigue viendo sus 10 pestañas
de siempre, sin ningún cambio (el `admin` normal nunca pasó por
`resolveOrganizationId` de otra forma). `npm run check` y `npm run build` en
verde.

**Dos ajustes más, el mismo día, al probarlo de verdad:**

- **«Banco Oficial» faltaba en la lista del superadmin**, y era el hueco más
  caro de los tres: es donde se NAVEGA el banco resultante y donde el alta
  manual/CSV para el banco GLOBAL ya estaba preparada solo para él
  (`bancoDestino` en `moderation.ts` manda sus altas siempre a
  `organization_id = null`) — sin esa pestaña, esa capacidad no tenía dónde
  vivir. Se añadió de vuelta junto a Temario & IA y Moderación.
- **`academy_members` conservaba la fila del backfill original** para
  `gaepmalaga@gmail.com` en Alphapol: aunque `organizationId` ya no se lo
  daba (así que no cambiaba su acceso), sí lo hacía aparecer como «admin de
  Alphapol» en la pestaña «Academias» — un rastro que no tenía sentido para
  alguien que ya no la administra. Se borró esa fila a mano con la clave de
  servicio (dato, no código: no hay guion porque es un caso de uno).

### 66 · Un aviso de «sin revisar» que salía siempre no avisaba de nada

Encontrado probando el entrenamiento con `alumno@atenea.com` (12 sep): toda
pregunta, sin excepción, llevaba el aviso ámbar **«⚠ Generada por IA · sin
revisar»** — incluidas las 1795 del Banco Oficial, ya aprobadas y activas.
`ActiveTest.tsx` decidía el aviso con `currentQ.origin === 'bank'`, pero
**ninguna fila de `question_bank` tiene ese origen**: las 1795 se sembraron
con `seedQuestionBank`, que graba `origin: 'bank_seed'` (comprobado contra la
BD real, paginando la tabla entera). La condición nunca se cumplía con datos
de verdad, así que el aviso salía siempre — el caso contrario del que se
quería avisar.

La distinción `origin === 'bank'` es de antes de la regla 39: cuando el
alumno SÍ podía disparar generación en vivo (`origin: 'live_ai'`,
`status: 'candidate'`, sin pasar por moderación), el aviso tenía sentido.
Desde que eso se cerró, `generateAndSaveCandidate` —la única función que
crea esa combinación— **no la llama ningún componente**: quedó sin usar.
Todo lo que llega hoy a `ActiveTest` ya es `status: 'active'` (bank, seed o
manual), así que la comparación correcta no es por `origin`, es por si el
origen es uno de los dos que en teoría no deberían llegar aquí:

```ts
// MAL — nunca es 'bank' con datos reales; el aviso salía siempre
currentQ.origin === 'bank'

// BIEN — solo avisa de lo que de verdad no debería estar aquí
currentQ.origin !== 'live_ai' && currentQ.origin !== 'candidate'
```

Verificado en local contra la Supabase real, con la sesión de
`alumno@atenea.com`: la misma pregunta que antes mostraba «sin revisar» pasa
a mostrar «📚 Banco oficial». `npm run check` en verde (ningún test dependía
de la condición vieja).

### 67 · Confirmar un enlace de correo no es lo mismo que quedar dentro

Encontrado probando el alta y la invitación de admin de verdad, con el SMTP ya
funcionando (12 sep): los dos enlaces de correo (`signUp` → confirmación;
`inviteUserByEmail` → invitación) devolvían a la aplicación con una sesión sin
canjear colgando en la URL, y nadie la canjeaba — quien acababa de confirmar
su cuenta, o de aceptar una invitación de admin, aterrizaba otra vez en el
formulario de ENTRAR, con un `?code=...` o un `#access_token=...` sin usar, y
tenía que iniciar sesión a mano como si el enlace no hubiera servido de nada.

**Son dos flujos DISTINTOS, y hay que manejar los dos:**

| | Cómo vuelve | Por qué | Contraseña |
|---|---|---|---|
| Confirmar registro (`signUp` desde el propio `AppShell`) | `?code=...` (PKCE — el cliente de `@supabase/ssr` lo pide por defecto) | El navegador ya generó el `code_verifier` al registrarse | Ya la puso en el formulario de alta |
| Invitación de admin (`inviteUserByEmail`, sin cliente de por medio) | `#access_token=...&refresh_token=...&type=invite` (flujo implícito — no hay `code_verifier` que canjear) | La invitación la dispara el servidor, no un navegador con PKCE | **Nunca la puso — `inviteUserByEmail` no la pide** |

`AppShell.tsx` (`checkSession`) ahora resuelve los dos: `?code=` se canjea con
`exchangeCodeForSession` y entra derecho al panel (ya tiene contraseña);
`#access_token=`+`#refresh_token=` se establece con `setSession`, y si el
`type` es `invite` se le enseña una pantalla nueva — **`SetPasswordScreen`**
(`app/components/auth/`, mismo lenguaje visual que `LoginScreen`, regla
43) — que pide una contraseña antes de dejarla pasar. Sin este paso, un admin
recién invitado entraba una vez con el enlace y se quedaba **sin forma de
volver a entrar**: `signInWithPassword` no tenía nada que comprobar contra una
cuenta que nunca tuvo contraseña. Es el mismo fallo, ya real, de
`comprofresh@gmail.com` (regla 65): aceptó la invitación pero nadie le pidió
que pusiera una clave.

El código se limpia de la URL con `history.replaceState` en cuanto se lee,
haya funcionado el canje o no: un código de un solo uso que falla (enlace
reutilizado, ya canjeado en otra pestaña) no puede quedarse ahí intentándolo
en cada visita — se le pide entrar a mano en su lugar, sin enseñar un error
técnico sobre un código que ya no importa.

**Verificado en local contra la Supabase real, con enlaces generados por la
API de administración** (los del correo se invalidan solos: Gmail los
pre-visita por seguridad y gasta el token de un solo uso antes de poder
pulsarlos a propósito) — los dos caminos, registro e invitación, entran
derecho sin pasar por el formulario de login. `npm run check` en verde.

### 68 · Los interruptores de físicas eran globales, no por academia

Encontrado el 12 sep probando con dos academias reales: `module_settings`
—de donde salen `training_ai` y `training_group` (regla 54)— tiene una
columna `organization_id` desde `P11-multi-academia.sql`, pero **nadie la
usaba**. La clave de conflicto del `upsert` es `module_id` a secas, así que
había UNA fila `training_ai` para toda la plataforma: apagarlo en una
academia lo apagaba en todas. Es el mismo agujero que P11c cerró para
`question_bank` (regla 65), pero en esta tabla nadie lo tocó.

**Sin DDL disponible, la academia se incrusta en el propio `module_id`**
(mismo truco que ya usa P8, regla 54, para no tocar el esquema):
`trainingSwitchModuleId('ai', organizationId)` da `training_ai:<uuid>`. Cada
academia tiene así su propia fila con el mecanismo de siempre — sin fila
sigue siendo encendido, un fallo de lectura se cae a encendido.

**Y de paso, una regla de negocio nueva (decidida el mismo día): `ai` y
`group` son EXCLUYENTES por academia.** La academia «casa»
(`ACADEMIA_CASA_SLUG` = `atenea`, `lib/academies.ts`) es **solo-IA** — el
alumno se genera su plan, sin grupos de físicas —; cualquier otra academia es
**solo-manual** — un preparador escribe el plan por grupo, sin que el alumno
pueda pedirle uno a Gemini —. `aplicaReglaCasa` (`training-switches.ts`)
fuerza el que no toca a `false` **pase lo que diga la fila guardada**, y es
lo único que `requireTrainingSwitch` / el panel de admin / el módulo del
alumno leen — no hay un segundo camino que se olvide de comprobarlo.
`setTrainingSwitch` además RECHAZA que un admin encienda el interruptor que
no le toca a su academia (defensa en profundidad: una Server Action es un
endpoint público, regla 1).

El panel de admin (`AdminPhysical.tsx`) ya no muestra los dos interruptores
con uno oculto por CSS (como estaba desde regla 48): ahora **ofrece solo el
que corresponde** — `esCasa` decide cuál, que viaja en la respuesta de
`getTrainingSwitches`.

Verificado en local contra la Supabase real, con la sesión de
`morato@atenea.com` (Alphapol, NO es la casa): solo aparece «Plan de físicas
manual por grupo», y el grupo real de la academia (con sus semanas ya
escritas) sigue intacto — la migración no tocó ni una fila de
`group_training_plans`. `npm run check` en verde, con los tests de
`aplicaReglaCasa` y del `module_id` compuesto nuevos.

### 69 · «¿Olvidaste tu contraseña?» no existía

La regla 67 dejó el backend listo para un enlace de recuperación —
`checkSession` ya sabe tratar `type=recovery` igual que `type=invite`, con
`SetPasswordScreen`— pero nadie había puesto el botón que lo dispara. Un
alumno o admin que olvidara su contraseña no tenía ninguna salida.

`LoginScreen` gana un enlace «¿Olvidaste tu contraseña?» (solo en modo
`login`, debajo del campo de contraseña) que llama a
`supabase.auth.resetPasswordForEmail(email, { redirectTo: origin })` desde
`AppShell.handleForgotPassword`. **El mensaje es el mismo exista o no la
cuenta** («si existe una cuenta con…») — Supabase ya no distingue, y decirlo
serviría para averiguar qué correos están dados de alta en la plataforma.

De paso se le dio a la plantilla de correo «Reset password» de Supabase la
misma marca que «Confirm sign up» e «Invite user» (regla 66/67 del email):
español, cabecera Atenea Policial, botón rojo — antes era la plantilla en
inglés por defecto, sin tocar.

### 70 · Registrarse ya no da acceso: se solicita, y la solicitud se avisa por correo (P12)

Decisión del dueño (12 sep 2026): la norma global pasa a ser que **todo**
alumno que se registra espera a que su academia lo acepte — **incluida
`atenea`**, la casa, que hasta entonces daba acceso directo (regla 65/P11j).
El admin recibe un correo cuando hay una solicitud nueva, la acepta o la
rechaza desde el panel, y el alumno recibe el resultado por correo. Como
excepción, cada admin puede dejar una lista de correos que entran directos,
sin solicitud ni pago.

**«Pendiente» ya no es solo la ausencia de fila.** Antes (regla 52) bastaba
con que no hubiera fila en `memberships` — nadie avisaba de nada, el admin
tenía que abrir el panel para enterarse. Ahora hace falta poder decir «esto ya
se le avisó al admin» y no volver a mandar el correo cada vez que el alumno
abre la app, así que `access_status` admite un tercer valor, `'pending'`, y el
primer contacto de un alumno nuevo (`resolveFirstContact`,
`app/lib/registration-requests.ts`) le crea una fila real la primera vez que
`checkAccess` (`auth.ts`) lo encuentra sin ninguna. Las dos formas —sin fila, o
fila `pending`— **decretan lo mismo** en `decideAccess`: fuera hasta que
alguien decida. El upsert es `ignoreDuplicates: true` (regla 3): dos pestañas
abriéndose a la vez no mandan el correo dos veces, porque solo la que de
verdad CREÓ la fila dispara el aviso.

**El correo de la solicitud y de su resolución NO los manda Supabase Auth.**
El SMTP que se configuró ahí (regla 2 de «Lo que solo puedes hacer tú») solo
cubre SUS propios correos: confirmar cuenta, invitación, recuperar clave.
Avisar a un admin de que hay una solicitud, o avisarle a un alumno de si se le
acepta o no, es la app decidiendo mandar un correo por su cuenta — así que se
reusa la MISMA cuenta Gmail (`atenea.alumnos@gmail.com`), pero conectada
DIRECTAMENTE desde la app con `nodemailer` (`app/lib/mailer.ts`), no a través
de Supabase. Necesita sus propias variables de entorno (`SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) — **distintas** de la configuración de
Supabase, aunque apunten a la misma cuenta. `sendMail` nunca lanza (mismo
patrón que `ai-usage.ts`/`admin-audit.ts`): sin las variables, se registra en
el log del servidor y no manda nada — dar de alta a un alumno tiene que quedar
hecho aunque el aviso no llegue.

Las plantillas (`app/lib/app-email-templates.ts`, puro, con tests) siguen el
mismo lenguaje visual que las de Supabase (reglas 66/67/69): cabecera oscura,
filete de la bandera, botón rojo. `setMemberAccess` manda el correo de
resolución **solo si el estado CAMBIA de verdad** — pulsar dos veces el mismo
botón no manda un segundo correo — y sirve para las dos cosas a la vez: la
PRIMERA resolución de una solicitud, y una suspensión o reactivación más
adelante. No hacía falta un camino separado para cada una.

**Los exentos** (`membership_exemptions`, una lista por academia) son la
excepción que decide el admin de antemano: un correo ahí entra `active` +
`exempt` directo, sin pasar por la solicitud ni avisar a nadie. `exempt` es un
booleano en la propia fila de `memberships`, no una fila aparte — así que
añadirlo a la lista NO reactiva sola a un alumno que ya estuviera `pending` o
`suspended`; la lista blanca solo decide lo que pasa la PRIMERA vez. En
**Pagos** (P8), un exento aparece en la rejilla —para que se vea que existe y
por qué no paga— pero no cuenta en `pagados`/`porPagar`/`cobrado`: no es ni
«pagó» ni «debe», es un caso aparte, y contarlo como cualquiera de los dos
mentiría sobre cuánto se ha cobrado (regla 8).

**Invitar a un alumno por correo** (`inviteStudent`, mismo patrón que
`addAcademyAdmin` de la regla 65: si la cuenta no existe, se invita con
`auth.admin.inviteUserByEmail` y la academia viaja como metadata para que el
disparador de P11j la asigne sola) **NO pasa por la solicitud**: el admin ya
está decidiendo por él al invitarlo, así que entra `active` directamente —
pero no `exempt`: invitar y eximir de pago son dos decisiones independientes,
y el admin puede tomar la segunda aparte si quiere.

**Una academia NUEVA nace CERRADA** (`membership_settings.required` con
`DEFAULT true`, al revés que la regla 52 original) — esto no toca las
academias que YA EXISTEN, que tienen su fila explícita a `false`: esas se
encienden aparte, y solo DESPUÉS de dar acceso de golpe a todos sus alumnos
actuales (`activateAllCurrentStudents`), para que nadie se quede fuera al
encender el interruptor. El mismo orden que ya obligaba el guion de P6.

Guion [`docs/sql/P12-solicitudes-y-exentos.sql`](sql/P12-solicitudes-y-exentos.sql)
**ejecutado y verificado** (12 sep 2026): el `CHECK` de `access_status` admite
`pending`, existe `memberships.exempt`, `membership_exemptions` tiene RLS sin
políticas, y `membership_settings.required` por defecto es `true`. Migración de
datos hecha el mismo día: acceso `active` dado de golpe a los 4 alumnos de
Alphapol y al 1 de `atenea` que ya existían, y **después** encendido el
interruptor en las dos academias — nadie se quedó fuera.

**Actualización el mismo día: Gmail se abandonó del todo, por Resend con
dominio propio.** La cuenta `atenea.alumnos@gmail.com` quedó bloqueada por
Google (sospecha de bot, apelación sin resolver) — ni con la contraseña de
aplicación correcta dejaba autenticar (`535 5.7.8 Username and Password not
accepted`), y eso también cortaba el SMTP de Supabase Auth que llevaba semanas
funcionando. Se compró **`ateneapolicial.com`** (Cloudflare Registrar, precio
al coste, sin subidas de renovación) y se verificó en **Resend** (el "Auto
configure" de Resend deja los registros DNS solo, con permiso a la cuenta de
Cloudflare). `app/lib/mailer.ts` ya no usa `nodemailer`/SMTP: es una llamada
`fetch` directa a la API REST de Resend (`RESEND_API_KEY`, sin SDK — es una
sola petición HTTP, no compensa la dependencia). Y el SMTP de **Supabase
Auth** (confirmar cuenta, invitación, recuperar clave) se migró también al
relay SMTP de Resend (`smtp.resend.com`, usuario `resend`, la misma API key
de contraseña) — los dos caminos de correo de la plataforma comparten ahora el
mismo dominio y el mismo proveedor. Verificado end-to-end los dos: un correo
de prueba por la API de Resend, y un `resetPasswordForEmail` real disparado
contra Supabase, ambos recibidos.

### 71 · Un solo byte NUL tumba la fila entera, y Postgres no dice por qué

Al indexar un PDF nuevo (los exámenes oficiales de la regla 72), uno de los
cinco falló al insertar en `documents` con un error que no decía nada:
`unsupported Unicode escape sequence`. Ni el nombre de la columna, ni el
caracter, ni una pista de qué fila. Es un error real de Postgres: **`text` no
admite el byte NUL (código 0), y no hay forma de escaparlo** — no es una
cuestión de tamaño ni de codificación, ese byte no puede vivir ahí, punto.

Y ya estaba previsto, solo que apuntaba a la línea equivocada.
`cleanLegalText` (`app/lib/text.ts`) traía desde siempre un comentario que
decía *"el original usaba `.replace(/[]/g, '')` para limpiar caracteres de
control"* — pero una clase de caracteres **vacía** en una regex de JavaScript
no casa con nada. Era un no-op silencioso desde el principio, documentado como
tal (`tests/text.test.ts` lo tenía marcado `BUG:` exactamente por esto), y
nunca había hecho falta arreglarlo porque el temario real (51 PDF) nunca trajo
un byte así. Un PDF de un tercero sí lo trajo — probablemente un glifo de una
fuente Type3 mal decodificado por `pdf2json` — y ahí se notó.

El arreglo es `.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')`, los caracteres
de control C0 de verdad, **salvo tabulador, salto de línea y retorno de
carro** — esos tres los sigue necesitando `rejoinPdfLines` justo debajo, y
quitarlos habría deshecho la reconstrucción de párrafos de la regla 9.

**La lección no es solo el regex.** Es que un comentario que describe una
intención («esto limpia caracteres de control») no es lo mismo que el código
cumpliéndola, y aquí sobrevivió sin que nada lo cantara porque el caso que lo
destapa —un byte NUL de verdad en el texto— es raro. `uploadTopicPDF` (el
mismo camino que usa el panel de administración) se beneficia del arreglo
igual que el guion de siembra: es la misma función, sin duplicar nada.

### 72 · El temario también admite exámenes reales como tema extra

El dueño preguntó si comprar el temario de pago de una academia rival (120€,
marca de agua con el email del comprador para rastrear redistribución) para
generar preguntas con IA a partir de él. Se desaconsejó: comprar un libro y
estudiar de él es uso personal legítimo, pero subir el compilado editorial de
un competidor —su selección de preguntas, sus mnemotécnicos— para fabricar un
banco que sirve a los alumnos de PAGO de varias academias ya no es estudio
personal, es competencia desleal, y la marca de agua deja claro que el
vendedor lo vigila activamente. No se construyó esa función.

La alternativa limpia: los **exámenes oficiales reales** de las últimas cinco
convocatorias de la Escala Básica (2021-2025) están publicados gratis, sin
registro, en `blucop.es/examenes` — cuadernillos oficiales del Estado con su
plantilla de respuestas correcta, la misma categoría que las leyes del BOE que
ya usa Atenea (no el material compilado de una academia privada). El Portal
del Aspirante de la Policía Nacional (`policia.es/portalaspirantes`) es la
fuente primaria; blucop.es es un espejo gratuito conveniente.

Los cinco PDF (versión "resuelta y desarrollada", con explicación y
referencia legal de cada pregunta) se indexaron como **cinco temas más**, en
un bloque nuevo `EXÁMENES OFICIALES ANTERIORES` (`topic_number` 46-50, fuera
del rango 1-45 del temario real para no interferir con su cobertura). El
guion [`scripts/operacion/indexar-examenes-oficiales.mjs`](../scripts/operacion/indexar-examenes-oficiales.mjs)
reutiliza `chunkDocument`/`cleanLegalText` de `app/lib/text.ts` — la misma
regla de siempre: no duplicar la lógica de indexado del panel de
administración. Es reanudable (salta lo ya indexado) y fue justo el que
destapó el bug de la regla 71. Resultado: 571 fragmentos, ninguno con
referencia de artículo (es normal — son preguntas y respuestas, no texto
legal estructurado).

### 73 · El motor adaptativo v2 aprende del comportamiento, no de etiquetas — y por qué se descartó un diseño más ambicioso

El dueño planteó la pregunta de fondo: *«no creo que la plataforma ayude a
los alumnos a aprender de sus fallos»*. Se exploró un rediseño completo con
`claims` (hechos atómicos), un grafo de confusión etiquetado a mano y una
taxonomía de mecanismos de distractor por opción — un diseño de
investigación aplicada, documentado a fondo, pero **descartado** por dos
premisas que puso el dueño al cerrarlo: **los admins no van a meter
etiquetas por pregunta, y los admins no usan IA** (así que tampoco vale un
asistente que ellos tengan que revisar). Y una segunda razón, encontrada al
comprobarlo: las preguntas que escribe una academia a mano o importa por
CSV —P2, regla 27— **nunca llevan `legal_reference`**
(`app/actions/moderation.ts`, `aFilaNueva`), así que cualquier mejora que
dependa del artículo no llega al contenido propio de cada academia (P11c).

**El principio que queda fijado:** la inteligencia sale del comportamiento
del alumno —lo que ya se mide o es barato de medir—, nunca de que alguien
etiquete la pregunta. Escribir una pregunta sigue siendo lo de siempre:
enunciado, 3 opciones, cuál es la correcta, una explicación. Lo construido:

- **El foco perdido ya no contamina la firmeza.** `response_time_ms` leía
  una llamada de teléfono a mitad de pregunta como «dudó mucho», y esa es la
  única señal que decide si un acierto sube de caja
  (`MAX_BOX_TITUBEANTE`). `ActiveTest.tsx` escucha `visibilitychange` y
  resta el tiempo sin foco ANTES de guardar nada — sin columna nueva, el
  dato que se manda ya es el correcto (`metricasRef` lleva un `focoPerdido`
  por pregunta).
- **Curva de olvido personal, por PREGUNTA** (`factorPersonal` en
  `question-scheduler.ts`): el intervalo fijo de la caja (`BOX_INTERVALS_DAYS`)
  se recorta hasta un 40 % según cuántas veces ha recaído ESA pregunta para
  ESE alumno (`lapses`, que ya se contaba). Solo RECORTA, nunca alarga — el
  único lado en el que equivocarse sale barato. No es un modelo de memoria
  por concepto (eso exigiría el diseño descartado): es el mismo dato de
  siempre, mejor aprovechado.
- **La programación se hace visible** (`razonRepaso` en `smart-session.ts`):
  el planificador ya decide de qué cubo sale cada pregunta —recaída,
  atascada, repaso, consolidar, nueva, refuerzo—; antes esa decisión se
  tiraba al aplanar la sesión a una lista de ids. Ahora viaja como
  `Question.porQueHoy` y se enseña en una frase antes de contestar («te
  toca porque la fallaste hace 3 días» / «una más y se retira una
  temporada»). Nada de motor nuevo: es la misma decisión, dicha en voz alta.
- **Feedback distractor-consciente, sin pedirle nada nuevo a quien escribe.**
  `buildQuestionPrompt` (`question-prompt.ts`) ahora exige que `explanation`
  diga también por qué CADA opción incorrecta está mal, no solo por qué la
  correcta vale — cero esfuerzo humano, lo escribe el modelo igual que
  siempre. Y `validateGeneratedQuestion` (`ai-output.ts`) exige un mínimo
  real de contenido (`MIN_EXPLANATION_CHARS = 20`): antes una cadena vacía
  pasaba igual que una explicación de verdad. Como los tres caminos de
  escritura del banco pasan por esta función (regla 27: IA, alta manual,
  CSV), el mínimo sube también para lo que escribe una academia a mano, sin
  tocar tres validaciones distintas ni añadir un solo campo al formulario.
- **Los tres tipos de blanco** — `tipoDeBlanco` en `answer-signals.ts`:
  `ignorancia` (nunca tocó ninguna opción) vs. `calculo` (llegó a marcar y
  la retiró con «Dejar en blanco», regla 26 — decidió que no compensaba
  arriesgar). Se deduce de `first_touch_ms`. Enganchado en
  `ResultadoSimulacro` (`ExamResults.tsx`): si algún blanco fue por cálculo,
  lo dice en una frase.

  **Un fallo real, encontrado al engancharlo:** `toResultRow`
  (`exam-results.ts`) forzaba `first_touch_ms` a `null` para CUALQUIER
  blanco, con el comentario «un blanco no tiene primer toque». Era cierto
  para el blanco por ignorancia (nunca tocó nada, así que ya llegaba sin
  dato), pero FALSO para el blanco por cálculo: el botón «Dejar en blanco»
  (regla 26) retira una respuesta YA marcada, así que `first_touch_ms` sí se
  había medido — y el servidor lo borraba antes de guardarlo, destruyendo
  justo el dato que distingue los dos casos. Es el mismo patrón de la regla
  38 («lo que no se ha usado, no funciona»): el código llevaba así desde la
  regla 26, y nadie lo notó porque nada leía `first_touch_ms` en un blanco
  hasta ahora. Arreglado: ya no se fuerza a `null`, `normalizeFirstTouch` se
  aplica igual que en una respuesta contestada.

- **`answer_path`** (el camino completo de la respuesta) — **ejecutado y
  enganchado** (14 sep). `docs/sql/camino-respuesta.sql` lo ejecutó el
  dueño; `node scripts/schema-snapshot.mjs` lo confirmó contra la BD real.
  `ActiveTest.handleAnswer` anota un índice por cada marca REALMENTE
  distinta a la anterior (mismo criterio que `option_changes`, así que
  `answer_path.length` es siempre `option_changes + 1`), viaja por
  `AnswerMetrics`/`ResultRow` (`exam-results.ts`, con el mismo criterio que
  `first_touch_ms`: NO se fuerza a `null` en un blanco por cálculo), y
  `patronDeCambio` (`answer-signals.ts`) lo lee de vuelta: `directo` /
  `autocorreccion` / `vuelta_a_inicial` (cambió y volvió a su primer
  instinto — la peor de las tres, y algo que un simple contador no podía
  distinguir de una autocorrección limpia). `inferFirmeza` ya la usa: una
  vuelta a inicial es titubeante SIEMPRE, mande lo que mande el conteo de
  cambios. **Verificado escribiendo de verdad contra la producción real**
  (con sesión de `laura.gomez@academia-demo.es`, comparando contra el reloj
  del propio servidor para no confundirse con las fechas simuladas del
  guion de siembra): las respuestas nuevas guardan `answer_path` con el
  índice correcto.

**Priorizar el repaso por peso real del examen — construido (14 sep), con una
corrección de rumbo por el camino.** Primero se dijo que hacía falta un
proyecto aparte porque los exámenes reales de la regla 72 eran «571
fragmentos de texto sin trocear, 0 preguntas estructuradas» y extraerlas
«probablemente necesitaría IA». **Eso también era un error** — el mismo tipo
de error que decir «500 exámenes» sin haber mirado la BD: una afirmación
sobre datos sin haber leído el dato. Al leer `documents.full_text` de verdad,
los 5 PDF («resueltos y desarrollados» por BluCop) etiquetan CADA pregunta
con su propio patrón de texto — `N. enunciado... A) B) C) con ✔ en la
correcta... POR QUÉ explicación... Tema M · Título` — consistente en 497 de
las 500 preguntas (las 3 que faltan son variación de OCR, no un fallo del
patrón). Ningún modelo hace falta: es un `matchAll` de una expresión regular.

- `extraeTemasDeExamenReal` (`app/lib/exam-weights.ts`, pura, con tests):
  lee `Tema\s+(\d{1,2})\s*·` del texto y devuelve un número de tema (1-45)
  por cada pregunta real encontrada.
- `scripts/operacion/calcular-pesos-examenes.mjs`: lee los 5 documentos,
  cuenta por tema y genera `app/lib/exam-weight-data.ts` —
  `PESO_EXAMEN_REAL: Record<number, number>`, **497 preguntas reales
  clasificadas**, de tema 30 (1 pregunta) a tema 3 (32 preguntas). Dato
  histórico, comitado como cualquier otra constante de referencia — no se
  recalcula en cada despliegue, solo si se añade una convocatoria nueva.
- `smart-session.ts` (`pesoExamenReal`) lo usa como **desempate**, nunca
  como criterio principal: dentro de `recaida`/`repaso`/`consolidar`, la
  urgencia (días de retraso, número de recaídas, acierto) sigue mandando
  primero — el peso real del examen solo decide entre preguntas igual de
  urgentes. Sin `topicNumber` (algún tema sin resolver), el desempate no
  pesa ni a favor ni en contra: nunca se inventa un peso que no hay.

Verificado con el guion real contra la BD (497/500, desglosado por año) y
con tests que fijan el patrón exacto del PDF, incluido el espaciado real
(«distractores típicos.  Tema 5 ·», con doble espacio, tal cual sale del
PDF). `npm run check` (997 tests) y `npm run build` en verde.

**Lo que se dejó fuera de esta vuelta, y sigue siendo lo correcto dejar fuera:**
- **Un grafo de confusión entre preguntas descubierto de los datos**
  (`detectaConfusion`, `app/lib/question-confusion.ts`, con tests). Se
  replanteó al construirlo: el diseño original hablaba de «el mismo señuelo»
  entre dos preguntas, pero eso exigiría saber que la opción 1 de A y la
  opción 1 de B representan la MISMA idea falsa — y eso es exactamente la
  taxonomía de mecanismos de distractor que se descartó por pedir etiquetas.
  Lo que SÍ se puede medir sin etiquetar nada: si los alumnos que fallan A
  fallan B MÁS de lo que el azar explicaría (`lift` = co-fallo real dividido
  entre el esperado si fueran independientes), comparando solo DENTRO del
  mismo tema. No dice por qué se confunden, pero señala dónde mirar — dos
  preguntas con co-fallo alto suelen ser la misma distinción mal explicada o
  casi duplicadas (regla 35). Gateado por un mínimo de alumnos que hayan
  respondido a las dos (`MIN_ENCUESTADOS = 8`) y un mínimo de co-fallos
  reales, así que con poco volumen simplemente no devuelve nada — no hace
  falta una bandera aparte para «esperar a que haya datos».

  **Dónde vive, y por qué ahí y no en `smart-session`:** en «Alumnos»
  (`AdminStudents.tsx`), junto a «Preguntas que falla casi todo el mundo»
  (regla 35, mismo patrón exacto: se calcula de los intentos que
  `getAcademyOverview` ya trae a memoria, sin consulta nueva, y se enriquece
  con el enunciado de las dos preguntas después). Es una herramienta de
  revisión para el admin, no algo que decida qué le sirve la plataforma a un
  alumno: es una señal estadística sin validar, y dejar que reprogramara
  sesiones de examen sin que nadie la hubiera mirado antes sería apostar la
  experiencia de un alumno a un `lift` que nadie ha comprobado que signifique
  algo de verdad. Si con el tiempo los admins confirman que los pares que
  salen son confusiones reales, ese es el momento de plantear que alimente
  `smart-session`.

**Verificado en local, con sesión real de alumna** (`laura.gomez@academia-demo.es`,
academia Demo): el entrenamiento enseña «Está en aprendizaje y le tocaba su
repaso.» antes de la pregunta, y el panel de fallo sigue funcionando igual
que antes. `npm run check` (969 tests, tras el arreglo de `first_touch_ms`)
y `npm run build` en verde.

### 74 · PostgREST corta a 1.000 filas SIN avisar — y el entrenamiento adaptativo llevaba tiempo trabajando con menos de la mitad del histórico

Encontrado el 14 sep 2026 investigando por qué "Alumnos" iba lento: no era el
código nuevo (`detectaConfusion` tarda 24 ms con 1.782 intentos reales), era
que la función de Vercel corría en EE.UU. y Supabase en Irlanda —arreglado en
la propia Vercel, sin tocar código: región `dub1`, la misma que `eu-west-1`—.
Pero mirando el código para descartarlo salió un fallo real y más grave.

`getAcademyOverview`/`getStudentDetail` (`academy.ts`) y CUATRO sitios de
`exams.ts` —incluida `getAdaptiveSession`, la que calcula los cajones del
entrenamiento adaptativo— pedían hasta `MAX_INTENTOS`/`MAX_INTENTOS_SCHEDULER`
(20.000-30.000) con `.limit()`. **PostgREST corta a lo que tenga configurado
el proyecto (`db-max-rows`, hoy 1.000) pase lo que pase**: no es un error, es
un `206 Partial Content` con la cabecera `Content-Range` diciendo el total
real, y nada de este código la miraba — verificado contra la BD real:
`Content-Range: 0-999/1782`.

La consecuencia real: **cualquier alumno con más de 1.000 respuestas ya tenía
su propio entrenamiento adaptativo calculado sobre un histórico incompleto**
— cajones, rachas, curva de aprendizaje, ¿Aprobaría?, todo. No hacía falta
que fallara nada para que pasara: PostgREST respondía correctamente A LO QUE
LE CABÍA, así que ni un test ni un log lo habría cantado nunca.

`paginaCompleta` (`app/lib/pagination.ts`, puro, con tests) pagina por
encima del tope, inyectando cómo se pide cada página — no importa Supabase,
lo usa el que llama con su propio cliente (servicio o sesión). Enganchado en
los 6 sitios (2 en `academy.ts`, 4 en `exams.ts` vía `fetchIntentosDelAlumno`).
Verificado end-to-end contra la BD real y en pantalla, con sesión de alumna:
entrenamiento, «Repasar fallos», Estadísticas (dominio del temario y
¿Aprobaría?) siguen funcionando igual, ahora sobre el histórico completo.

**De paso, la vista que pidió el dueño: «lo que te toca», de un vistazo.**
`proyeccionRepaso` (`question-scheduler.ts`, pura, con tests) cuenta cuántas
preguntas VENCEN cada uno de los próximos 7 días — no es una promesa de
sesión (`buildSmartSession` reparte con cupos, no sirve todo lo vencido de
golpe), es cuántas hay esperando. Lo atrasado cuenta en HOY, no se reparte;
las nuevas (caja 0) no tienen fecha fija y no entran. Vive en «Mi perfil»
(`MiPerfil.tsx`), con un desliz real de camino: la fecha se formateaba con
`.toISOString()`, que convierte a UTC — en cualquier huso por delante de
Greenwich (España incluida) la medianoche local cae en la tarde del día UTC
anterior, y «hoy» se habría etiquetado como ayer. Arreglado con un formateo
en LOCAL (mismo principio que la regla 54 con `lunesDeSemana`), y el test que
lo detectó se dejó documentado para que no vuelva.

Verificado en pantalla con sesión real de alumna: «Lo que te toca» mostró
154 hoy, 36 mañana, 3-9-0-4-11 el resto de la semana, con el día sin nada
correctamente apagado. `npm run check` (1011 tests) y `npm run build` en
verde.

**Y el banco también (6 nov 2026).** Esta regla se arregló para las
RESPUESTAS, pero las lecturas del BANCO seguían sin paginar, y el banco pasó
de 1.795 a 4.617 preguntas el 16 sep (regla 78). Desde entonces el
entrenamiento, el simulacro, «hoy te tocan N», el selector de temas, el mapa de
cajones, «Mi evolución» y la cobertura del panel de la academia veían solo
1.000 preguntas, siempre las mismas. Se vio porque «Mi evolución» decía «1000
preguntas a tu disposición». Arreglado en las siete:

- **`bancoLigero` / `preguntasCompletas`** (`exams.ts`): las columnas ligeras
  de todo el banco, paginadas y con `.order('id')` (sin orden fijo dos páginas
  pueden repetir o saltarse filas), y el texto completo solo de las elegidas,
  de 100 en 100. Así no se trae el texto de 4.617 preguntas en cada sesión.
- **Una guarda en `pagination.test.ts`**: toda lectura de `question_bank` con
  `.select` tiene que decir cuánto trae (`.range`, `.limit`, unas `id`, una
  sola fila o solo la cuenta). Probada contra el código de antes: lo señala.
- **Verificado contra la BD real** (app local, sesión de alumno de prueba):
  «Mi evolución» dice 4.617, el selector 45 temas, el entrenamiento y el
  simulacro cargan, y el panel de la academia lista a los alumnos.

### 75 · Un admin de academia podía tocar el banco de OTRA academia, o el global entero

El dueño preguntó, mirando el panel de un admin de academia real (14 sep
2026): *«¿por qué tiene "Temario & IA" si eso solo lo debería generar el
superadmin? ¿Y las candidatas del banco global, quién las modera, cualquiera?
¿Y "Consumo IA" para qué le sirve a un admin normal?»*. Las tres preguntas
apuntaban al MISMO agujero que la regla 65 ya había dejado por escrito como
pendiente: P11c acotó bien la **lectura** del banco (`filtroBancoPorAcademia`:
global + el privado de la propia academia, nunca el de otra), pero la
**escritura** se quedó sin el mismo filtro. Comprobado contra la producción
real antes de tocar nada:

- `seedQuestionBank` escribe **siempre** en el banco GLOBAL (no lleva
  `organization_id`) y por defecto en estado `active` —ni siquiera pasaba por
  moderación—: cualquier `admin`, de cualquier academia, podía sembrar
  preguntas activas para TODAS las academias con un clic. Lo mismo
  `seedFlashcardBank` sobre `flashcard_bank`, que no distingue academia en
  absoluto.
- `disableQuestion`, `updateQuestion` y `approveQuestion(s)` no comprobaban
  de quién era la pregunta: un `admin` normal podía desactivar, editar o
  aprobar por id cualquier fila de `question_bank`, incluida la de otra
  academia o el banco global entero.
- `discardAllQuestions` («Vaciar banco») no filtraba por academia en
  absoluto: un solo clic desde CUALQUIER academia descartaba el banco
  GLOBAL completo, el de todas a la vez.
- `resolveReport` resolvía cualquier reporte por id, sin comprobar que la
  pregunta reportada fuera de la academia de quien lo resolvía —al revés que
  la *lectura* de reportes, que P11e sí enrutaba bien.
- `getModerationQueue` traía TODAS las candidatas sin filtrar: un admin
  normal veía —y podía aprobar o descartar— las candidatas generadas por
  cualquier otro admin de cualquier academia.

**La solución no es solo esconder pestañas.** Una Server Action es un
endpoint público (regla 1): ocultar «Temario & IA» en el menú no impide
llamar a `uploadTopicPDF` directamente. Dos cambios, los dos necesarios:

1. **Lo que toca al banco COMÚN pasa de `requireAdmin()` a
   `requireSuperadmin()`**: `uploadTopicPDF`, `deleteDocument`,
   `reindexDocument`, `getDocumentChunks`, `deleteTopic` (Temario & IA
   entero), `seedQuestionBank`, `generateAndSaveCandidate`,
   `seedFlashcardBank`, `getFlashcardBankCounts` (sembrar), y
   `approveQuestion`/`approveQuestions` (aprobar solo tiene sentido sobre
   una candidata, y las candidatas ya son siempre del banco global). También
   `getAiCostOverview` («Consumo IA»): con la generación restringida al
   superadmin, el único gasto de IA por alumno que queda hoy es el plan de
   físicas en la academia «casa» —en cualquier otra academia (banco manual)
   esa pestaña saldría siempre a 0 €, así que se concentra en el panel
   transversal del superadmin en vez de repetir una pestaña muerta en cada
   academia (decisión del dueño, no algo que se pudiera derivar solo del
   código).
2. **Lo que se queda en `requireAdmin()` —`disableQuestion`, `updateQuestion`,
   `discardAllQuestions`, `resolveReport`— filtra por `organization_id`
   dentro de la propia consulta**: para un `admin` normal, el `UPDATE` lleva
   `.eq('organization_id', auth.user.organizationId)` (o
   `.is('organization_id', null)` en `discardAllQuestions` para el
   `superadmin`, que vacía el global, nunca «todas las academias»). Filtrar
   en el propio `WHERE` en vez de leer antes y comprobar aparte: una fila que
   no toca simplemente no cambia, sin depender de una comprobación que
   alguien podría olvidar añadir en el próximo sitio. `resolveReport` hace lo
   mismo vía join (`question_reports` no lleva `organization_id` propio: se
   resuelve por la academia de la PREGUNTA reportada, el mismo criterio que
   ya usaba la lectura en P11e).

**`filtroBancoPorAcademia` (P11c) también se cerró**, y con él el «Banco
Oficial» de un admin normal: ya no puede ni VER las candidatas del banco
global (`and(organization_id.is.null,status.neq.candidate)` en vez de un
`.or()` plano) — verlas sin poder aprobarlas ni descartarlas era una lista
muerta que además tentaba a pulsar «aprobar en lote» para nada.
Comprobado contra la base de datos real: hoy `question_bank` tiene **1795
preguntas y las 1795 son globales** —ninguna academia ha escrito nunca en su
banco privado—, así que el filtro nuevo no le quita a nadie una sola
pregunta que tuviera de verdad; solo cierra el hueco para el día que sí haya
contenido privado.

**`AdminBank` («Vaciar banco») pasa a decir la verdad según quién pulsa**:
antes el aviso de confirmación decía «vas a descartar TODAS las preguntas del
banco» sin distinguir — ahora, para un admin normal, dice explícitamente que
el banco global «no se toca» (recibe `esSuperadmin` como prop desde
`AdminView`, regla 26: una acción irreversible no puede prometer más o menos
de lo que en verdad hace).

Verificado con sesión real de `morato@atenea.com` (admin de Alphapol, NO
superadmin) en local: sus pestañas pasan de 10 a 8 —fuera «Temario & IA» y
«Consumo IA»—, «Banco Oficial» sigue sirviendo las 1795 preguntas globales
sin error, y «Moderación» muestra «Candidatos (0)» / «Reportes (0)»
correctamente, sin ninguna candidata ajena colada. `npm run check` (1019
tests, con `tests/moderation.test.ts` nuevo) y `npm run build` en verde.

### 76 · El motor adaptativo trabajaba en silencio: el panel de "Alumnos" ya lo dice

El dueño lo dijo directo: *«hemos hablado de la curva del olvido... pero no
se ve visualmente, y hay que dejar muy claro que la plataforma sabe lo que
hace y lleva al alumno al objetivo»*. Tenía razón: `factorPersonal`, los
cajones, `patronDeCambio`... todo el motor de la regla 73 es real, pero nada
en pantalla lo demostraba.

Del lado del profesor, `progresoSemanalAcademia` (`app/lib/academy.ts`) corre
`computeQuestionStates` dos veces por alumno —una con todo el historial, otra
con el historial cortado a como estaba hace 7 días— y suma cuántas preguntas
han pasado a `dominada` de una corrida a la otra, agrupado por `user_id`. Un
hecho verificable, no una frase de ánimo, y sin consulta nueva: reutiliza los
`intentos` que `getAcademyOverview` ya trae para `resumeAlumnos`/
`detectaConfusion`. El panel de «Alumnos» lo enseña como aviso agregado —
*"Esta semana el sistema ha llevado N preguntas más a dominadas, entre M
alumnos"*— y se oculta si la suma es 0 (regla 8: una semana en cero no se
disfraza, pero tampoco hace falta anunciarla). **Solo cuenta a los ALUMNOS**,
nunca a los admin (regla 54): se filtra por el mismo conjunto de ids que ya
excluye admins de la lista.

Del lado del alumno, la primera versión de esto era una tarjeta suelta
—«Cómo vas»— en «Mi perfil». Se construyó y se probó, pero el mismo día el
dueño pidió mucho más: no un número más, sino una pantalla entera que cuente
la historia completa. Esa tarjeta se retiró sin llegar a producción,
sustituida por «Mi Evolución» (regla 77), que hace lo mismo y bastante más.

### 77 · «Mi Evolución» sustituye a Estadísticas: una sola pantalla, no datos sueltos

La instrucción del dueño, textual: *«tenemos datos muy esparcidos [Inicio,
Fallos, Estadísticas, Mi Perfil]... imagino algo como: has empezado tal día,
tienes tantas preguntas dominadas, hay tantas que siempre fallas, hay una
curva de evolución... que quien lo vea diga "la aplicación lo sabe todo de
mí"... Quiero que explotemos la aplicación. Sea una puta pasada.»* Y una
instrucción de proceso, antes de escribir una línea: discutirlo primero con
una maqueta (Artifact), no código a ciegas — así se cerraron tres decisiones
suyas: **fusionar** el mapa de temas con el resumen agregado en vez de dos
piezas separadas, **no adivinar el futuro** (nada de proyecciones de cuándo
"aprobarías"), y el **orden de las secciones** lo elegí yo, con libertad.

**`dominadasHasta(intentos, corteMs)`** (`question-scheduler.ts`) es la
pieza que sostiene todo: corre `computeQuestionStates` con los intentos
filtrados a `created_at <= corteMs` y cuenta cuántos están en caja
`dominada`. La propiedad que importa: **un corte YA PASADO da siempre el
mismo número** — no depende de nada que vaya a cambiar — así que se puede
calcular una vez y no recalcular jamás. Sustituye a `progresoSemanal`, que
solo sabía comparar "hoy vs hace 7 días"; `dominadasHasta` sirve para
CUALQUIER fecha, que es lo que pide una curva diaria de 60 puntos.

**La curva se cachea de verdad, y NUNCA en `localStorage`** — decisión
explícita del dueño: *«para la caché nada de local, que se guarde de la
forma que sirva en varios dispositivos»*. `curvaConCache`
(`app/actions/evolucion.ts`) lee `curva_progreso` (`user_id, fecha,
dominadas`), calcula solo los días del pasado que faltan
(`dominadasHasta` + `finDeDiaLocalMs`) y los escribe; **hoy** se recalcula
siempre, en cada visita. Si la tabla no existe todavía (SQL sin ejecutar,
ver más abajo), el error de PostgREST se reconoce y se cae a recalcular
todo sin caché — el mismo patrón de degradación con gracia que
`admin_audit_log` (regla 49) y `academy_convocatoria` (regla 64).

Qué hay en la pantalla (`MiEvolucion.tsx`, `app/lib/evolucion.ts` puro):

- **Cabecera**: fecha de inicio (regla 8: `null` si no ha contestado nunca,
  no "el año 1970"), racha, resumen del banco.
- **Mapa de temas**, fusionado con el resumen agregado del banco entero
  (`resumeBanco`: total / dominadas / en camino / vistas-sin-asentar /
  sin-tocar — los cuatro cubos SIEMPRE suman el total, sin doble conteo).
- **Desglose con contexto** (`desgloseConContexto`): no solo cuántas
  atascadas, sino **de qué tema** son más (`temaQueMasResiste`), y cuántas
  preguntas se evitan del todo (`soloBlancos` siempre).
- **¿Aprobaría?**: la misma pieza que ya existía en Estadísticas
  (`resumeSimulacros`), sin reescribirla.
- **Curva diaria**: SVG dibujado a mano (línea + área con degradado), sin
  ninguna librería externa — se probó con Chart.js en la maqueta y se
  descartó, una dependencia menos por una gráfica que no la necesita.
- **Racha en calendario**: heatmap de actividad por día, divs con clases de
  intensidad, tampoco necesita librería.

**Lo que se DEJÓ FUERA deliberadamente al consolidar**, porque ya vivía en
otro sitio o era redundante: «Cómo respondes» (firmeza, en Estadísticas
vieja — el KPI físico y el historial reciente ya tienen su propio módulo),
y el rango Cadete→Inspector (retirado en regla 63, no se resucita).

**Reemplaza «Estadísticas» en el mismo hueco del menú** (`TabId: 'stats'`,
mismo `requireModule('stats')`): `StatsPanel.tsx` se borró, no se dejó
apagado — código muerto que nadie marca es como acabó `flashcard_bank` sin
usar (regla 39). Inicio (`DashboardHome.tsx`) enlaza a la pantalla nueva en
vez de duplicar el cálculo.

**Un fallo real de fecha, encontrado contra la BD real, no en un test.**
`rangoCurva` calculaba los días desde el inicio con una resta de
milisegundos cruda (`Math.floor((hoyMs - inicioMs) / 86_400_000)`), que
falla si la hora del día de "inicio" es más tarde que la de "ahora" en la
comparación de calendario — mismo tipo de fallo que ya corrigió la regla 54
con `lunesDeSemana`. En pantalla, con datos reales: *"Empezaste el 11 de
agosto"* pero la curva empezaba el *"12 de agosto"*. Arreglado con
`medianocheLocal()` (medianoche a medianoche, no milisegundos exactos), con
un test que reproduce exactamente el desajuste de hora que lo destapó.

`docs/sql/curva-progreso.sql` — **ejecutado y verificado** (16 sep 2026):
`curva_progreso` existe contra la BD real y el volcado ya la trae
(`node scripts/schema-snapshot.mjs`, 40 tablas). La degradación con gracia
se queda en el código por si la tabla se cayera, pero ya no hace falta.

Verificado en el preview con datos reales de `alumno@atenea.com`, incluida
la corrección del fallo de fecha contra la producción real. `npm run check`
(1047 tests) y `npm run build` en verde.

### 78 · El banco crece donde pesa el examen real, no a cifra plana — y los exámenes oficiales nunca son fuente de preguntas nuevas

Preguntas directas del dueño comparando con la competencia real
(`academiametapol.com`, Moodle con tema Boost sin motor adaptativo —
confirmado mirando el HTML servido, nada que competir ahí en profundidad):
*«qué número de preguntas necesitamos para un banco propio considerable»* y,
tras varias vueltas con datos reales encima de la mesa, su criterio cerrado:
*«cantidad de temas poco preguntados me parece mal, cantidad de los muy
preguntados me parece bien»* — más donde pesa, nada de más donde es "paja".

**El banco (1.795 preguntas) estaba repartido CASI IDÉNTICO en los 45
temas** (~40 cada uno), sin mirar `PESO_EXAMEN_REAL` (regla 73) en absoluto:
el tema que más cae en el examen real (Constitución II, 32 de 497) tenía
las mismas 40 preguntas que el que casi nunca cae (Principios éticos, 1 de
497). Tres franjas nuevas:

- **"Paja" (peso ≤ 7, 17 temas): NO SE TOCA.** Lo que ya hay es de sobra.
- **"Normal" (peso 8-14, 17 temas): objetivo plano, 55.**
- **"Importante" (peso ≥ 16, 11 temas): SUELO POR ARTÍCULO, no por tema.**
  3-5 preguntas por cada artículo indexado del tema (definición, excepción,
  plazo/sanción, sujeto — según cuánto pesa), no una cifra de tema. Medido
  contra la BD real: Derecho Procesal Penal (peso 18) tiene **149**
  artículos indexados; Funcionarios Públicos (peso 25) solo **20**. Una
  cifra plana de "100 por tema importante" dejaba al primero con menos de 1
  pregunta por artículo y al segundo ya sobrado (5-6). Los dos temas sin
  artículos (UE, Ciberdelincuencia — son apuntes) caen a un objetivo plano,
  80.

**Cobertura real, no azar.** `elegirContexto` (en `exams.ts` y en
`sembrar.mjs`) elegía el artículo AL AZAR: con 149 artículos y unos cientos
de tiradas, unos salen muchas veces y otros ninguna. El guion nuevo,
`scripts/operacion/sembrar-por-peso.mjs`, en la franja "importante" elige
el artículo MENOS cubierto hasta ahora (cuenta las preguntas activas de
cada `legal_reference` y tira del que menos tiene) — así el suelo por
artículo se cumple de verdad. Reanudable, igual que `sembrar.mjs`: cada tema
vuelve a comprobar cuántas preguntas tiene antes de generar ninguna.

**Los 5 exámenes oficiales indexados (temas 46-50, regla 72) quedan VETADOS
como fuente de preguntas nuevas, en el servidor.** Se estaban usando para
el peso real del examen y para la búsqueda del chat, pero **eran
seleccionables en el generador** (`GeneradorPanel`) porque tienen
`block_id` asignado — nada lo impedía. El riesgo real: es texto de examen
ya resuelto, sin `legal_reference` que lo delate, y un artículo citado en
un examen de hace 5 años puede haberse modificado o derogado desde
entonces. `esFuenteDeGeneracionValida` (`exams.ts`) lo bloquea en
`generateAndSaveCandidate` y `seedQuestionBank` — comprobado: **0
preguntas del banco venían de ahí**, pero la puerta estaba abierta (regla
1: una Server Action es un endpoint público, esconder la opción del menú
no basta). El desplegable del generador (`AdminContent.tsx`) también deja
de ofrecerlos, por higiene, no como la barrera real.

**El prompt incorpora el ESTILO de esos exámenes, nunca su contenido.**
Leído a mano (no por el modelo, por mí, una vez): las preguntas reales
piden un dato preciso (un plazo, un sujeto, una clasificación) en vez de
"¿qué dice el artículo X?" en abstracto, y los distractores son vecinos
plausibles del dato correcto (si la respuesta es "10 días", las otras dos
opciones son también plazos razonables, no "30 años"). `question-prompt.ts`
añade esa guía de FORMA con una instrucción explícita: el hecho legal —la
cifra, el plazo, el artículo— sale EXCLUSIVAMENTE del texto del tema actual
que se le pasa al modelo, nunca de lo que "suene" de un examen real.

Verificado primero con un ensayo (`--ensayo`, sin gastar nada: proyectaba
2.830 preguntas nuevas), y **ejecutado de verdad y terminado** (15-16 sep
2026): **2.822 preguntas nuevas, 8 repetidas, 0 fallidas — banco global
activo en 4.617**. `npm run check` (1047 tests) en verde.


### 79 · La preparación física se prueba con el móvil en la mano, y entrena la prueba oficial

Probada de punta a punta el 11-12 oct, con una cuenta de la academia casa contra
la BD real y un navegador a 390 px: perfil, pruebas, plan con IA, cuatro sesiones
(una dada de baja por lesión) y dos semanas siguientes. Salieron seis fallos que
ningún test cubría:

- **No se podía completar una sesión en el móvil.** `ActiveSession` era `z-50`,
  igual que `MobileNav`, que va después en el DOM y tapaba el pie con «Completar
  sesión». Sin completar, el plan no avanza nunca. Ahora `z-[60]`.
- **Una baja salía como «Completado»**, con «⚠ injury» en inglés, y el 5 por
  defecto del deslizador entraba en la media de esfuerzo. Una baja no aporta RPE
  (`ActiveSession` manda `null`, y `summarizeWeek`/`agrupaHistorialPorSemana`
  lo ignoran también al releer filas viejas, regla 17). Las incidencias se
  traducen en un solo sitio (`ETIQUETA_INCIDENCIA`), y una baja por **trabajo**
  no es una molestia (`esMolestia`): no puede bajar la carga.
- **El gasto de IA del plan no se registraba.** `training.ts` e `interview.ts`
  no llamaban a `registraGasto`, y la guarda de `ai-usage.test.ts` miraba una
  lista fija de tres ficheros. Ahora recorre todas las acciones.
- **El Cooper NO es la prueba oficial.** La convocatoria (BOE-A-2026-15055,
  anexo II) pide una **carrera de 1.000 m** medida en minutos y segundos. La
  prueba ahora es esa (`TestId` `'carrera'`, `run_1000_seconds`), con
  cronómetro que canta cada minuto y apunta el tiempo al pausar, y los puntos
  oficiales de la tabla (`puntosCarrera1000`, `TABLA_CARRERA_1000` con fuente y
  fecha, como `CNP_SCORING`). Sin sexo no hay puntos: `null`, no 0, porque un 0
  elimina. Había 0 perfiles con marca de Cooper en producción.
- **Los descansos que escribe el modelo** («Descanso completo · N/A × N/A")
  salían con «Iniciar» y contaban en el progreso: había que «completar» un
  descanso para desbloquear la semana. `esDiaDeDescanso` los reconoce por tipo o
  título; no cuentan en `planProgress` ni en `summarizeWeek`.
- La agilidad se cronometra en décimas: el campo admite `step="0.1"`.

**Lo que queda abierto:** si el alumno pulsa «Generar», sale y vuelve a generar,
quedan dos planes `active` (pasó en la prueba). El que se enseña es el último,
pero el número de semana del siguiente cuenta los dos.

### 80 · Las dudosas: se marca la duda, y la plataforma dice si compensa contestarlas

Lo pidió Alphapol (6 nov 2026): *«que la plataforma calcule la tasa de acierto
en las preguntas que los alumnos responden de forma dudosa»*. Es el dato que
decide la estrategia del examen: con la fórmula del BOE (regla 22) cada fallo
resta `1/(n−1)` aciertos, así que contestar compensa solo si se acierta más de
`1/n` — con tres opciones, **más de 1 de cada 3**, que es lo que daría el azar.

**No contradice la regla 56.** Lo que se retiró en septiembre era una marca de
confianza de tres niveles en CADA pregunta, que además bloqueaba. Esto es un
toque, opcional, que nunca bloquea, y cambia una decisión real (contestar o no
las dudosas). Es la única señal declarada que queda; todo lo demás se deduce.

- **Sin SQL.** Se guarda en `question_attempts.confidence`, que existía desde
  P10b y no escribía nadie: `1` dudosa, `2` no dudosa, `null` no se ofrecía la
  marca (histórico). Las filas de P10b traen además un `0` («a ciegas»), que se
  lee como duda. La traducción vive en `confianzaDeDuda` (`exam-results.ts`,
  regla 6); la lectura y la aritmética, en `app/lib/dudosas.ts` (puro).
- **Un blanco marcado se guarda como dudosa**; uno sin marcar, `null`.
  `toResultRow` dejó de forzar `confidence` a `null` en un blanco: «la dudé y
  no arriesgué» es justo lo que hay que contar.
- **En el simulacro** el marcador de «revisar luego» (un icono suelto en la
  cabecera, que se tiraba al entregar) pasa a ser el botón **«Dudosa»** junto a
  «Dejar en blanco», con la tecla `M`. Sigue sirviendo para volver a ellas en la
  revisión. **En entrenamiento** el botón **«Dudo»** solo existe ANTES de
  contestar: el primer toque corrige, y marcar la duda después de ver la
  corrección falsearía el dato.
- La marca vive en la pregunta (`Question.dudosa`), no en un estado aparte: así
  viaja con el examen a medias (regla 37) y llega sola a `buildExamResults`.
- **El motor adaptativo la escucha:** `inferFirmeza` da TITUBEANTE a toda
  respuesta marcada como dudosa, así que acertar dudando no pasa de la caja 3
  (`MAX_BOX_TITUBEANTE`).
- **Dónde se ve:** resultados del simulacro (*«contestarlas te ha compensado
  hoy»* — un hecho de ese examen, sin muestra mínima), «Mi Evolución» (acierto en
  dudosas frente a no dudosas, y veredicto) y la ficha del alumno en «Alumnos»
  (**«Cuando duda»**, en tercera persona: `fraseDudosas(r, 'profesor')`). El
  veredicto («te compensa / no te compensa») solo sale con
  `MIN_DUDOSAS_PARA_VEREDICTO` (10) contestadas: con cuatro es ruido (regla 8).

**De paso salió un fallo real de la regla 73:** las tres consultas que alimentan
al planificador (`exams.ts`, `evolucion.ts`, `perfil.ts`) **no pedían
`answer_path`**, así que `patronDeCambio` no recibía nunca nada y «volver al
primer instinto» no se detectaba en producción, aunque la regla 73 lo daba por
integrado. Ahora piden `answer_path` y `confidence`, y una guarda en
`dudosas.test.ts` lo fija.

**Y otro del banco de pruebas (regla 38):** los stubs de `getSimulacro` y
`getAdaptiveSession` devolvían la fila cruda de `question_bank`, no la pregunta
ya mapeada que devuelve la acción real, así que el test se pintaba **sin
enunciado ni opciones** y nadie lo había visto (el recorrido de las 19 pantallas
no entra en un test). Ahora pasan por `mapBankRowToQuestion`.

Verificado en el banco de pruebas, a 390 px: simulacro de 25 con 9 dudosas
(8 contestadas, 4 acertadas, 1 en blanco → «+2 netos»), entrenamiento con
«Dudo» antes de contestar y bloqueado después, «Mi Evolución» y la ficha del
admin. Los 43 avisos de `todas-las-pantallas.cjs` son exactamente los mismos
antes y después del cambio. **No se ha probado contra la BD real** (no había
credenciales en esta sesión): el primer simulacro de verdad debería dejar filas
con `confidence` 1/2.

### 81 · La plataforma es de Alphapol: la marca sale de un sitio, y lo de Atenea se fue entero

Decisión del dueño (6 nov 2026): la plataforma deja de ser «Atenea», un
producto para varias academias, y pasa a ser la de **Alphapol** —su nombre, su
logo, sus colores—, con **la misma base de datos**. Nadie real estaba
registrado, así que lo de prueba se borra.

**La marca vive en dos ficheros, y nada más la escribe:**

- **`app/lib/marca.ts`** — nombre, lema, web, correo de contacto, slug de la
  academia, ruta del logo y colores (marino `#14295a`, dorado `#c5a738`,
  sacados del logo de alphapol.es). Lo leen el `<title>`, el manifest, la
  pantalla de entrada (`MarcoEntrada`, regla 90), los correos y los avisos. Las claves
  internas (`atenea-tema`, la cookie `atenea-academia`, `askAtenea`) NO se
  renombraron: no las ve nadie y cambiarlas borraría las preferencias guardadas.
- **`app/marca.css`** — redefine la escala `indigo-*` de Tailwind con el azul de
  Alphapol. La interfaz pinta su color principal con `indigo-*` en ~200 sitios;
  cambiar la escala es cambiar once líneas. **Cada tono tiene el mismo
  contraste que el índigo al que sustituye** (±0,4 contra blanco y contra
  slate-900, medido). Va en un fichero aparte porque el banco de pruebas compila
  su propio CSS (`.banco-pruebas/entrada.css`) y lo importa también: con el
  bloque dentro de `globals.css`, el banco seguía pintando el índigo y las
  capturas mentían.

El logo es el JPG de 400 px de su web (`public/marca/`), y de él salen los
iconos: `app/icon.png`, `app/apple-icon.png` y los del manifest, uno
«maskable» con margen para que Android no se coma «CENTRO DE FORMACIÓN» (rehechos
el mismo día con la «A» y el nombre en grande: regla 88). Se
retiraron `app/icon.tsx`, `app/apple-icon.tsx` y la égida (`app/lib/logo.tsx`).
**Hace falta un logo en vector** para que el icono no se vea suave.

**Lo que se fue con Atenea:** `/academias` (la página de venta a academias),
`/fundadores`, `marketing/`, `sembrar-demo.mjs` y la bienvenida de «opositor
fundador» (`plantillaBienvenidaFundador`). `ACADEMIA_CASA_SLUG` es `null`: sin
academia casa, toda academia es solo-manual en físicas (regla 68) — que es lo
que Alphapol quiere, con su preparador.

**Un alta sin academia en la URL entra en Alphapol**: el registro manda
`academia_slug: MARCA.academiaSlug` cuando se entra por `/` (`AppShell.tsx`).
El disparador de P11j caía en `atenea` si no le llegaba slug (una cuenta creada
a mano desde el panel de Supabase): lo corrige
[`docs/sql/alphapol-academia-por-defecto.sql`](sql/alphapol-academia-por-defecto.sql),
**ejecutado y verificado** (6 nov).

**Los correos**: cabecera marino con el nombre en dorado y botón marino; las
respuestas van a `info@alphapol.es`. El remitente sale de `MAIL_FROM` y, sin
él, de `ateneapolicial.com` (el único dominio verificado en Resend) con el
nombre de Alphapol delante. Las plantillas de **Supabase Auth** (confirmar,
invitar, recuperar) viven en el panel de Supabase y hay que cambiarlas a mano.

**La limpieza** (`npm run limpiar`, `scripts/operacion/limpiar-para-alphapol.mjs`,
lógica en `app/lib/limpieza.ts`). Va por **SQL en una sola transacción**, con la
API de gestión de Supabase y un token de cuenta (`SUPABASE_ACCESS_TOKEN`): o se
borra todo o nada, y `auth.users` se borra como una tabla más. Antes de borrar
guarda en JSON una copia de todas las filas que va a eliminar. Borra todas las
cuentas menos las de
`superadmin` (y las que se pasen en `--conservar=`) con todo lo suyo, y todas
las academias menos Alphapol con todo lo suyo; de Alphapol, solo los exentos y
el registro de auditoría (cosas de las cuentas de prueba). **No toca** el
temario, el banco común ni la configuración de Alphapol (ajustes, convocatoria,
grupos, planes de físicas). Es un ensayo salvo `--hazlo`, pide escribir
`ALPHAPOL`, y **se niega si no quedara ninguna cuenta con la que entrar**. Un
test compara sus listas con `supabase/schema.json`: una tabla nueva con
`user_id` u `organization_id` que no se añada a la lista lo hace fallar.
**Ejecutada de verdad el 6 nov 2026**: 20 cuentas de prueba (incluida la del
propio dueño como alumno, a petición suya), las academias `atenea` y `demo` y
3.060 filas. El primer intento falló y **no borró nada** (la transacción hizo
su trabajo): `admin_audit_log.actor_id` es NOT NULL con la clave ajena en «set
null», así que una acción global de una cuenta de prueba impedía borrar la
cuenta. Ahora esas acciones se borran antes, y un test lo fija. Quedan: el
superadmin, Alphapol, el banco (4.617 activas), los 56 documentos, sus 2
grupos con sus 6 semanas de plan de físicas. Se crearon después
`prueba.admin@alphapol.es` (admin) y `prueba.alumno@alphapol.es` (alumno,
acceso activo y exento) con `npm run cuenta`, comprobadas entrando de verdad.

**En una sesión en la nube**, Node no pasa por el proxy por defecto y el
token guardado como secreto de red no llega: hay que lanzar los guiones con
`NODE_USE_ENV_PROXY=1` y `SUPABASE_ACCESS_TOKEN=proxy-injected` (el proxy pone
el valor de verdad).

**Lo que queda:**

1. ~~Pasar la rama a `main`~~ — hecho (6 nov), comprobado en producción.
2. El subdominio (p. ej. `campus.alphapol.es`): añadirlo en Vercel, crear el
   CNAME en Hostinger (allí están su DNS, su web y su correo), poner la URL en
   Supabase (Site URL y Redirect URLs) y en `NEXT_PUBLIC_SITE_URL`.
3. Verificar `alphapol.es` en Resend (sus registros van en un subdominio
   `send.`, no chocan con el correo de Hostinger) y definir `MAIL_FROM`.
4. ~~Las tres plantillas de correo de Supabase Auth~~ — hechas (6 nov) por la
   API de gestión (`PATCH /v1/projects/{ref}/config/auth`): asuntos, cuerpos
   y remitente («Alphapol»), con `{{ .ConfirmationURL }}` intacto, comprobado
   releyendo la configuración.

### 82 · Asistencia: las sesiones se derivan del horario, y todo va en la hora de la academia

Lo pidió Alphapol (6 nov 2026): *«que cada alumno pueda marcar las clases a las
que vaya a faltar, para saber cuánto hueco tienen en cada clase por si alguno
pide cambio»*. Cada grupo tiene un número de plazas fijo.

- **El horario pasa a ser estructurado**: `class_groups.weekdays` (1 = lunes …
  7 = domingo), `start_time`, `end_time` y `capacity`, todo nulable
  ([`docs/sql/asistencia.sql`](sql/asistencia.sql), **ejecutado** el 6
  nov). `schedule` se queda como nota libre. Un grupo sin días no tiene
  sesiones y la pestaña lo dice («sin horario puesto»).
- **Las sesiones NO se guardan**: se derivan del horario
  (`proximasSesiones`, `app/lib/asistencia.ts`), igual que las semanas del plan
  de grupo (regla 54). Solo se guarda la falta: `class_absences`
  `(class_id, user_id, session_date)`.
- **Todo en la hora de la academia** (`MARCA.zonaHoraria`, `Europe/Madrid`):
  Vercel corre en UTC, y «hasta que empiece la clase de las 17:00» se habría
  corrido una o dos horas según la época del año. Las fechas viajan como
  `YYYY-MM-DD` y se suman en calendario UTC, que no tiene cambios de hora.
- **Se avisa hasta que EMPIEZA la clase** (`sePuedeAvisar`); la de hoy se
  sigue enseñando hasta que TERMINA, para que la academia vea las faltas de la
  clase en marcha. Ventana: `DIAS_VISIBLES` (21 días).
- **Plazas libres = aforo − los que van**; sin aforo puesto es `null`, no 0
  (regla 8), y por encima del aforo se dice («2 por encima del aforo»). La falta
  de quien ya no está en el grupo no libera plaza.
- **`class_absences` tiene RLS y CERO políticas**: una de propietario dejaría a
  un alumno apuntar faltas en un grupo ajeno, porque desde la política no se
  puede mirar `class_members` (tampoco tiene políticas). Todo va con la clave
  de servicio: `setMiFalta` comprueba que el grupo es de su academia, que es
  miembro y que aún se puede, y escribe siempre con `auth.user.id`. Hay guardas
  en `asistencia.test.ts` y la tabla está en `SOLO_SERVICIO` de `rls.test.ts`.
- **Pantallas**: el horario se pone en «Grupos» (días como botones, horas y
  plazas); el alumno lo ve en **«Mis clases»** («Mi perfil», se oculta si no
  tiene grupos con horario): por defecto va, y solo avisa cuando falta; la
  academia, en la pestaña **«Asistencia»**, por DÍA y no por grupo, con las
  plazas libres como primer dato y quién falta plegado debajo.

**Un fallo real, visto contra la BD real**: el botón volvía a «Aviso: no voy»
con la falta ya guardada. Una carga de `getMisClases` que salía ANTES del aviso
y llegaba DESPUÉS pisaba el cambio (en desarrollo la carga inicial se lanza dos
veces). `MisClases` lleva una versión: una carga anterior al último aviso se
descarta, y al confirmar el servidor se vuelve a aplicar lo que ha dicho.

Verificado de punta a punta (6 nov) con la app local contra la BD real: grupo
temporal con horario → alumno de prueba dentro → aviso desde «Mis clases» →
sigue tras recargar → «Asistencia» enseña «Van 0 de 10 · 1 falta · 10 plazas
libres» con el correo de quien falta. Grupo borrado después.

### 83 · Dar de alta a 100 alumnos no puede depender de mandar 100 correos

Alphapol tiene ~100 alumnos. Invitarlos por correo no funciona: el proyecto
tiene `rate_limit_email_sent = 30` por hora (comprobado en la configuración
real, 6 nov 2026) y el plan gratuito de Resend, 100 al día. El correo 31 falla.

`altaMasivaAlumnos` (`actions/membership.ts`, lógica pura en
`app/lib/alta-masiva.ts`) tiene dos modos:

- **`clave` (el principal)**: la cuenta se crea YA CONFIRMADA con
  `auth.admin.createUser` y una contraseña provisional legible
  (`Alpha-xxxx-xxxx`, sin 0/O/1/l/I), sin mandar ningún correo y por tanto sin
  límite (tope de 200 por pasada). Se enseña UNA vez y se descarga en un CSV
  (punto y coma + BOM, para Excel) para repartirla en clase: no se guarda en
  ningún sitio más.
- **`correo`**: la invitación de siempre, como mucho 25 por pasada; lo que no
  entra se queda en la lista para la siguiente.

Quien ya tiene cuenta solo recibe acceso y grupos: su rol NO se toca (podría ser
un admin), y los grupos se AÑADEN, no sustituyen. La lista se vuelve a leer en
el servidor (`leeCorreos`), y una línea sin correo sale con su número en vez de
perderse (regla 27).

Para que la provisional no se quede para siempre, **«Mi perfil» tiene «Cambiar
mi contraseña»** (`CambiarClave`, `auth.updateUser` con la sesión del propio
alumno; el proyecto no exige volver a identificarse para esto). Sin ella, la
única salida era «¿Olvidaste tu contraseña?», que gasta un correo del límite.

Verificado contra la BD real (6 nov): dos altas nuevas y una existente, CSV
descargado, entrar con la provisional, cambiarla desde «Mi perfil» y entrar con
la nueva. Cuentas de prueba borradas después.


### 84 · El registro del entrenamiento va aparte del plan, por alumno y fecha

> **Sustituida el mismo día por la regla 86.** El registro por grupo y fecha
> (`group_workout_logs`, `RegistroDia`, `RegistroSemanaGrupo`) se retiró del
> código al pasar a sesiones sueltas; la tabla se queda en la base de datos,
> vacía. Lo que sigue vale como historia de por qué el registro va aparte.

Alphapol mandaba la física con una herramienta externa: el preparador publicaba
la semana y cada alumno marcaba lo que había hecho, con el esfuerzo y un
comentario. Aquí el plan de grupo ya existía (reglas 53, 54 y 57), pero **no se
podía marcar nada**: el plan es compartido y escribir el «hecho» dentro de él lo
habría reescrito para todo el grupo.

- **`group_workout_logs`** ([`docs/sql/registro-fisico.sql`](sql/registro-fisico.sql),
  **ejecutado** el 6 nov): una fila por `(class_id, user_id, session_date)`, con
  `rpe` (1-10, nulable) y `comment` (≤ 500, nulable). El plan no se toca.
- **El día se guarda como FECHA, no como posición en el plan**: si el preparador
  reordena o cambia un día, una posición apuntaría a otra cosa. La fecha sale del
  lunes de la semana + el nombre del día (`fechaDeDiaPlan`,
  `app/lib/registro-fisico.ts`). El calendario del alumno y el registro usan la
  MISMA función (`indiceDiaPlan`): la fecha que se enseña y la que se apunta no
  pueden divergir, y hay una guarda que lo fija.
- **Qué se puede apuntar** (`sePuedeRegistrar`): ni el futuro —no se marca lo que
  aún no se ha hecho— ni más atrás de `DIAS_PARA_REGISTRAR` (14 días), todo en la
  hora de la academia (regla 82). Los descansos no se apuntan
  (`diasEntrenables`, con `esDiaDeDescanso` de la regla 79). Y el servidor
  comprueba que el día **existe en el plan de esa semana** antes de escribir.
- **Lo mínimo para que lo apunte de verdad** (regla 56): un toque, «Marcar como
  hecho»; el esfuerzo y el comentario son opcionales. Esfuerzo vacío es `null`,
  nunca 0 (regla 16), y el medio del preparador cuenta solo a quien lo puso.
- **No se pinta «hecho» hasta que el servidor lo confirma** (regla 4): es un
  toque, y un «hecho» que no se guardó es la mentira de siempre. Si la lectura de
  lo apuntado falla, el calendario no ofrece apuntar nada: un día ya marcado se
  vería como pendiente.
- **RLS y CERO políticas**, como `class_absences` (regla 82): desde una política
  no se puede mirar `class_members` para saber si es del grupo. Todo va con la
  clave de servicio; el alumno escribe siempre con `auth.user.id`, y la acción
  comprueba academia, grupo, fecha y día del plan antes de tocar la tabla.
- **El preparador** ve en «Prep. física», dentro de cada grupo y para la semana
  elegida (la actual o una pasada), **«Quién ha entrenado»**
  (`RegistroSemanaGrupo`, `resumenSemanaGrupo`): cada día con cuántos lo han
  hecho, una rejilla alumno × día (verde = hecho, con su esfuerzo), el esfuerzo
  medio, lo que han escrito, y **quién no ha apuntado nada de lo que ya tocaba**
  —es a quien hay que preguntar—. Solo cuenta a quien sigue en el grupo y los
  días que el plan sigue teniendo.
- **Vídeo por ejercicio** (`Exercise.video`): el preparador pega un enlace en el
  editor y el alumno ve «Ver cómo se hace». **Solo `https://`**
  (`normalizaVideo`): se pinta como `<a href>` en el móvil de cada alumno, y un
  `javascript:` ahí sería un agujero. Se limpia al normalizar el plan, así que
  vale también al releer (regla 17); el editor avisa ANTES de guardar si un
  enlace no se va a guardar.

**Lo que queda para una v2**, si Alphapol lo pide al usarlo: plantillas de sesión
reutilizables, el histórico de marcas de cada alumno en las tres pruebas
oficiales con su baremo, y avisar al alumno cuando el preparador publica la
semana.

Verificado de punta a punta (6 nov) con la app local contra la BD real: grupo
temporal con el plan de esta semana y un vídeo → el alumno marca el lunes (7/10,
con comentario) y el martes → siguen tras volver a entrar → el preparador ve
«Lun 1/1 · Mar 1/1 · Jue 0/1», esfuerzo medio 7/10 y el comentario. Grupo
borrado después (el registro se fue con él, en cascada).


### 85 · La app habla como Alphapol, no como un videojuego de policías

Atenea nació con un tono de cuartel: «CENTRO DE MANDO», «OPERACIONES TÁCTICAS»,
«Drills (Memoria)», «Cargando Sistema Táctico…», un «Sistema online»
parpadeando y un reloj «ZULU» en cada cabecera. El reloj era lo peor: «Zulu» es
la hora de Greenwich en jerga militar, así que en Málaga enseñaba **una hora
menos** que la del móvil y parecía un fallo.

- **Los nombres de los módulos** son los mismos en el menú del alumno
  (`StudentDashboard`), en los interruptores del panel (`MODULE_LABEL`,
  `lib/modules.ts`) y en la cabecera: Inicio, Test, Repasar fallos, Fichas,
  Preparación física, Mi evolución, Mi perfil (y, fuera del MVP, Pregunta al
  temario y Entrevista). Si se cambia uno, se cambia en los dos sitios.
- **La cabecera** (`Header.tsx`) dice la fecha de hoy —en el navegador, nunca la
  del servidor— y el nombre de la academia (`MARCA.nombre`), y debajo el nombre
  de la pantalla en minúsculas normales, no en mayúsculas.
- **El logo de Alphapol** sustituye al escudo genérico en el menú lateral del
  alumno y en la barra del panel.
- **Menos texto.** Una frase que explica lo que el número ya dice se lee una vez
  y luego se salta. «Mi evolución» y la configuración del test se recortaron sin
  quitar ninguna sección.

Los recorridos del banco de pruebas (`todas-las-pantallas.cjs`, `contraste.cjs`)
buscan los módulos por su nombre: al renombrar uno, hay que cambiarlo ahí también.


### 86 · La física como la lleva un preparador: sesiones sueltas, de un grupo o de un alumno

Alphapol mandaba la física con TrainingMonkeys, y el preparador va a seguir
trabajando igual: lo que no se parezca a lo que ya sabe hacer, no lo usará. Se
miró cómo es por dentro (las dos capturas reales de su web y las miniaturas de
su canal de YouTube; los vídeos no se pueden bajar desde este servidor) y el
modelo de datos pasó a ser el suyo. **El plan ya no es «una semana con
ejercicios por día»**, son SESIONES sueltas en el calendario.

**Las tablas** ([`docs/sql/fisica-sesiones.sql`](sql/fisica-sesiones.sql),
**ejecutado** el 6 nov; volcado del esquema en 47 tablas):

| Tabla | Qué guarda |
|---|---|
| `training_sessions` | una sesión en una fecha, de un GRUPO (`class_id`) **o** de UN alumno (`user_id`), nunca de los dos (un `CHECK`). Tipo, título, descripción libre, duración, distancia, vídeo |
| `training_session_logs` | lo que apunta cada alumno: hecha / no hecha, esfuerzo (1-10), sensaciones, tiempo y distancia reales, y la respuesta del preparador |
| `session_templates` | la biblioteca de plantillas de la academia |
| `training_week_notes` | la nota de cada semana, por grupo o por alumno (dos índices únicos parciales: dos `NULL` no chocan, regla 31) |
| `physical_marks` | el histórico de marcas en las pruebas oficiales, apuntadas por el alumno o por el preparador (`recorded_by`) |

Las cinco con **RLS y CERO políticas**, como `class_absences` (regla 82): todo va
con la clave de servicio, detrás de `requireUser` (filtrando siempre por el id
del alumno y comprobando que la sesión es suya o de un grupo suyo) o de
`requireAdmin` (acotado a su academia dentro de cada consulta). Los planes de
semana de antes (`group_training_plans`) se migraron a sesiones en el mismo
guion; no se borró nada de lo viejo.

**El alumno** («Preparación física», `FisicaAlumno`): pestaña **Calendario** —el
mes entero, cada día con sus sesiones como recuadros del COLOR de su tipo
(`app/components/fisica/estiloTipo.ts`, el mismo mapa para alumno y
preparador), la nota de la semana encima y «N/M hechas · tiempo · km» debajo—
y al tocar una sesión, la ficha para leerla y apuntarla (`DetalleSesion`: un
toque para «hecha / no hecha», lo demás opcional, regla 56). Junta las de sus
grupos y las suyas: para él es un solo calendario. Pestaña **Mis marcas**:
última marca y puntos de cada prueba, histórico, y «si el examen fuera hoy».

**El preparador** («Prep. física» → Planificar, `Planificador`): elige para
quién —un grupo entero o un alumno— y ve una semana, dos o el mes. Un «+» en
cada día; las tarjetas dicen cuántos la han hecho (grupo) o su estado
(alumno), y si hay comentarios. En el ORDENADOR se arrastran tarjetas y
plantillas a otro día (con Alt o Ctrl, se copian); en el MÓVIL los días se
apilan y todo va con toques. Biblioteca de plantillas, «Copiar semana», nota de
la semana editable, y en cada sesión la pestaña **Feedback** con lo que ha
apuntado cada alumno y un recuadro para contestar. En la vista de un alumno,
las sesiones de sus grupos salen con borde de puntos y **no se editan ahí**:
cambiarlas cambiaría las de todo el grupo. Pestaña **Marcas**: una fila por
alumno con sus puntos y su nota, los peores arriba.

**El baremo** (`app/lib/baremo-fisico.ts`, `BAREMO_CNP` con su fuente y fecha,
como `CNP_SCORING`): BOE-A-2026-15055, base 6.1.2 y anexo II. Agilidad
(segundos y décimas, por sexo), dominadas (hombres), suspensión en barra
(mujeres) y carrera de 1.000 m (la `TABLA_CARRERA_1000` de la regla 79,
comprobada contra el mismo anexo). La nota es la MEDIA de los tres; **un 0 en
cualquiera elimina** y hace falta un 5. Sin marca o sin sexo cuando hace
falta, los puntos son `null`, nunca 0 (regla 8): un 0 elimina. El sexo vive en
`profiles_physical.gender`; el preparador lo puede fijar (`setSexoAlumno`),
que es la excepción admitida en `rls.test.ts` junto a `getMarcasAcademia`.
`tests/sesiones.test.ts` comprueba **cada frontera de las cuatro tablas**,
copiada del BOE tramo a tramo: un test que solo mira tres puntos no se entera
de un tramo mal copiado (se probó rompiéndolo).

**Tres cosas que salieron al hacerlo:**

- **Los campos no estaban ligados a su etiqueta.** `TextField`, `TextAreaField`
  y `SelectField` solo ponían `htmlFor` si quien los usaba pasaba un `id`, y
  casi nadie lo hacía: un lector de pantalla no decía qué campo era y tocar la
  etiqueta no llevaba al campo. Ahora generan uno con `useId`.
- **`className` en esos campos va al CONTROL, no al envoltorio.** Para que un
  campo crezca dentro de una fila (`flex-1`) hay que envolverlo en un `div`.
- **El ayudante `sinFuncion` de `rls.test.ts`** tomaba la primera `{` tras los
  parámetros como el cuerpo de la función, y en `Promise<{ … }>` esa llave es la
  del tipo de retorno: las excepciones admitidas no se quitaban. Ahora salta los
  `<…>`.

**Lo que queda, si Alphapol lo pide al usarlo:** campos de «planificado frente
a hecho» más finos (pulsaciones, vatios), sincronizar con Strava o Garmin,
avisar al alumno cuando se publica la semana, y retirar del todo las acciones
del plan de semana viejo (`getGroupTrainingPlan` y compañía, en `groups.ts`),
que ya no usa ninguna pantalla.

**Los datos de ejemplo que hay en producción (6 nov), a petición del dueño**,
para que el preparador de Alphapol vea un mes entero al entrar: el grupo
«Promo 43 · Físicas» (el de antes lo borró el dueño sin querer desde el panel,
con sus 6 semanas de septiembre, y la base de datos del plan Free no tiene
copias para recuperarlo) con `prueba.alumno@alphapol.es` dentro; 29 sesiones
del 2 al 30 de noviembre en cuatro semanas de base, carga, carga alta y
descarga con simulacro; 2 sesiones individuales para ese alumno; 5 notas de
semana; 5 plantillas; 4 sesiones ya apuntadas por el alumno (una con respuesta
del preparador); y 6 marcas con su sexo puesto. Son de ejemplo: se pueden
cambiar o borrar desde el panel.

**Verificado de punta a punta (6 nov)** con la app local contra la BD real: el
preparador crea una sesión para un grupo temporal, la guarda como plantilla,
pone la nota de la semana, crea una sesión individual, copia la semana y
apunta una marca; el alumno ve las dos sesiones y la nota, apunta la de grupo
(7/10 con comentario) y una marca suya; el preparador ve «1/1» y el comentario
y contesta; el alumno lee la respuesta. Datos de prueba borrados después.

### 87 · La pantalla de carga es marina como el arranque de Android, y se ve poco

`PantallaCarga` (`app/components/auth/`) sustituye al spinner suelto con
«Cargando Alphapol…» que pintaba `AppShell` mientras se comprueba la sesión.
Es la propuesta «G · Monumental» de un lienzo de siete
(https://claude.ai/artifact/HoBrU9KgYJznpVXcvaNsiN), elegida por el dueño el
6 nov. Las otras dos que quiso conservar, la A y la E, están en
[`docs/disenos/pantalla-de-carga/`](disenos/pantalla-de-carga/README.md)
con los pasos para cambiar a cualquiera de ellas.

- **El gris del móvil no era un color de la app.** Android funde su pantalla de
  arranque (el marino del manifest con el icono) con la primera pantalla de la
  app, y marino sobre el fondo claro de antes, a medio fundido, daba aquel gris
  azulado. Con la pantalla de carga marina, el paso no se nota. **Si algún día
  se pasa a una clara (la E), `background_color` del manifest tiene que pasar
  a ser el mismo color claro.**
- **La «A» y el logotipo son ficheros aparte**, con el fondo transparente:
  `MARCA.isotipo` y `MARCA.logotipo` (`public/marca/*.webp`, 100 y 65 KB).
  Salen del JPG de 400 px de la web: se quitó el fondo marino, se subió a 6× y
  3× con los bordes afinados, y se quitaron los flecos azulados que dejaba el
  fondo. Siguen pidiendo un logo en vector para verse nítidos a tamaño grande.
- **Las entradas duran menos de un segundo.** La pantalla se ve lo que tarda la
  sesión, que suele ser poco; una entrada de dos segundos se cortaría siempre a
  la mitad. La línea dorada va y viene: no hay un porcentaje real que enseñar,
  así que no se finge uno.
- **Las animaciones viven en `app/pantalla-carga.css`**, importado por
  `globals.css` y por el banco de pruebas, como `marca.css` (regla 81). La
  máscara del destello (la forma de la «A») se pone en el componente con la
  ruta de `MARCA.isotipo`, no en el CSS.
- **No sale de `ui/`**: como la puerta de entrada (regla 43), es una pantalla de
  marca, oscura pase lo que pase. Lo que sí guarda: `min-h-dvh` (la guarda de
  `auth-messages.test.ts` la sigue ahora a ella) y `prefers-reduced-motion`.
- Para verla quieta: el banco de pruebas, `index.html?vista=carga`.


**Segunda versión (6 nov, «las mismas versiones pero mejor»).** El dueño la
vio en su móvil y se veía a medio hacer. Tres causas, y ninguna era el diseño:

- **La «A» estaba borrosa**: era el JPG de 400 px de su web ampliado a 6×. Ahora
  es SVG con el contorno vectorial (regla 88).
- **La «A» pasaba por detrás del logotipo**, y un velo oscuro la volvía gris por
  abajo para que el logotipo se leyera. Ahora se mide con el ancho Y con el alto
  (`w-[min(124%,58dvh)]`): en un iPhone SE no llega al logotipo, y el velo ya no
  hace falta. Medido a 375×667, 390×844 y 1440×900.
- **El efecto fantasma** de su captura era un fundido encima de otro: Android
  funde su pantalla de arranque con la de la app, y la «A» entraba además desde
  opacidad 0. Ahora está entera desde el primer instante y solo se asienta. El
  icono que se veía en el centro, con «CENTRO DE FORMACIÓN» dentro de un
  recuadro, era **el icono viejo que Android aún tenía guardado** (regla 88:
  tarda en volver a leer el manifest, o hay que reinstalar la app).
- **El fondo sale de `fondoMarca.ts`** (`FONDO_MARINO`), con el centro en el
  marino EXACTO del manifest, y lo comparten la carga y la puerta de entrada
  (regla 90): no pueden quedarse con dos marinos distintos.

### 88 · El icono: lo más grande que deja cada sistema, y por eso hay dos

Hasta el 6 nov el icono era el logo entero, con «ALPHAPOL · CENTRO DE
FORMACIÓN» dentro: a tamaño de icono no se leía nada y la «A» quedaba
pequeña. Ahora es la «A» con «ALPHAPOL» debajo (propuesta «E · Con nombre» del
lienzo, página «Icono de la app»), sobre el marino del logo, y el dueño pidió
los dos lo más grandes que permita el icono. Lo que manda ahí no es el gusto,
es lo que recorta cada sistema:

| Fichero | Para qué | La «A» (ancho) | El nombre (ancho) | Lo que limita |
|---|---|---|---|---|
| `app/icon.png` (512), `app/apple-icon.png` (180), `public/marca/icono-192.png` y `icono-512.png` | iPhone, navegador, «any» del manifest | 62,5 % | 81 % | Las esquinas redondeadas del iPhone (radio ~22 %), con un margen fino del 6 % |
| `public/marca/icono-maskable-512.png` | Android | 48 % | 62 % | Android puede recortar en **círculo** y solo garantiza el círculo central del **80 %** |

- **No se usa el mismo dibujo en los dos.** Con el tamaño del de iPhone, el
  recorte en círculo de Android se come la primera «A» y la última «L» del
  nombre. Con el de Android en todas partes, el de iPhone saldría pequeño sin
  motivo.
- **Las medidas se calcularon, no se pusieron a ojo**: con la silueta real de
  la «A» y de las letras, buscando el tamaño mayor que deja todos sus píxeles
  dentro de la zona segura y centrando lo que sobra. Las posiciones, en
  fracciones del lado (izquierda, arriba, ancho, alto): iPhone — «A»
  `.1875 .0708 .6250 .6491`, nombre `.0938 .7588 .8125 .1094`; Android — «A»
  `.2610 .1235 .4780 .4964`, nombre `.1893 .6497 .6214 .0836`. El fondo es el
  degradado del logo (`#0a4e72` → `#123a6a` → `#14295a`, centrado al 50 % / 40 %).
- La «A» y el nombre salen de `MARCA.isotipo` y `MARCA.logotipo` (regla 87),
  recortados a su silueta. Con un logo en vector se regeneran con las mismas
  medidas y se ganaría nitidez.
- **En los móviles que ya tienen la app instalada el icono no cambia al
  momento**: Android vuelve a leer el manifest cada cierto tiempo y el iPhone
  guarda el icono de cuando se añadió a la pantalla de inicio (hay que quitarla
  y volver a añadirla).
- **No volver a añadir `app/favicon.ico`** (sigue en pie lo de la tabla de
  estado): `app/icon.png` es el favicon.

**Segunda versión (6 nov): nítido, y sin recuadro en el arranque de Android.**

- **La «A», el logotipo y el nombre son SVG** (`public/marca/alphapol-*.svg`,
  65, 80 y 37 KB). El CONTORNO se redibujó en vector sobre la silueta del logo
  (con `potrace`, sobre la máscara a 2-3×, suavizada), y el color de dentro es
  el del original con el reborde claro quitado y un poco de desenfoque: el
  dorado queda liso y el borde, nítido a cualquier tamaño. No es el vector de
  Alphapol: si lo mandan, se cambian esos ficheros y se regenera todo.
- **Los iconos salen de un guion**, `node scripts/marca/iconos.mjs`, con las
  mismas medidas de arriba. Cada SVG lleva en el guion su caja de TINTA (las
  medidas se refieren a la tinta, no al lienzo). Reproduce los PNG píxel a
  píxel; después se pasan por `PIL` con `optimize=True` (140 KB el de 512).
- **El maskable ya no deja un recuadro en la pantalla de arranque.** Android la
  pinta con el `background_color` del manifest (`#14295a`) y el icono en el
  centro; el degradado del icono acababa en `#133263`, así que se veía un
  círculo verdoso sobre el marino. Ahora el degradado llega al marino exacto al
  38 % del radio, dentro del círculo del 80 %, y el logo flota sin caja. El
  «any» (iPhone) se queda con su degradado amplio: allí no hay arranque.
- **`MARCA.logo`** (menú lateral, cabecera del panel) es ahora `icono-192.png`,
  no el JPG con «CENTRO DE FORMACIÓN» ilegible a 40 px.

### 89 · El 1RM: el preparador escribe la carga en %, el alumno la lee en kilos

Lo pidió el dueño tras ver la física (regla 86): en fuerza, un preparador no
escribe «60 kg» para un grupo, escribe «4×6 al 75 %», y cada alumno tiene que
saber cuánto es eso PARA ÉL.

- **`rm_marks`** ([`docs/sql/fisica-1rm.sql`](sql/fisica-1rm.sql),
  **ejecutado** el 6 nov; 48 tablas): ejercicio, peso, repeticiones (1-12),
  fecha, nota y quién lo apuntó. RLS y CERO políticas, como el resto de la
  física: todo con la clave de servicio detrás de `requireUser` /
  `requireAdmin`.
- **El 1RM se ESTIMA** con Epley, `peso × (1 + reps/30)`; con 1 repetición es
  el propio peso. Más de 12 repeticiones no es fiable y se rechaza. El vigente
  de cada ejercicio es el último apuntado (`rmVigentes`), no el mejor: el que
  vuelve de una lesión no levanta lo de hace tres meses.
- **Las cargas viven en la sesión** (`training_sessions.loads` y
  `session_templates.loads`, `jsonb`): ejercicio, series, repeticiones y
  porcentaje (30-110 %). El alumno las ve ya en kilos con SU 1RM, redondeadas a
  2,5 kg (lo que se monta con discos); sin 1RM de ese ejercicio ve el
  porcentaje y un aviso para apuntarlo, nunca un 0 (regla 8).
- **`leeKg`** (`app/lib/rm.ts`) es la única lectura de un peso escrito a mano:
  coma o punto, y vacío o no positivo es `null` (regla 16).
- Lo puro en `app/lib/rm.ts` con `tests/rm.test.ts`; las acciones en
  `app/actions/fisica.ts`; la pieza de pantalla (`SeccionRM`, `ListaCargas`) en
  `app/components/fisica/`, la misma para el alumno («Mis marcas») y para el
  preparador (la ficha de marcas y el editor de la sesión).
- **Verificado de punta a punta contra la BD real** (6 nov), con la app local
  y las cuentas de prueba: el preparador apunta un 1RM (sentadilla 80 kg × 5
  → 93,3 kg) desde la ficha de marcas y sale en la lista; una sesión con
  «sentadilla 4 × 6 al 75 %» se guarda en `loads`; el alumno la ve como
  «70 kg, de 93,3 kg»; el alumno apunta uno suyo (press banca 50 × 3 → 55 kg)
  y lo borra, y no tiene botón de borrar en el del preparador (y el servidor
  tampoco le deja: `deleteMiRM` filtra por `recorded_by`); y al planificar
  para ese alumno, el editor enseña sus kilos (80 % → 75 kg). Datos de prueba
  borrados después.

### 90 · La puerta de entrada sigue a la pantalla de carga

Las cinco pantallas que ve quien aún no está dentro —entrar, crear cuenta,
poner la contraseña tras una invitación, elegir academia y «tu acceso no está
activo»— comparten **`MarcoEntrada`** (`app/components/auth/`). Antes eran
brutalistas sobre hueso (regla 43) con una cinta pequeña arriba, y la de acceso
no activo ni eso: seguía el tema de la aplicación. Al abrir la app se pasaba de
una pantalla de carga marina y monumental a otra que parecía otra web.

- **En el móvil**, arriba la marca (el mismo marino de `fondoMarca.ts`, la «A»
  saliéndose por la derecha, el logotipo abajo a la izquierda) y el formulario
  sube encima en una hoja blanca. **En el ordenador**, dos columnas: la marca
  con el titular y lo que ofrece la academia, y el formulario.
- **Las piezas (campos, botones, avisos, títulos) viven en `estilosEntrada.ts`**:
  eran cuatro copias de lo mismo.
- **Sigue sin seguir el tema** (lo de la regla 43): es una pantalla de marca.
  Y sigue protegiendo lo que protegía: `TAP`, `text-base` en los campos, `dvh`
  (la pone el marco, y la guarda de `auth-messages.test.ts` lo sigue a él),
  ningún tamaño grande sin escalón, `autoComplete` y `autoCapitalize`.
- **La «A» se coloca para no tocar nunca el texto**: en el móvil arriba a la
  derecha; en el ordenador abajo a la derecha, con el titular arriba. Medido a
  375, 390 y 1440 px.
- **El banco de pruebas** tiene una vista por pantalla: `?vista=login`
  (`&avisos=no` para verla limpia), `clave`, `academia`, `bloqueado` y `carga`.
  `todas-las-pantallas.cjs` y `contraste.cjs` las recorren todas: 0 problemas y
  0 textos por debajo de 3:1 en las seis.
- De paso, `contraste.cjs` ya no se cuelga: cuando un módulo no estaba en el
  cajón «Más» dejaba el cajón abierto y el siguiente clic no llegaba a la
  barra. Y su lista del panel era la de antes de P8 («Usuarios», «Academia»…),
  así que se saltaba casi todo el panel; al ponerla al día salieron cinco
  grises por debajo de 3:1, ya corregidos. Queda uno que es un falso positivo
  (ámbar sobre un fondo ámbar translúcido que el medidor compone mal).

### 91 · El panel «Alumnos» no trae las respuestas: le llegan los totales

Para pintar «Alumnos», `getAcademyOverview` traía a memoria TODAS las
respuestas de TODOS los alumnos de la academia (`fetchTodosLosIntentos`, tope
`MAX_INTENTOS = 20.000`) y las sumaba en JavaScript. Con ~100 alumnos
estudiando a diario ese tope se pasa en pocas semanas, y a partir de ahí el
panel contaba sobre una parte del histórico **sin avisar** (el mismo fallo de
la regla 74, con otro número) y cada vez tardaba más en abrir.

Ahora las cuentas las hace Postgres, con tres funciones
([`docs/sql/panel-academia.sql`](sql/panel-academia.sql), **ejecutado** el
6 nov; solo las puede llamar la clave de servicio):

| Función | Qué devuelve | Lo usa |
|---|---|---|
| `panel_academia_resumen` | por alumno (contestadas, blancos, aciertos, última), alumnos por tema y las preguntas que falla casi todo el mundo | `resumeAlumnosDesdeConteos`, `coberturaDesdeConteos`, `sospechosasDesdeConteos` |
| `panel_academia_confusion` | los pares candidatos con sus conteos (co-contestadas, co-falladas, y de cada pregunta cuántos la contestaron y fallaron) | `confusionDesdeConteos`, que aplica los mismos umbrales y el mismo `lift` que `detectaConfusion` |
| `panel_academia_semana` | el histórico de las preguntas que cada alumno tocó en los últimos 7 días (filas, paginadas) | `progresoSemanalAcademia`, igual que antes |

- **Una sola lógica, dos entradas.** Las funciones puras de `app/lib/academy.ts`
  y `question-confusion.ts` tienen ahora una versión `…DesdeConteos`, y la
  versión de siempre suma las respuestas y llama a esa: no pueden contar
  distinto. Los blancos (`selected_index = -1`) y los `null` (contestada, sin
  saber qué, regla 24) se tratan igual en el SQL que en `isBlankAnswer`.
- **El progreso semanal sale exacto con mucho menos**: el cajón de una pregunta
  solo cambia cuando se contesta (`cajonDe` depende de la caja y las recaídas),
  así que lo que pasó a dominada en 7 días sale igual con el histórico de las
  preguntas tocadas esa semana. Medido: 1.331 filas de 1.680, mismo resultado.
- **La confusión parte de los fallos**: los candidatos son pares de preguntas
  del mismo tema que el mismo alumno falló; cruzar todo con todo crece con el
  cuadrado de lo contestado. Solo para esos candidatos se cuenta cuántos
  contestaron las dos.
- **Comprobado contra un Postgres de verdad** (PGlite, en memoria, con el mismo
  guion SQL y 1.680 respuestas inventadas de 14 alumnos): alumnos, temas,
  sospechosas, los 81 pares que se confunden y el progreso semanal salen
  IGUALES por las dos vías. La única diferencia era el orden de los pares
  empatados, y ahora el orden desempata por id en las dos. Esa comprobación no
  se quedó en el repo (PGlite pesa); `tests/academy.test.ts` fija la parte de
  JavaScript con los mismos datos, y una guarda impide que `getAcademyOverview`
  vuelva a traer todas las respuestas.
- **La ficha de UN alumno sigue trayendo sus respuestas** (`getStudentDetail`),
  con el tope subido a 100.000: un solo alumno no llega ahí.
- Verificado con la app local contra la BD real (sesión de `prueba.admin`): el
  panel carga, y la fila del alumno de prueba dice «53 % de acierto en 36»,
  que es lo que tiene.

### 92 · El modelo de Gemini se cambia antes de que lo apague Google

Aviso de Google del 6 nov 2026: `gemini-2.5-flash` se apaga el **1 dic 2026**
y desde ese día sus llamadas pasan solas a `gemini-3.5-flash-lite`, al mismo
precio ($0,30 por millón de tokens de entrada, $2,50 de salida, comprobado en
su página de precios). Se cambió el 7 nov para no depender de esa redirección.

- **Solo cambia el nombre** (`TEXT_MODEL` en `app/actions/core.ts`, el precio en
  `PRECIO_FLASH` de `app/lib/ai-usage.ts` y los guiones de `scripts/`). Los
  modelos Gemini 3 dejan de admitir `temperature`, `top_p`, `top_k`,
  `candidate_count` y los turnos de modelo rellenados; el código no usaba
  ninguno (todas las llamadas son `generateContent` con un texto, con o sin
  esquema JSON).
- **Hay una guarda** en `ai-usage.test.ts`: falla si vuelve el nombre del
  modelo viejo al código o alguno de esos ajustes.
- Los embeddings (`gemini-embedding-001`) no cambian: Google no los apaga
  hasta 2028.
- **Verificado en producción el 7 nov** (sesión de `prueba.admin` subida a
  superadmin un momento): «Temario & IA» generó 1 pregunta en 2,9 s, y
  `ai_usage` apuntó 517 tokens de entrada, 252 de salida y 0,000785 $.
  Pregunta de prueba borrada después.
- **El primer intento falló, y no por el cambio de modelo:** Google devolvía
  `402 Payment Required: prepayment credits are depleted` (se había acabado el
  saldo de prepago de Gemini; el dueño lo recargó). El panel solo decía
  «1 fallidas», sin motivo. Ahora `seedQuestionBank` devuelve `motivoFallo`
  (el error más repetido) y «Temario & IA» lo enseña. **Si algún día toda la
  IA falla a la vez, mira primero el saldo de Gemini.**

### 93 · Un enlace sin imagen de vista previa parece un enlace roto

- **Qué pasó (7 nov):** el dueño pegó el enlace de la plataforma en WhatsApp y
  salía la tarjeta con título y descripción, pero sin imagen. El layout no
  declaraba `og:image` ni `metadataBase`.
- **Regla:** la imagen de compartir es `app/opengraph-image.jpg` (1200×630, ~30
  KB, la genera `node scripts/marca/iconos.mjs` desde los SVG de la marca) y
  `metadataBase` sale de `NEXT_PUBLIC_SITE_URL`. WhatsApp ignora las URL
  relativas, así que sin `metadataBase` la etiqueta sale mal.
- **Trampa:** WhatsApp guarda la vista previa en caché. Un enlace ya compartido
  puede seguir sin imagen; se prueba con `?v=2` al final de la URL.
- **Pendiente:** al configurar el subdominio propio (`TRASPASO.md` §3a), definir
  `NEXT_PUBLIC_SITE_URL` para que la imagen cuelgue de ese dominio.

### 94 · Inicio dice «qué hago hoy», y la identidad de Alphapol vive en `ui/`

- **Qué pasó (7 nov):** el dueño veía la app «muy genérica» y el hero del Inicio
  repetía las cifras de las tarjetas de debajo (53 %, racha, en blanco). Se
  hicieron 14 maquetas (lienzo de diseño) y eligió «Insignia» (marino + oro) en
  su versión clara, el Inicio «Tu día» y el Test A.
- **Regla (Inicio):** una línea de tiempo con lo que toca HOY. Cada fila sale de
  su acción y **solo se pinta si hay algo**: `getEntrenoDeHoy` (entrenamiento,
  fallos con repaso vencido, tema con más fallos), `getMisClases` (clase de hoy)
  y `getMiFisica` (sesión de hoy). Sin clase no hay fila de clase; una academia
  que no lleva la física aquí no ve fila de física. Las cifras de «cómo voy»
  siguen en «Mi evolución» (regla 63). La lógica pura vive en `app/lib/dia.ts`.
- **«Fallos por repasar» no es «alguna vez fallada».** `getFailedQuestions`
  cuenta toda pregunta que se falló alguna vez, aunque ya se acertara después.
  Para el Inicio son las que están en `recaida` o `atascada` **y** con el repaso
  vencido. «Tema donde más fallas» exige 3 fallos como mínimo: con menos es ruido.
- **Regla (identidad):** los colores son tokens (`crema`, `oro`, `oro-claro`,
  `oro-oscuro`, `marino`, `marino-hondo`, en `app/marca.css`), la tipografía de
  títulos es `font-titulo` (Barlow Condensed) y las piezas son `Kicker`,
  `HeroMarino`, `Fichas`, `Interruptor` y `Button variant="oro"` en
  `app/components/ui/Marca.tsx`. Ninguna pantalla escribe su propio dorado.
- **El oro del logo (#c5a738) no se lee como texto sobre crema ni blanco** (unos
  2:1). Para texto dorado sobre claro: `oro-oscuro`; sobre marino u oscuro:
  `oro-claro`.
- **Trampa:** `--font-titulo` va en `@theme inline`. La variable de la fuente
  (`--font-barlow-condensed`) la define `next/font` en el `<body>`, no en
  `:root`; sin `inline` se resuelve donde aún no existe y cae a la fuente de
  respaldo sin avisar. Va en `marca.css` (no en `globals.css`) porque el banco
  de pruebas solo compila aquel.
- **Trampa del banco de pruebas:** no carga Google Fonts ni ejecuta el script
  del tema. Para ver la marca de verdad hay que añadir la hoja de Barlow
  Condensed y poner la clase `dark` a mano; y para ver las filas de clase y de
  física hoy, fijar el reloj (`page.clock.install`) en un lunes, que es cuando
  casan los datos de prueba.
- **Segunda tanda (7 nov):** Fallos, Física, Evolución y Perfil, y las piezas
  compartidas: `SectionLabel` (etiqueta dorada en `font-titulo`), `StatTile`,
  `TEXT.title`/`TEXT.display` (tipografía de marca) y `SURFACE.brand` (marino con
  filete dorado, ya no el azul vivo). Como son compartidas, Fichas y el panel de
  administración las heredan; su maquetación sigue siendo la anterior.
- **Fichas (7 nov):** el morado de las fichas pasa al marino y el oro: tarjeta
  con filete dorado, dorso marino y botón `variant="oro"`. Fallo, Duda y Bien
  conservan rojo, naranja y verde: son semántica, no marca.
- **Trampa del banco:** `Mi perfil` no se podía abrir en él (el módulo no estaba
  encendido en los datos de prueba y el cliente de Supabase pedía `process`, que
  el navegador no tiene). Arreglado en `acciones-falsas.ts` e `index.html`.

### 95 · El calendario de física arranca por la semana, y el mes está siempre a un botón

- **Qué pasó (7 nov):** al maquetar la física con la identidad nueva, el dueño
  aprobó la vista de semana (el día de hoy y lo que viene) pero pidió que **la
  vista mensual exista siempre**.
- **Regla:** `CalendarioFisica` tiene dos vistas, **Semana** (por defecto) y
  **Mes** (la de antes, entera), con un `Interruptor`. Se carga siempre el mes
  del día elegido, que cubre la semana (`semanasDelMes` incluye las semanas que
  tocan el mes); al cambiar de semana se mueve también el mes. No se quita la
  vista mensual al rediseñar: es una petición expresa.
- **Trampa:** `todas-las-pantallas.cjs` buscaba botones «Fuerza» y «Resistencia»
  de un menú que ya no existe (anterior a la regla 86) y, con la semana, esos
  textos son tarjetas que abren un diálogo. El guion cierra el diálogo y sigue.

### 96 · El cuadrante semanal: un profesor por sesión, y los multis ocupan plaza

- **Qué pasó (9 nov):** Alphapol organiza la física de la Promoción 44 en
  siete grupos fijos (Kappa, Alpha y Zetta, lunes y miércoles; Omega, Sigma,
  Betta y Delta, martes y jueves; mañana a las 08:00 y tarde a las 20:00) y
  cada semana manda por WhatsApp una imagen, el «cuadrante», con lo que toca a
  cada grupo cada día y QUÉ PROFESOR lo da, según quién esté disponible. Los
  alumnos **multidisciplinares** no tienen grupo: dicen cada semana «esta
  semana voy con OMEGA». Hacía falta que el preparador montara ese cuadrante
  aquí y que el multi se apuntara solo.
- **Regla:**
  - **El profesor cuelga de la SESIÓN, no del grupo** (`training_sessions.teacher_id`
    → `academy_staff`, que ya guardaba profesores como NOMBRES sin cuenta; se
    podrán enlazar a una cuenta «preparador» más adelante). La hora propia de
    una sesión (`start_time`) sirve para la de Multi a las 18:30.
  - **El cuadrante no tiene tabla**: es una vista de las sesiones de los grupos
    `fisicas` (una celda = la primera sesión del grupo ese día; `saveCelda`
    la crea o la cambia sin tocar su descripción ni sus cargas).
    `armaCuadrante` (`app/lib/cuadrante.ts`) alimenta el panel, la imagen y el
    texto de WhatsApp: tres salidas, una sola rejilla.
  - **Los grupos salen en su ORDEN DE ALTA, no alfabético** (el cuadrante que
    ya conocen los alumnos es Kappa, Alpha, Zetta…). Un INSERT de varias filas
    da el mismo `created_at` a todas: se escalonan un segundo
    (`docs/sql/fisica-cuadrante.sql`).
  - **Un profesor no puede estar en dos sitios a la vez**: `choquesDeProfesor`
    avisa si dos sesiones suyas se solapan (una hora por sesión). Sin hora
    conocida no avisa: avisar sin saber es ruido.
  - **Multi** es un grupo con `is_multi = true`, sin días propios. El multi se
    apunta a una sesión de otro grupo en `class_session_joins` (RLS y CERO
    políticas, como `class_absences`, regla 82) y **ocupa plaza**: plazas
    libres = aforo − (propios − faltas) − multis (`cuentaSesion` ganó un
    cuarto parámetro). Aforo 30 por grupo: 20 propios y 10 plazas para multis.
  - **El servidor comprueba lo que la pantalla ya filtra** (regla 34): que es
    multi, que el grupo es de su academia, que es día de clase, que no ha
    empezado (`sePuedeAvisar`) y que queda plaza (`quedaPlaza`). Sin aforo
    puesto no se bloquea: no se sabe (regla 8).
  - **La imagen se dibuja en el navegador** (`cuadranteImagen.ts`, canvas) con
    los colores de cada grupo; en el móvil abre la hoja de compartir
    (WhatsApp) y donde no, descarga el PNG.
- **Trampas:** `limpieza.ts` tiene listas de tablas con `user_id`/`class_id` y
  su test las cruza con el esquema: la tabla nueva hubo que añadirla. Desde la
  sesión en la nube la app local no llega a `*.supabase.co` (solo a la API de
  gestión): la pantalla se probó en el banco de pruebas y las escrituras con
  SQL en una transacción deshecha.
- **Pendiente:** el profesor aún no sale en el calendario del alumno; los
  entrenos individuales siguen como en la regla 86 (falta «enviar lo mismo a
  varios alumnos a la vez»); enlazar los nombres de profesor a cuentas.

### 97 · Clases de grupo y entreno de cada alumno: dos capas que no se mezclan

- **Qué pasó (9 nov):** el cuadrante (regla 96) cargaba TODOS los grupos de
  física, y metía el grupo genérico de ejemplo «Promo 43 · Físicas» (sin
  horario, con 31 sesiones que ya no pintaban nada): celdas como «FÍSICAS ·
  Dominadas: pirámide · Sin profesor · Día sin clase en su horario» y hasta
  columnas como «DOMINGO 15 · FÍSICAS · Descanso», con Multi colgando debajo.
  Además, «Planificar» partía de un GRUPO y lo escrito llegaba a todos sus
  miembros, cuando Alphapol quiere sustituir trainingmonkeys.pro: cada alumno
  recibe SU entreno.
- **Regla: hay dos capas.**
  1. **Clases de grupo** (el cuadrante): lo que hace todo un grupo cada día y
     qué profesor lo da.
  2. **Entreno individual** (Planificar): cada alumno el suyo. Varios pueden
     coincidir en el mismo entreno, pero cada uno tiene SU copia.
- **El cuadrante solo lleva clases de grupo:**
  - Entran los grupos con horario (`weekdays` no vacío) y los de Multi
    (`is_multi`). Un grupo sin horario no sale NUNCA, tenga las sesiones que
    tenga (`entraEnCuadrante` en la lógica pura, `conHorarioOMulti` en la
    acción: las dos cosas, para que no se cuele por ningún lado).
  - Un día existe si algún grupo tiene clase ese día o si hay una sesión de
    Multi. **La fila de Multi no crea días.** Una sesión de un grupo en un día
    de clase de otros sale como «extra»; en un día sin nadie, no crea el día.
  - **Quitar un día sin tocar el horario fijo:** `class_days_off` (grupo,
    fecha, motivo; [`docs/sql/fisica-sin-clase.sql`](sql/fisica-sin-clase.sql),
    **ejecutado** el 9 nov con el visto bueno del dueño; RLS y CERO políticas,
    como `class_absences`). Una fila por grupo: «quitar el día entero» es una
    por cada grupo que tenía clase, así que no hay un `class_id` nulo que
    signifique «todos» y se cuele en los grupos de teoría. Lo quitado
    desaparece de la rejilla, de la imagen y del texto; se lista en «Sin clase
    esta semana» con «Devolver»; el alumno lo ve como «sin clase»; un multi no
    se puede apuntar (ni el preparador lo apunta); Asistencia no lo cuenta. Las
    sesiones de ese día NO se borran: se esconden y vuelven al devolverlo. Un
    **día suelto** (solo existe por una sesión de Multi) se quita borrando sus
    sesiones, con confirmación (`borrarSesionesDia`).
- **El editor de celda:**
  - **Sin «Tipo».** `kind` exige un valor y da el color del calendario del
    alumno: sale del título (`tipoDeTitulo`: rodaje/series/1.000 m → carrera,
    circuito, movilidad, F.M/RDL/dominadas → fuerza…). Lo que no se reconoce
    («Boxeo», «FLK 5.0») es `otro`, en gris: mejor que un color equivocado. Si
    el título no cambia, se respeta el tipo que ya tuviera.
  - **La hora propia, solo en Multi**, y escrita a mano: `type="time"` salía
    vacío con una flecha en el Android del dueño. `leeHora` entiende «18:30»,
    «18.30», «18h30», «1830», «18»… y hay botones de las horas de siempre.
  - **Sugerencias** de los títulos usados en los últimos 120 días, del más
    repetido al menos (`titulosFrecuentes`), como botones. **«Copiar a…»**
    otras celdas de esta semana o la siguiente (otro día, otro grupo), con o
    sin el profesor; la hora propia solo viaja dentro del mismo grupo.
    **«Descripción y cargas»** abre el editor de sesión de siempre: así una
    clase de grupo lleva cargas en % del 1RM sin un planificador por grupo.
  - **Quién va (Multi):** «Van 21 de 30: 20 del grupo − 1 que falta + 2 de
    Multi. Quedan 9», quién avisó de que falta, y los multis con «cambiar de
    clase» y «quitar»; el preparador también los apunta (`setMultiEnClase`,
    `moverMulti`). Con la clase llena, pregunta antes de pasarse del aforo
    (`forzar`). Al mover, primero se apunta a la nueva: si no cabe, no se
    queda sin ninguna.
- **Planificar es por ALUMNO.** La vista principal es la lista de alumnos de
  física por grupo, con buscador y filtros «sin esta semana / sin la
  siguiente»: sesiones de cada semana y «N/M apuntadas» (`getAlumnosFisica`,
  paginada, regla 74). Un alumno en dos grupos sale una vez, en el primero. Al
  entrar en uno: sus entrenos y, APARTE y con candado, las clases de su grupo
  (`getPlanificador` las trae en `clases`). **Copiar a varios**
  (`copiarAAlumnos`): una semana o un día de un alumno a los marcados; una fila
  nueva por alumno y sesión, así que cambiar la de uno no cambia las demás, y
  las cargas en % dan los kilos de cada uno con SU 1RM (regla 89). «Su semana
  anterior» copia la del propio alumno. El planificador por grupo solo queda
  para un grupo SIN horario (un plan común, el modelo de antes).
- **El alumno ve un solo calendario con las dos capas** (`armaClasesAlumno`,
  `app/lib/clases-fisica.ts`): las clases salen del HORARIO aunque el
  preparador no haya escrito nada («aún sin publicar qué toca»), con hora,
  PROFESOR y color del grupo; los días «sin clase», como tales; «Aviso: no
  voy» se da ahí; el multi ve las clases a las que se apuntó y se quita ahí.
  Los entrenos llevan el color de su TIPO y no tienen hora. «Mis clases» (Mi
  perfil) deja la física a su calendario y solo dice dónde está
  (`fisicaAparte`); «Con qué grupo entreno» se queda en elegir, con la lista
  sesión a sesión plegada. Inicio tiene su fila «Clase de física · Kappa».
- **Profesor con cuenta:** `academy_staff.user_id` (nulable, una cuenta por
  profesor y academia). Se elige en Ajustes → Profesores entre las cuentas de
  la academia; el servidor comprueba que es de la academia. Los nombres sin
  cuenta siguen igual. `limpieza.ts` no lo borra con la cuenta
  (`TABLAS_CON_USUARIO_QUE_SE_CONSERVAN`): la clave lo deja a `null`.
- **¿Hace falta «publicar» el cuadrante? Hoy, no** (el dueño lo pidió el mismo
  día: regla 98). El alumno ve lo que se
  guarda al instante, pero lo que ve antes de que se escriba es el horario
  («clase de Kappa a las 08:00, aún sin publicar qué toca»), que es verdad; el
  aviso a los alumnos sigue siendo la imagen de WhatsApp. Un paso más es un
  estado que se olvida («¿lo publiqué?»). Si molesta ver la semana a medio
  escribir, es barato: una fila por academia y semana con `publicado_en`, y el
  alumno ve el título solo de las semanas publicadas.
- **Limpieza del plan de semana viejo:** fuera `getGroupTrainingPlan`,
  `saveGroupTrainingPlan` y `deleteGroupTrainingPlan`, y la lectura de
  `getGroups` («con plan / sin plan», que ahora dice «sin horario: no sale en
  el cuadrante»). El `drop` de `group_training_plans` y `group_workout_logs`
  (0 filas) está en
  [`docs/sql/retirar-plan-semana-viejo.sql`](sql/retirar-plan-semana-viejo.sql)
  (ejecutado al final, en la regla 98). El ejemplo «Promo 43 · Físicas» se
  retiró también en la regla 98.
- **Trampas:**
  - `class_days_off` tiene `class_id` y `organization_id`: va en
    `TABLAS_POR_GRUPO` y `TABLAS_POR_ACADEMIA` de `limpieza.ts`, o su test lo
    canta.
  - Un `useEffect` que llama a un `cargar()` de `useCallback` cuenta como
    `set-state-in-effect` en el lint; con la función asíncrona DENTRO del
    efecto, no. El lint se queda en los 32 errores de antes.
  - Desde la nube no se llega a `*.supabase.co`: las pantallas se miraron en el
    banco de pruebas (390 px y escritorio) y las escrituras nuevas, con su SQL
    en una transacción deshecha.
- **Pendiente:** el profesor enlazado aún no tiene una vista «mis clases»; un
  grupo de físicas sin horario sigue pudiendo crearse (y no sale en el
  cuadrante: «Grupos» lo avisa).

### 98 · Publicar el cuadrante, y el ejemplo de física es el entreno de un alumno

- **Qué pasó (9 nov):** al ver la regla 97, el dueño pidió tres cosas: un paso
  de «publicar» el cuadrante; retirar el grupo de ejemplo «Promo 43 ·
  Físicas» y poner sus sesiones a un alumno de prueba, para que los dueños
  vean cómo queda un entreno individual y cómo se copia de uno a otro; y
  borrar las dos tablas vacías del plan de semana viejo.
- **Publicar** (`class_week_publications`, una fila por academia y semana;
  [`docs/sql/fisica-publicar-cuadrante.sql`](sql/fisica-publicar-cuadrante.sql),
  **ejecutado** el 9 nov; RLS y CERO políticas):
  - De una semana SIN publicar, el alumno ve solo el HORARIO de su grupo
    («Clase de Kappa · 08:00 · aún sin publicar qué toca»): ni qué toca, ni el
    profesor, ni los días sin clase, ni las sesiones sueltas de Multi. Al
    publicarla, todo; lo que se cambie después, al momento (no hay versiones
    que comparar: un «hay cambios sin publicar» sería un estado más que
    olvidar).
  - **Se filtra en el SERVIDOR, no en la pantalla**: `clasesDelAlumno(…,
    soloPublicado)` (el alumno, `true`; el preparador en «Planificar»,
    `false`) y `getMiMulti`. Un borrador no llega al navegador del alumno.
  - Un día «sin clase» de una semana sin publicar no existe para el alumno:
    tampoco le impide apuntarse como multi (`diasSinClasePublicados`). El
    preparador sí lo ve en todas partes (Asistencia, quién va).
  - En el cuadrante, un aviso verde («Publicada el dom 8 nov, 19:12») o ámbar
    («Sin publicar: los alumnos solo ven el horario») con su botón. Sacar la
    imagen o el texto de WhatsApp de una semana sin publicar pregunta si
    publicarla: mandarla es el momento en que se avisa a los alumnos. El
    texto se copia ANTES de preguntar: algunos navegadores solo dejan escribir
    en el portapapeles justo después del toque.
- **El ejemplo, a un alumno**
  ([`docs/sql/fisica-ejemplo-a-un-alumno.sql`](sql/fisica-ejemplo-a-un-alumno.sql),
  **ejecutado**): cuenta nueva `prueba.entreno@alphapol.es` (alumno, acceso
  activo y exento; la contraseña la tiene el dueño y no está en el repo),
  en Kappa, con las 31 sesiones de ejemplo como SU entreno (las 29 del grupo
  y las 2 individuales), sus 5 apuntes y sus 5 notas de semana.
  `prueba.alumno` pasa a Alpha y se queda sin entrenos: es el destino para
  probar «Copiar a varios». Se borró el grupo y la sesión «Jdjd» de Kappa
  (una prueba del dueño).
  - **La cuenta se creó con SQL** (`auth.users` + `auth.identities`, igual que
    las deja la API): desde la nube no se llega a la API de Supabase. Los
    disparadores ponen el perfil de alumno y la academia. La contraseña se
    puso aparte, con `extensions.crypt`, sin pasar por el repo.
- **El plan de semana viejo, fuera del todo:** borradas `group_training_plans`
  y `group_workout_logs` (0 filas;
  [`docs/sql/retirar-plan-semana-viejo.sql`](sql/retirar-plan-semana-viejo.sql)).
  En el código: fuera la herencia del plan de grupo de `getActiveTrainingPlan`,
  `getStudentGroupWeeks` y su uso en `PhysicalTrainer`; las dos tablas, a
  `RETIRADAS` de `schema-drift` (un `.from()` que vuelva a ellas falla).
  Se borraron ANTES de desplegar: el código que había en producción las leía
  ignorando el error, así que no se rompía nada.
- **Trampa:** un fichero de tests que no compila no sale como «×» en vitest,
  sale como `FAIL` del fichero entero y sus tests no cuentan. Al filtrar la
  salida por «×», un test roto así pasa desapercibido: mira también el
  número total de tests, o `tsc`.

### 99 · Lo que no se encuentra no existe: grupos, días añadidos y profesores

- **Qué pasó (9 nov):** al usar el cuadrante, el dueño preguntó dónde se crean
  los grupos y sus plazas, dónde se cambian los horarios, cómo quitar Alpha de
  un día concreto, y dijo que no había ningún sitio para los profesores. Casi
  todo existía («Grupos», «Este día Alpha no tiene clase», «Ajustes →
  Profesores»), pero no se encontraba. Y dos cosas faltaban de verdad: añadir
  un día que no es del horario (un sábado) y marcar un grupo como Multi sin SQL.
- **Regla: cada cosa se hace donde se busca, y desde donde se mira se llega.**
  - **«Grupos»** crea, cambia y borra grupos: nombre, tipo, días, horas,
    plazas, profesores y, ahora, **«Multidisciplinar (Multi)»** (`is_multi`,
    solo en tipos de física; al marcarlo se vacía el horario: Multi no tiene).
    Borrar un grupo **pregunta antes**, diciendo lo que se pierde: el 6 nov se
    perdió así un grupo entero y el plan gratuito no tiene copias. Las horas
    se escriben (`leeHora`, que pasó a `asistencia.ts`: «8», «0800»,
    «20.30»); el `type="time"` salía vacío en Android.
  - **El cuadrante enlaza a «Grupos»** («Grupos, días de clase, horas y
    plazas: en la pestaña Grupos»). Una pantalla pide otra pestaña con un
    evento del navegador, `admin:pestana`, que escucha `AdminView`: sin pasar
    funciones por todo el árbol.
  - **«Añadir un día»**: se elige cualquier día de la semana y un grupo, y se
    abre su celda; al guardarla, el día sale. Por eso una sesión de CUALQUIER
    grupo del cuadrante (con horario o Multi) crea su día, no solo las de
    Multi (regla 97); las de un grupo sin horario siguen sin entrar. La celda
    de un día que no es de su horario lleva su propia hora y no tiene
    «quién va» ni «no tiene clase» (es una clase suelta: se quita con
    «Quitar»).
  - **«Quitar…»** de cada día empieza SIN nada marcado, con «Todo el día»
    aparte y el botón diciendo lo que hará («Quitar Sigma», «Quitar el día
    entero»): con todo marcado de entrada no se veía que se podía quitar un
    solo grupo.
  - **Pestaña «Profesores»** (`AdminProfesores`): el equipo de teoría y de
    física, con sus datos, la cuenta con la que entra, los GRUPOS que lleva
    (de «Grupos») y sus CLASES DE FÍSICA de la semana (del cuadrante, sin los
    días quitados; `getAgendaProfesores`). Lo que lleva se deduce, no se
    escribe dos veces. Borrar a un profesor pregunta y propone desmarcarlo
    como activo. En «Ajustes» queda un enlace.
- **La semana del 9 al 15 se publicó** a petición del dueño (regla 98).
- **Trampa:** `aplicaOrden` pone al final una pestaña nueva para quien ya
  había reordenado las suyas: «Profesores» sale tras «Grupos» solo con el
  orden de fábrica.

### 100 · Cada clase tiene su profesor habitual, y cada tema el suyo; el imprevisto, a mano

- **Qué pasó (9 nov):** con el cuadrante real delante, el dueño: «prácticamente
  el 100 % de las veces el boxeo lo da el mismo, el jiujitsu el mismo… si pongo
  boxeo, que se ponga solo Juan». Y en teoría, «asignar a un profesor los temas
  del 1 al 10, 14, 17, 18», para saber quién da cada tema y cómo van sus
  alumnos en ellos. «Pero siempre hay que dejar la puerta abierta a un
  imprevisto.»
- **Física** (`staff_activities`: clase, profesor, orden;
  [`docs/sql/profesores-clases-y-temas.sql`](sql/profesores-clases-y-temas.sql),
  **ejecutado** con la lista de partida que aprobó el dueño: Boxeo → Juan,
  Jiujitsu → Lucas, F.M + RDL → Lucio y luego José, FLK → José y luego
  Olivares, sacada de su cuadrante de esa semana):
  - Al cambiar el TÍTULO de una celda, el profesor se rellena con el primer
    habitual que esté LIBRE a esa hora (`profesorSugerido`,
    `profesoresOcupados`), y lo dice: «Habitual de Boxeo» o «Lucio ya tiene
    clase a esa hora: te propongo a José». Si todos están ocupados, el
    primero, y avisa el choque de siempre.
  - **El imprevisto manda:** el desplegable sigue ahí; si en esa edición se
    elige un profesor a mano, cambiar el título ya no lo toca. Las celdas ya
    escritas, copiadas o de la semana anterior no cambian solas.
  - La clase se reconoce por el PRINCIPIO del título, sin mayúsculas, acentos
    ni signos (`claveActividad`): «FLK» vale para FLK 5.0 y 5.1, «f.m+rdl» es
    «F.M + RDL». Si encajan dos, la más larga.
  - Se edita en «Profesores» → «Clases de física y su profesor habitual»: cada
    clase con sus profesores en orden. Y cada profesor dice de qué es
    habitual.
  - **Se descartó deducirlo solo del historial**: no había historial, y una
    regla que no se ve no se corrige.
- **Teoría** (`staff_subjects`: profesor y tema del temario común):
  - Los temas se escriben como se dicen, «1-10, 14, 17, 18» (`leeListaTemas`),
    y se enseñan cortos, «1–10, 14, 17–18» (`formateaTemas`).
  - «Profesores» dice, de cada uno, cómo van los alumnos de la academia en
    sus temas: acierto medio (ponderado por respuestas, sin los blancos, regla
    24), el tema más flojo y el detalle tema a tema. Sin respuestas es «sin
    datos», no un 0 % (regla 8); con menos de `MIN_RESPUESTAS_TEMA` (20) no se
    señala un tema como el más flojo: sería ruido.
  - Los recuentos los hace la base de datos (`panel_academia_por_tema`, solo
    para la clave de servicio, como el resto del panel: regla 91), y solo de
    los alumnos: los admin no estudian.
  - «Temas sin profesor: 23–24», sin contar los exámenes oficiales (46-50),
    que no los da nadie.
- **El cuadrante de la semana del 9 al 12** se pasó desde la imagen que se
  mandó por WhatsApp
  ([`docs/sql/cuadrante-semana-9-noviembre.sql`](sql/cuadrante-semana-9-noviembre.sql),
  **ejecutado**): 16 celdas, ya publicadas.
- **Pendiente, si Alphapol lo pide:** que el alumno vea en sus fallos «Tema 7 ·
  lo da Morato»; un cuadrante de teoría (qué tema se da cada día y con quién)
  con el mismo relleno automático del profesor.

---

## Los tests

```
tests/text.test.ts              limpieza de respuestas IA, texto legal, troceado de PDF
tests/srs.test.ts               repetición espaciada (Leitner)
tests/questions.test.ts         mapeo BD/IA → UI, barajado y dificultad
tests/actions-auth.test.ts      guardas estáticas sobre las Server Actions
tests/question-lifecycle.test.ts ciclo de vida de las preguntas
tests/stats.test.ts             agregación de resultados, rangos, perfil físico
tests/render-safety.test.ts     lecturas sin proteger, aislamiento de módulos y ausencia de `any`
tests/exam-results.test.ts      contrato cliente↔servidor, el blanco, reloj y revisión
tests/single-result.test.ts     una fila por respuesta, sin doble inserción
tests/answer-signals.test.ts    lo que se deduce sin preguntar (firmeza, tipo de fallo) y cuándo SÍ se pregunta (regla 56)
tests/dudosas.test.ts           la marca de duda (regla 80): qué se guarda, el umbral del BOE, el veredicto y que el planificador la escuche
tests/asistencia.test.ts        la asistencia (regla 82): hora de Madrid y no del servidor, sesiones, hasta cuándo se avisa, plazas libres, y que el alumno solo toca sus faltas
tests/cuadrante.test.ts         el cuadrante semanal (reglas 96 y 97): la semana real de Alphapol, que un grupo sin horario no sale ni crea días, días sin clase, el tipo sacado del título, la hora escrita a mano, choques de profesor, texto de WhatsApp, plazas con multis, el profesor con cuenta y guardas de las acciones
tests/clases-fisica.test.ts     las clases de grupo en el calendario del alumno (reglas 97 y 98): del horario aunque no estén escritas, «sin clase», faltas, el multi, la fila de Inicio, que los entrenos no traigan las clases y que una semana sin publicar sea un borrador
tests/profesores.test.ts        lo que da cada profesor (regla 100): reconocer la clase por el título, proponer al habitual libre, quién está ocupado a una hora, leer «1-10, 14», el acierto de sus alumnos en sus temas y las guardas
tests/planificar.test.ts        «Planificar» por alumno (regla 97): el resumen de cada semana, la lista por grupos, y copiar a varios con una copia independiente para cada uno
tests/sesiones.test.ts          la física como la lleva un preparador (regla 86): sesiones, lo que apunta el alumno, el calendario, copiar semana, cada frontera del baremo del BOE y las guardas de las acciones
tests/alta-masiva.test.ts       alta en bloque (regla 83): leer la lista pegada, contraseñas legibles, el CSV para Excel, y las guardas de la acción
tests/limpieza.test.ts          dejar la BD solo de Alphapol (regla 81): nunca sin una cuenta con la que entrar, y ninguna tabla con user_id/organization_id fuera de la lista
tests/ai-output.test.ts         parseo y validación de lo que devuelve el modelo
tests/chat.test.ts              memoria, prompt, índice, artículo exacto y qué documento se manda
tests/interview.test.ts         transcripción, informe final y máquina de estados
tests/timer.test.ts             cronómetro de las pruebas físicas
tests/physical.test.ts          perfil físico: normalización y guardas del entrenador
tests/training-plan.test.ts     forma del plan semanal, progreso, progresión, y el registro consultable (workout_logs, §2.11)
tests/rate-limit.test.ts        cuota de IA por usuario y ruta, y sus guardas estáticas
tests/documents.test.ts         visor de fragmentos: agrupación por artículo y resumen
tests/scoring.test.ts           la nota del examen (BOE) y el reloj del simulacro
tests/question-import.test.ts   alta manual e importación CSV (columna `tema` multi-tema incluida), y sus guardas
tests/notes.test.ts             notas privadas del alumno y sus guardas
tests/modules.test.ts           módulos encendidos/apagados y la guarda del servidor
tests/rls.test.ts               quién entra con la clave de servicio y quién con la sesión
tests/academy.test.ts           panel de academia: abandono, fichas, cobertura del temario, el progreso semanal agregado (regla 76) y que los totales de la base de datos den lo mismo (regla 91)
tests/moderation.test.ts        regla 75: candidatas solo para superadmin, y editar/desactivar/descartar/resolver acotado a la propia academia
tests/pagination.test.ts        paginar por encima del tope de PostgREST (regla 74), sin perder lo ya traído si falla a media página
tests/question-confusion.test.ts grafo de confusión descubierto de los datos (regla 73): lift, mínimo de muestra, solo dentro del mismo tema
tests/exam-weights.test.ts      peso real del examen (regla 73): extrae «Tema N ·» de los PDF reales, cuenta por tema
tests/ai-cost.test.ts           panel de consumo de IA: agregación del gasto y sus guardas
tests/membership.test.ts        la puerta de acceso (decideAccess), la solicitud pendiente (P12) y sus guardas
tests/payments.test.ts          pagos mes a mes (P8): periodos, resumen del mes, «sin importe» ≠ 0 € y los exentos (P12) fuera del recuento
tests/app-email-templates.test.ts los correos que manda la propia app (P12): solicitud, aceptado, rechazado
tests/groups.test.ts            grupos (muchos-a-muchos), tipos editables, asignación desde el alumno, herencia del plan y el histórico de semanas que ve el alumno
tests/review.test.ts            repaso de lo fallado: agrupación, «atascada» (4+ fallos) y guardas
tests/question-scheduler.test.ts los cajones por alumno (P10): transiciones de caja, blanco neutro, fecha de repaso, curva, curva de olvido personal (regla 73), proyección semanal «lo que te toca» (regla 74), `dominadasHasta` en cualquier fecha del pasado y `fechaLocalISO` (regla 77)
tests/evolucion.test.ts       «Mi Evolución» (regla 77): resumen del banco sin doble conteo, desglose con contexto, fecha de inicio, actividad diaria, la ventana de la curva recortada por días de CALENDARIO
tests/smart-session.test.ts     la sesión adaptativa (P10): recaídas primero, tope de nuevas escalado, refuerzo sin cupo, intercalado
tests/confidence.test.ts        calibración de la confianza (P10b): niveles, neto de adivinar, «sin datos» ≠ 0
tests/exam-blueprint.test.ts    el simulacro representativo (regla 59): reparto por temas, cobertura por artículo, mezcla de dificultad fija, no repite lo reciente
tests/simulacros.test.ts        ¿Aprobaría? (regla 63): agrupa por exam_id, nota del BOE, media/mejor/tendencia, «sin simulacros» ≠ 0
tests/convocatoria.test.ts      la cuenta atrás (regla 64): días por calendario, formato, textos
tests/schema-drift.test.ts      el código no escribe NI PIDE columnas que no existen
tests/design-system.test.ts     la interfaz sale de ui/: escala, área táctil, dvh y datos reales
tests/exam-session.test.ts      el examen a medias sobrevive a una recarga
tests/operacion.test.ts         los guiones de reset y siembra usan la lógica de la app
tests/auth-messages.test.ts     la pantalla de entrada: errores en cristiano y sus guardas
tests/generacion-solo-admin.test.ts  quién puede gastar en IA y quién no
tests/ai-usage.test.ts          el coste de cada llamada, que ninguna se queda sin contar, y el modelo que Google mantiene (regla 92)
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

`.github/workflows/check.yml` ejecuta `npm run check` **y `npm run build`** en
cada push. Las guardas estáticas solo sirven si corren solas: depender de que
alguien se acuerde de lanzarlas es lo mismo que no tenerlas.

**El build sí está en CI, con variables de mentira.** Aquí ponía que no se podía
porque el prerender exige "las cuatro variables reales"; comprobado el 4 sep,
exige que **existan**, no que sirvan: con cuatro valores inventados el build pasa
entero (`next build` prerenderiza HTML, no consulta nada). Importa porque cada
push a `main` despliega solo, y `npm run check` **no compila la aplicación**: un
`import` que no resuelve o un tipo que solo mira `next build` llegaba a
producción y dejaba la plataforma caída hasta que alguien la abriera.

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

### 101 · El panel de administración tiene una sola forma, y vive en `ui/panel`

- **Qué pasó (9 nov):** los dueños y los profesores de Alphapol vieron el
  panel y dijeron que parecía «pura IA»: tarjetas de 24-32 px de radio, títulos
  en `font-black` diminutos, un icono de un color distinto por pestaña, cuatro
  cajas iguales de cifras en cada pantalla. Era la parte del alumno trasladada
  sin criterio.
- **Qué se hizo:** una forma para todo el panel, en
  `app/components/ui/panel/` (la exporta `ui/index.ts`):
  - **La cáscara** (`PanelShell`): barra lateral marino en escritorio, con las
    pantallas agrupadas (Día a día / Contenido / Sistema); en móvil, una barra
    superior con el menú completo y una inferior con las cuatro de cada día.
    La barra es lo único que no sigue el tema (regla 45).
  - **Las piezas:** `PanelTitulo`, `Pulso` (la franja de cifras, con filetes,
    en lugar de cuatro cajas), `Etiqueta`/`Estado`/`Dato`, `Avatar`,
    `Filtros`/`FiltroChip` (con su contador), `Pestanas`, `Boton`, `Campo*`,
    `Conmutador`, `Hoja`, `Barras`, `PanelLateral`, y **`TablaDual`**: una
    tabla en escritorio y tarjetas en móvil desde los mismos datos.
  - **Reglas de la forma:** esquinas de 8 px, filetes en lugar de sombras, el
    color solo para un estado (verde bien, ámbar atención, rojo urgente, gris
    sin empezar; el estado va siempre con una palabra), Barlow Condensed solo
    en títulos y cifras. Los tokens (`linea`, `hundido`, `noche…`) viven en
    `marca.css`.
  - `Boton`, `Hoja` y `Campo*` aceptan las mismas propiedades que `Button`,
    `Card` y `TextField`, para que migrar una pantalla sea cambiar el nombre.
- **Lo que cada pantalla hace distinto:** una lista que se abre en una ficha
  (Alumnos, Profesores: el «+» de cada fila) o en un editor (Grupos: «Editar
  grupo») lo hace a pantalla completa con su flecha de volver, no en un
  diálogo flotante; en escritorio, Moderación y Banco usan `PanelLateral`.
  Una acción que no se deshace (descartar una pregunta, vaciar el banco,
  apagar un módulo para todos los alumnos) se aleja de las que se repiten
  (regla 26) y pregunta antes.
- **Cuidado:** el panel se ve en el móvil de un profesor tanto como en el
  ordenador del dueño. Se comprobó a 390, 768 y 1.360 px, en claro y oscuro,
  sin desbordes y con todo lo que se toca a 44 px. `design-system.test.ts`
  sigue mordiendo: no se inventan radios a mano en las pantallas.
- **Quedó fuera, a propósito:** «Academias» y el compositor de preguntas.
  «Prep. física» se dejó al principio con el estilo anterior y se pasó
  después a la forma del panel (cabecera, pestañas, hojas, botones y campos
  del kit; los colores de cada grupo se quedan, son los de la academia).
- **Lo que se corrigió al revisarlo con los datos de Alphapol:**
  - En el cuadrante de «Grupos», dos grupos a la misma hora (Alpha y Kappa,
    L-X de 8 a 9) se pintaban uno ENCIMA del otro: solo se veía uno. Ahora van
    en carriles (`enCarriles`) y las horas sin clase se pliegan en un salto
    (`tramosDeHoras`): de 9 a 20 no hay nada que enseñar. El banco de pruebas
    tenía dos grupos que no se pisaban; ahora tiene los que se pisan.
  - La barra inferior del móvil llevaba Grupos y Profesores, que se montan una
    vez: lleva lo de cada día (Alumnos, Asistencia, Prep. física, Pagos), y
    «Más» dice en qué pantalla estás cuando no es una de esas.
  - «Suspender» y «Rechazar solicitud» piden confirmación; un fallo de una
    pantalla ya no se queda puesto al cambiar de pestaña.
- **Se quitó:** el reordenar las pestañas del panel (`localStorage`): con una
  barra lateral agrupada por secciones ya no hacía falta.

### 102 · Pagos: la contabilidad se añade sin romper el cobro de siempre

- **Qué pasó (9 nov):** al ver la rejilla de pagos, los dueños pidieron «más
  datos contables para controlar bien la contabilidad». Eligieron tres cosas:
  el resumen de ingresos, el cierre de caja con exportación, y el método y el
  recibo de cada cobro.
- **Cuatro vistas del mismo dinero** (`AdminPayments`): **Rejilla** (alumnos ×
  meses, un toque marca el pago), **Un mes** (el cobro: importe, método y
  recibo), **Resumen** (ingresos por mes en barras, la media de los meses con
  cobro, el mejor mes y el pendiente estimado) y **Caja** (el cierre de un mes
  por fecha, el total por método y la descarga en CSV).
- **La aritmética es pura y está probada** (`lib/payments.ts`,
  `payments-contabilidad.test.ts`): sin importe anotado no es 0 € (regla 8);
  el pendiente es una ESTIMACIÓN (el importe medio de los que ya pagaron) y es
  `null` si no hay con qué estimar; un exento no cobra ni debe; lo que no tiene
  método anotado va aparte, no se reparte.
- **El CSV es para el gestor:** BOM, `;` y coma decimal (como lo abre Excel en
  español). Todo texto que empiece por `=`, `+`, `-` o `@` se antepone con una
  comilla: un correo no puede convertirse en una fórmula.
- **El esquema, aparte:**
  [`docs/sql/pagos-contabilidad.sql`](sql/pagos-contabilidad.sql) añade
  `monthly_payments.method` y `receipt_no`, el contador de recibos por academia
  (`receipt_counters` y `next_receipt_no`, atómico: dos cobros a la vez no
  sacan el mismo número) y un índice único por (academia, recibo). Solo AÑADE.
  **No se ha ejecutado** desde la sesión que lo escribió (el proxy de la nube
  bloquea `api.supabase.com`); `schema.json` se completó a mano con las dos
  columnas y hay que regenerarlo con `node scripts/schema-snapshot.mjs` tras
  ejecutar el guion.
- **Funciona con y sin el guion:** `getMonthlyPayments` pide las columnas nuevas
  y, si faltan, repite la consulta sin ellas y dice `contabilidad: false`: la
  pantalla no ofrece método ni recibo y avisa de qué falta. `setPayment` solo
  envía `method` y `receipt_no` si la pantalla los manda (PostgREST rechaza la
  escritura entera si una columna no existe, regla 4).
- **Pendiente:** la cuota por alumno o por academia y los descuentos (el
  pendiente se estima con la media hasta entonces), y el cobro de conceptos
  sueltos (matrícula, material). No se hizo: pedía una tabla más y nadie lo ha
  necesitado todavía.
- **Sustituida en parte por la 104** (el mismo día, al unir las dos ramas):
  el método y el recibo no van en la fila del MES sino en cada COBRO, y el
  pendiente ya no se estima con la media: sale de la cuota de cada alumno.
  `pagos-contabilidad.sql` no llegó a ejecutarse y se retiró.

### 103 · Lo que no se toca a diario no ocupa la pantalla

- **Qué pasó (9 nov):** el dueño pidió quitar de «Alumnos» el interruptor del
  control de acceso y la lista de correos exentos de pago, y de «Prep. física»
  el interruptor de la física con preparador. Son decisiones que se toman una
  vez y se quedaban ahí, cada día, ocupando lo primero de la pantalla.
- **Regla:** se quitan de la VISTA, no del funcionamiento. El control de
  acceso sigue encendido (quien se registra solo espera a que se le dé acceso),
  los alumnos exentos siguen exentos y la física sigue encendida. Las acciones
  (`setMembershipRequired`, `addExemptEmail`…) siguen existiendo.
  - Se queda, suelto, el aviso «Hay N sin activar · Activar a todos»: solo sale
    cuando hay alguien esperando, y sin él no habría forma de dar acceso de
    golpe.
  - Si la física estuviera apagada, el aviso que sale en su lugar trae su
    botón «Encender»: quitar el interruptor no puede dejar sin salida.

### 104 · La cuota sale de los grupos, y cada cobro es un recibo del libro

- **Qué pasó (9 nov):** el dueño pidió «un lugar, en Grupos, donde poner el
  precio de cada grupo: físicas 50, teoría 60, inglés 20, las tres 100… y
  según los grupos de un alumno, lo que debe al mes; y así tener previsión de
  ingresos, lo cobrado y lo pendiente». Eligió precio por TIPO de grupo, que
  quien entra a mitad de mes pague el mes entero, y avisó: «si cambio la cuota
  algún día, no debe afectar a las anteriores». A la vez, otra sesión (102)
  había puesto el método y el recibo en la fila del mes, con el pendiente
  estimado por la media de los que ya pagaron.
- **La cuota** (`app/lib/cuotas.ts`, puro y probado):
  - El precio de cada tipo (`group_kinds.price_eur`) y los packs
    (`fee_packs`) se ponen en «Grupos». A cada alumno se le aplica la
    combinación MÁS BARATA de packs sin solaparse y precios sueltos que cubre
    los tipos de sus grupos: un pack nunca cobra más que ir suelto, y dos
    grupos del mismo tipo cuentan una vez.
  - Un tipo **sin precio no es 0 €** (reglas 8 y 16): la cuota queda «sin
    calcular» y «Pagos» avisa de cuál falta. Un alumno sin grupos, igual.
  - La cuota PROPIA de un alumno (`memberships.custom_fee_eur`) manda sobre
    la tarifa. Un exento no entra en la lista.
- **Lo que se debía cada mes, congelado** (`monthly_payments.due_eur`):
  al abrir «Pagos», el mes en curso tiene una fila por alumno activo con su
  cuota (`cambiosParaAbrirMes`). Solo se pone al día con la tarifa la fila que
  nadie ha tocado (ni cobrada ni puesta a mano, `due_manual`); los meses
  pasados no se tocan NUNCA. Cambiar un precio vale desde este mes para quien
  aún no ha pagado, y no reescribe lo que se debía antes.
- **El libro de cobros** (`payment_entries`): cada cobro es un apunte con su
  número de recibo (correlativo por academia), su método, su fecha y quién lo
  anotó. Un mes puede cobrarse en dos veces (30 € en efectivo el día 3 y 20 €
  por bizum el 15): son dos recibos y dos días de caja. El número lo da la base
  de datos (`registra_cobro`), en la misma transacción que el apunte, con la
  fila del mes bloqueada: dos cobros a la vez no comparten número y uno fallido
  no lo gasta. Deshacer es ANULAR (`anula_cobros`): el recibo se queda con su
  número, como en un talonario. `amount_eur` y `paid` de la fila del mes son
  un RESUMEN que rehace `recalcula_mes` (lo leen Alumnos y el perfil del
  alumno); en «Pagos» manda el libro (`filaSegunLibro`).
- **La pantalla** (`AdminPayments`): «Cobrar» (un toque cobra lo que falta
  con el método que se recuerda en ese navegador, y se puede deshacer), la
  ficha de cada alumno a pantalla completa (otra cantidad, sus recibos,
  anular, la cuota de un mes a mano o «no cobrar este mes», su cuota propia y
  sus meses), «Histórico» (cobrado y pendiente apilados con rayas, para no
  depender del color, la previsión del mes que viene y la rejilla alumnos ×
  meses) y «Caja» (lo que ENTRÓ en un mes por la fecha del cobro, por método y
  por día, recibo a recibo, el CSV para el gestor y el recibo para imprimir).
- **El CSV no puede ejecutar nada:** una celda que empieza por `=`, `+`, `-`
  o `@` lleva una comilla delante (`celdaCsv`), y el recibo escapa el HTML de
  lo que viene de la base de datos.
- **Seguridad:** el alumno que llega de la pantalla se comprueba que es de la
  academia antes de escribir (`alumnoDeLaAcademia`), y cada consulta va
  acotada por `organization_id` dentro (lo vigila `payments.test.ts`).
- **El esquema:** [`docs/sql/pagos-cuotas.sql`](sql/pagos-cuotas.sql). Solo
  añade: columnas, `fee_packs`, `payment_entries`, `receipt_counters` y las
  tres funciones (solo para la clave de servicio).

### 105 · El calendario no guarda nada: enseña lo que ya está programado

- **Qué pasó (9 nov):** el dueño pidió «un calendario con todos los eventos
  que existan, con vista diaria, semanal y mensual, y filtros para quitar y
  poner por grupo, por profesor… que de un vistazo se vea toda la
  programación».
- **Regla:** el calendario NO tiene tabla propia. Cada evento se DERIVA
  (`armaCalendario`, en `app/lib/calendario.ts`) de lo que ya existe, así que
  no puede contradecir al cuadrante, a Asistencia ni a lo que ve el alumno:
  - las clases de cada grupo, de su horario (días, hora y profesores del
    grupo), menos sus días «sin clase», que salen tachados con su motivo;
  - en física, la sesión del cuadrante de ese día, con su título y SU
    profesor; un día de clase sin sesión sale «Sin planificar», no vacío; las
    de un día añadido y las sueltas de Multi también;
  - el entreno de cada alumno (su filtro empieza apagado: son muchos);
  - la fecha del examen.
  - Cada evento lleva quién va (inscritos, faltas avisadas, multis y plazas),
    contado como en Asistencia (`cuentaSesion`).
- **La pantalla** (`AdminCalendario`, la primera de «Día a día» y de la barra
  del móvil): día, semana y mes, las tres con la misma forma COMPACTA. El
  dueño lo pidió al verla: «que el día y la semana se parezcan al mes, que no
  tenga que hacer tanto scroll». La primera versión de la semana era una
  rejilla de horas y el día, tarjetas grandes: se veía bonito y había que
  bajar para enterarse de nada.
  - Semana: siete casillas como una fila del mes, cada evento en dos líneas
    («8:00 Boxeo» / «Alpha · Juan»); en el móvil, una fila por día con sus
    eventos uno tras otro.
  - Día: tres columnas (mañana, tarde, noche) y una línea por evento con la
    hora, el color, qué es, quién lo da y cuántos van; lo de todo el día,
    arriba.
  - Mes: tres eventos y «+N más» en escritorio; puntos de color en el móvil. Los
  filtros esconden por qué es (tipo de grupo, entrenos, días sin clase,
  examen), por grupo y por profesor («Sin profesor» incluido), y hay
  búsqueda. Se guarda lo que se ESCONDE, no lo que se ve: un grupo o un
  profesor nuevo sale sin marcarlo. La vista y los filtros se recuerdan en
  cada navegador. Un evento abre su ficha con el camino a donde se cambia
  (cuadrante, Asistencia, el horario del grupo).
- **Seguridad y volumen:** `getCalendario` va detrás de `requireAdmin`, todo
  acotado a la academia (lo que no lleva `organization_id`, por los grupos de
  la academia), y paginado (un mes de entrenos de cien alumnos pasa de las
  1.000 filas). Como mucho 62 días por petición.

### 106 · Datos de demostración: solo se añaden filas, y el borrado quita exactamente lo que creó la carga

- **Qué pasó (10 nov):** el dueño quiso ver la aplicación entera llena
  (alumnos, grupos, cuadrante, entrenos, marcas, asistencia, cobros, caja,
  calendario) entrando con `prueba.admin@alphapol.es`, y poder quitarlo todo
  después. La base de datos es la de producción y no tiene copias.
- **Regla: lo inventado se AÑADE, nunca se modifica, y se deshace por lo que se
  apuntó, no «por academia».**
  - **Solo se añaden filas.** Se USAN los 6 profesores, los 9 grupos, los
    precios, la convocatoria y las sesiones que ya existen, y no se tocan. Si
    la fila que iba a crearse ya existe con esa clave (una sesión de ese grupo
    ese día, una semana publicada, un día sin clase, una plantilla con ese
    título), ni se crea ni se apunta. No se crean profesores, ni reportes, ni
    se toca el banco común. Sin IA ni correos (`email_confirm: true`).
  - **El registro** (`demo_registro`, [`docs/sql/demo-registro.sql`](sql/demo-registro.sql);
    RLS y cero políticas): cada fila que crea la carga se apunta con su tabla y
    su clave primaria (jsonb, también las compuestas) ANTES de crearla. Una
    carga cortada a medias se puede seguir o borrar. Las marcas `_carga` (mes y
    «ahora» común a todas las fases) y `_fase` (tandas hechas) también viven ahí.
  - **El borrado** (`PASOS_BORRADO`) quita lo registrado y lo que CUELGA de una
    cuenta, un grupo o una sesión de la demo aunque lo creara la aplicación al
    usarla (el mes que abre «Pagos», un cobro, una falta). No existe un paso
    «por academia»: `tests/demo-borrado.test.ts` lo vigila (solo dos `.delete()`,
    uno `in` y otro `match` de clave entera) y se comprobó rompiéndolo.
    El registro de auditoría NO se borra (el ensayo dice cuántos apuntes
    nombran cuentas de la demo). Antes, un **ensayo** cuenta tabla a tabla y
    cuántas filas son «colgadas»; solo se borra escribiendo BORRAR (también lo
    comprueba el servidor). Al terminar, el registro queda vacío.
  - **El contador de recibos:** los cobros usan `registra_cobro`, así que
    gastan números. Se apunta si la fila de `receipt_counters` existía antes;
    al borrar, si no queda ningún cobro y la creó la carga, se borra (el
    primer recibo de verdad vuelve a ser el nº 1); si queda alguno real, no se
    toca y se avisa del hueco.
  - **Por fases** (Vercel Hobby corta a 60 s; `maxDuration = 60` en las dos
    páginas): cuentas (en paralelo, por tandas) → grupos y horario → física →
    respuestas y marcas → cobros (un mes por llamada, en orden de fecha para
    que los recibos sigan a las fechas). Los ids son deterministas
    (`uuidDemo`): reintentar una fase no duplica nada. El borrado avanza
    mientras haya tiempo y se vuelve a llamar.
- **El generador es puro y determinista** (`app/lib/demo.ts`, semilla fija; la
  historia se cuenta en «días atrás», no en fechas): mismos 45 alumnos y misma
  historia cargues cuando cargues; solo cambian las fechas, que salen del mes en
  curso en hora de Madrid. `alumno@demo.alphapol.test` es la cuenta para ver la
  parte del alumno; su contraseña se genera al cargar, se enseña UNA vez y no se
  guarda.
- **Lo que no se pudo:** la «última conexión» de «Alumnos» sale de
  `auth.users.last_sign_in_at`, que solo cambia al iniciar sesión de verdad:
  no se puede inventar. Todos salen «Nunca ha entrado»; los casos «hace tiempo
  sin estudiar», «nunca» y los demás sí salen, de las respuestas.
- **Cómo se probó** (nada de PostgREST desde la nube): motor entero contra una
  base de datos falsa en memoria con filas reales alrededor, cortando la carga
  en 11 puntos distintos y borrando después; y las mismas operaciones en SQL
  contra el esquema REAL (volcado con consultas de solo lectura) en un Postgres
  local: tras cargar y borrar, ninguna tabla cambia y el registro queda vacío.
  Se escribió contra producción una sola vez (una tabla de prueba dentro de una
  transacción que se deshizo) y el sistema bloqueó la segunda: no se repitió.

### 107 · Las horas de un profesor salen de lo que da de verdad, y «Grupos» es la lista de todos

- **Qué pasó (10 nov):** el dueño, al usarlo:
  - «A los profesores de físicas no se les suman las horas: Lucio tiene esta
    semana 4 clases de física y le pone 0 h». La carga de «Profesores» solo
    contaba los grupos en los que el profesor está asignado (eso es teoría);
    lo que da un preparador son las sesiones del cuadrante, que se veían en
    su ficha pero ni sumaban ni salían en los días de la tabla.
  - «En grupos el calendario me sobra; no encuentro en ninguna parte un
    listado completo de todos los grupos».
  - «En profesores, para los temas de teoría, un desplegable con todos los
    temas y marcar los que le correspondan».
  - «En el cuadrante, en tablet y PC, el máximo de columnas posibles: ahora
    una semana me sale en columnas de dos».
- **Regla:** lo que da un profesor en una semana sale de DOS sitios
  (`clasesDeLaSemana`, en `app/lib/profesores.ts`): teoría, inglés… por el
  horario de los grupos en los que está; física, por las sesiones del
  cuadrante de esa semana con su nombre (hasta la hora del grupo, o una hora
  si la sesión va aparte). Un grupo de física no suma por su horario aunque
  el profesor esté asignado: manda el cuadrante, y así no cuenta doble. La
  tabla tiene su selector de semana.
- **«Grupos»** es la lista de TODOS los grupos, por tipo (con cuántos grupos,
  alumnos y el precio del tipo), con horario, alumnos de plazas y profesores;
  se toca uno para editarlo. La semana entera está en «Calendario» y la
  física, en el cuadrante: no se repite aquí.
- **Los temas de un profesor** se eligen en una lista de todo el temario, por
  bloques, con casillas, buscador, «marcar el bloque» y quién más da cada
  tema. Se guarda con la misma acción de antes.
- **El cuadrante** pone los días en tantas columnas como quepan (cada día
  pide unos 11rem): cuatro en un portátil con la barra lateral, la semana
  entera en un PC ancho, una en el móvil.


### 108 · Lo que dice la base de datos no viaja al navegador: va a «Logs»

- **Qué pasó (11 nov):** en la revisión de antes del piloto, 128 acciones
  devolvían `error.message` tal cual lo escribe Postgres («column "x" of
  relation "y" does not exist»). Le enseña a cualquiera el nombre de tablas y
  columnas, al alumno no le sirve, y el detalle que sí hace falta para
  arreglarlo solo quedaba en el registro de Vercel, que caduca y nadie mira.
- **Regla:** un error de la base de datos se devuelve con `fallo('dónde',
  error)` (`app/lib/fallos.ts`), nunca con `error.message`. Hace tres cosas:
  al navegador, un mensaje corto; al registro del servidor, la línea con el
  prefijo `[fallo]`; y a `admin_audit_log` una fila con `action = 'error'`,
  quién, dónde y lo que dijo la base de datos.
- **Sin tabla nueva:** se reusa `admin_audit_log`. Quién ha sido sale de la
  sesión dentro de `fallo` (no se pasa por parámetro), y sin sesión no se
  guarda porque `actor_id` es obligatorio. El mismo fallo repetido se guarda
  una vez por minuto.
- **«Logs»** tiene un tercer bloque, «Fallos». El admin ve los de su academia;
  el superadmin, todos. `getAdminAuditLog` los excluye: ahí va solo lo que
  alguien HIZO.
- **Lo que se queda como estaba:** los mensajes de Supabase Auth al invitar o
  dar de alta («ese correo ya tiene cuenta») los ve solo un admin y le dicen
  algo que puede arreglar; y lo que lanza Gemini al generar (regla 92).
- `paginaCompleta` también pasa por `fallo`: su error acababa en pantalla.

### 109 · Un interruptor de módulo es de UNA academia

- **Qué pasó (11 nov):** `setModuleEnabled` escribía la única fila que había
  por módulo: el admin de una academia que apagara «Test» se lo apagaba a
  todas. Con una sola academia no se notaba. Y había más restos del mismo
  tipo: `getGroups` y el panel «Alumnos» leían `class_members` entera, de
  todas las academias y sin paginar, y dos acciones sin uso
  (`getAdminUsersList`, `getGlobalActivity`) devolvían perfiles y respuestas
  de todo el mundo.
- **Regla:** el admin escribe la fila de SU academia (`test:<uuid>`,
  `moduleRowId`), el mismo truco que los interruptores de física (regla 68) y
  por lo mismo: cabe sin cambiar el esquema. La fila sin sufijo es la de la
  plataforma y solo la toca el superadmin. Al leer, primero la plataforma y
  encima lo que diga la academia, en un sentido o en otro.
- `requireModule` y `leeModuleSettings` llevan la academia: `requireModule(
  'test', auth.user.organizationId)`.
- Las tablas hijas sin `organization_id` (`class_members`,
  `class_group_staff`) se acotan por los grupos de la academia DENTRO de la
  consulta y se paginan (reglas 65 y 74).
- Una acción que no usa nadie se borra: sigue siendo un endpoint público.

### 110 · El acierto lo decide el servidor, no el navegador

- **Qué pasó (11 nov):** `is_correct` viajaba desde el navegador y se guardaba
  tal cual. Con las herramientas del navegador un alumno podía apuntarse cien
  aciertos sin acertar ninguna, y el panel de la academia se los creía.
- **Regla:** del cliente solo se toma QUÉ opción marcó. Si acertó lo calcula
  `corrigeFila` (`app/lib/exam-results.ts`) contra `correct_index` del banco,
  en `saveTestResult` y `saveExamResults`. Lo que no se puede comprobar (la
  pregunta no está en el banco, no hay `selected_index`, un blanco) no es un
  acierto. Si el banco no contesta, no se guarda: el examen sigue en el móvil.
- **El segundo cierre es de la base de datos:**
  `docs/sql/acierto-lo-decide-el-servidor.sql`. El alumno tiene política de
  INSERT y UPDATE sobre sus filas (está bien: es lo que hace que RLS proteja),
  así que podía escribir `is_correct` contra la API de Supabase con su propio
  token, sin pasar por la aplicación. El disparador recalcula al insertar y
  congela `is_correct`, `selected_index` y `question_id` al actualizar; con la
  clave de servicio o SQL a mano no actúa. Probado en un Postgres local y,
  ya ejecutado en producción (11 nov), como alumno dentro de una transacción
  que se deshizo.
- **Lo que NO cierra:** la respuesta correcta sigue viajando con la pregunta
  (el entrenamiento la enseña al contestar). Mirarla es copiar en un examen
  de práctica: se engaña el alumno. Lo que ya no puede es falsear lo guardado.

### 111 · La contraseña provisional se cambia al entrar, y el mínimo es uno

- **Qué pasó (11 nov):** la clave del alta en bloque (regla 83) decía en su
  comentario «se cambia al entrar» y nada obligaba: el alumno podía quedarse
  con la que salió en una lista que se descarga, se imprime o se manda por
  WhatsApp. Y el mínimo era 6 en una pantalla y 8 en otra.
- **Regla:** la cuenta creada con clave provisional lleva
  `clave_provisional: true` en sus metadatos. Mientras la lleve, `AppShell`
  solo enseña «Elige tu contraseña» (la misma pantalla de la invitación, con
  otro texto y un «Salir»). Al guardar, la contraseña y la marca van en la
  misma llamada.
- El mínimo es `MIN_CLAVE` (8), en `app/lib/clave.ts`, para todas las
  pantallas, y también en Supabase Auth (`password_min_length`, puesto a 8 el
  11 nov por la API de gestión).
- **Límite:** las cuentas creadas ANTES de esta regla no llevan la marca. Hoy
  no hay ninguna de alumno real.

### 112 · Cabeceras de seguridad

- **Qué pasó (11 nov):** no había ninguna. La aplicación se podía meter en un
  marco de otra página, y el navegador no tenía dicho de dónde cargar código.
- **Regla:** `next.config.ts` pone en todas las rutas la política de
  contenido, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy` (el micrófono, solo la propia aplicación: lo usa la
  entrevista) y HSTS. Las conexiones, solo a la aplicación y al proyecto de
  Supabase, que sale de `NEXT_PUBLIC_SUPABASE_URL`.
- **Si se añade algo de fuera** (un vídeo incrustado, una fuente, analítica),
  no cargará hasta que se añada su origen a la política: mirar la consola.

### 113 · El alumno no descarga el panel de administración

- **Qué pasó (11 nov):** toda la aplicación iba en un fichero de 1,09 MB que
  se descargaba para pintar la pantalla de entrar.
- **Regla:** `AppShell` carga `StudentDashboard` y `AdminView` con `lazy`,
  cuando se sabe quién ha entrado; y los tres módulos fuera del MVP (chat,
  biodata, entrevista) solo si se abren. El trozo más grande queda en 359 KB.
- `ActiveTest.tsx` (1.293 líneas) NO se ha partido: es el examen, funciona, y
  partirlo sin alumnos usándolo es arriesgar lo que más importa del piloto.

### 114 · El alumno tiene nombre, teléfono y foto, y los pone él

- **Qué pasaba (11 nov):** `profiles` solo guardaba id, correo y rol. El nombre
  que veía la academia («Ana Ruiz») se DEDUCÍA del correo, y no había teléfono:
  para llamar a quien lleva dos semanas sin entrar había que buscarlo fuera.
- **Regla:** tres columnas opcionales en `profiles` (`full_name`, `phone`,
  `avatar_url`; vacío es `null`, regla 16). El alumno las edita en «Mi perfil →
  Mis datos»; la academia corrige nombre y teléfono desde la ficha, donde el
  teléfono es un enlace `tel:`. La foto es solo del alumno.
- **Todo pasa por el servidor** (`app/actions/datos.ts`): `profiles` sigue con
  su única política (leer el propio) y el alumno NO la escribe con su sesión
  (regla 34). El id sale de la sesión (regla 1), las columnas son lista blanca
  (regla 2) y todo se limpia antes (`app/lib/perfil-alumno.ts`, regla 27).
- **La foto se recorta y reduce EN EL MÓVIL** (256 px, JPEG, ~30 KB) antes de
  subirla; el servidor comprueba los bytes (que SEA un JPEG, no lo que diga la
  cabecera) y el peso. Va a un cubo público `avatars` del almacenamiento de
  Supabase, con el id del alumno como nombre de fichero, sin políticas de
  escritura: solo escribe la clave de servicio. La política de contenido
  (regla 112) deja pintar imágenes del origen de Supabase.
- **El nombre que se enseña** es el que puso, y si no, el deducido del correo
  (`nombreVisible`): nada se rompe donde aún no lo ha puesto.
- **Guion:** `docs/sql/perfil-alumno.sql` (columnas, comprobaciones de largo y
  el cubo). Las lecturas van aparte de las del resto del perfil: sin el guion,
  las pantallas salen igual con los datos vacíos.

### 115 · El examen en papel tiene la forma del de verdad

- **Qué pasaba:** el día del examen el opositor recibe un cuadernillo con su
  portada y una hoja de lectora óptica donde rellena círculos. Quien solo ha
  entrenado en el móvil se encuentra un formato que no ha visto, y la academia
  monta los simulacros presenciales a mano con fotocopias.
- **Regla:** «Exámenes en papel» (panel, sección Contenido) saca del banco de
  la academia un examen y descarga TRES PDF del mismo examen: el cuadernillo
  (portada con las instrucciones y las preguntas), la hoja de respuestas (datos
  del opositor, DNI en círculos, zona 1 de 100 con A-B-C y zona 2 de cinco
  opciones, con su fila de anular) y la plantilla de corrección (la misma hoja
  con la correcta rellena). Todo con el logo y la marca de agua de Alphapol, y
  un pie que dice que es un simulacro de la academia: se parece al examen, no
  se hace pasar por él.
- **El reparto** es el del simulacro del alumno (`planExamen`): cada tema pesa
  lo que pesa en el examen real. Sin temas elegidos, todo el temario. La
  acción lleva las respuestas, así que es solo de la academia
  (`getExamenImprimible`, `requireAdmin`) y del banco de SU academia (regla
  75). No se guarda: cada llamada es un examen distinto.
- **`app/lib/examen-pdf.ts` es puro** (regla 21) y corre en el navegador: se
  carga solo al descargar (`import()`, regla 113). Usa `pdf-lib` y las fuentes
  estándar del PDF, que no saben escribir todo: `textoImprimible` sustituye lo
  que falta (una flecha, un espacio fino) en vez de dejar que una pregunta con
  un carácter raro tumbe el documento.
- **Los logos** salen de los SVG de la marca en PNG transparente
  (`node scripts/marca/logos-pdf.mjs` → `public/examen/`); el escudo y el
  rótulo de Policía Nacional son los que se pasaron de la convocatoria. El
  logotipo de Alphapol lleva «POL» en blanco: sobre papel va siempre encima de
  su placa marina.
- **Límite:** la hoja tiene sitio para 100 preguntas. Los PDF se han mirado
  como imagen, no impresos: antes de fotocopiar cien, probar UNA hoja en la
  impresora de la academia.

### 116 · El informe semanal avisa del cambio, no solo del silencio

- **Qué pasaba:** «Alumnos» avisaba a los 14 días sin entrar. Para entonces el
  alumno casi siempre se ha ido: dos semanas sin tocar la aplicación es el
  final del abandono, no el principio.
- **Regla:** lo que avisa antes es el CAMBIO, comparado con lo que ese mismo
  alumno venía haciendo (`app/lib/informe-semanal.ts`): la caída contra su
  media de las cuatro semanas anteriores, semanas seguidas bajando, el acierto
  que se hunde, las faltas a clase y quien no ha empezado tras una semana de
  alta. Cada señal suma puntos Y trae su frase («venía haciendo 200 a la semana
  y esta lleva 30»): 60 o más es «llamar», 30 o más «vigilar». Un «riesgo alto»
  sin motivo no le sirve a quien tiene que coger el teléfono (regla 35).
- **A prorrata:** con la semana a medias se compara contra lo que tocaba a
  estas alturas, y el informe enseña por defecto la semana pasada hasta el
  jueves: un lunes «esta semana» está vacía para todo el mundo y marcaría a toda
  la academia (regla 66).
- **Quien hace poco de siempre no «cae»:** por debajo de 15 preguntas a la
  semana la media no dice nada. El acierto solo cuenta con 20 respuestas.
- **Las cuentas las hace la base de datos** (`panel_actividad_semanal`, regla
  91; guion `docs/sql/informe-semanal.sql`, revocada a `anon` y
  `authenticated`): una fila por alumno y semana, con la semana en lunes y en
  la hora de la academia (regla 82). Sin el guion, la pantalla lo dice.
- Se puede copiar como texto para WhatsApp y descargar en PDF.
- **Lo que NO hace:** no avisa solo (ni correo ni notificación): es un informe
  que se mira. Mandarlo cada lunes es el siguiente paso, y pide decidir a quién.

### 117 · Los psicotécnicos los genera el código, no un banco

- **Qué pasaba:** una prueba que se parece a esto no pregunta nada que haya
  que saber: mide rapidez y razonamiento. Con un banco de preguntas escritas,
  a la tercera semana el alumno se las sabe de memoria y ya no entrena nada.
- **Regla:** cada sesión sale de una SEMILLA (`app/lib/psico.ts`): la misma
  semilla da siempre las mismas preguntas y otra, otras. No se acaban, no
  cuestan nada (ni IA ni redactarlas) y no hay respuesta que memorizar. Seis
  tipos: series numéricas, series de letras (abecedario español, con la Ñ),
  cálculo, sinónimos y antónimos, atención (parejas de códigos) y figuras (una
  tabla 3×3 con la casilla que falta, dibujada en SVG por código).
- **La corrección es del servidor** (regla 110): al empezar se guarda la
  semilla y al navegador van las preguntas SIN respuesta ni explicación
  (`aPublica`); al entregar, el servidor vuelve a generar la sesión con la
  semilla y corrige. El navegador solo dice qué opción marcó. `psico_sessions`
  tiene RLS y cero políticas: el alumno no puede leer la semilla. Una sesión se
  entrega una vez, y la duración sale del reloj del servidor (regla 14).
- **Si se cambia un generador**, una sesión empezada antes del despliegue y
  entregada después se corregiría contra otras preguntas: súbase
  `VERSION_PSICO` (la sesión guarda la suya y la entrega se rechaza si no
  coincide, con un mensaje que lo explica).
- **Nota:** cinco opciones; los blancos no restan (regla 24) y cada cuatro
  fallos quitan un acierto, la fórmula de la regla 22 llevada a cinco opciones.
- **Probados con 400 semillas por tipo:** cinco opciones distintas, una sola
  correcta, enteros sin decimales, y en las figuras que NINGÚN distractor
  completa también la tabla. Es módulo propio (`psico`): se enciende y apaga
  por academia desde «Ajustes» (regla 109).
- **Lo que NO se sabe:** si el nivel de dificultad se parece al del examen
  real. Se hizo a ojo con lo que se suele pedir; conviene que un opositor que
  ya haya pasado la prueba los pruebe y diga si están más fáciles o más
  difíciles, y qué tipos faltan (dominós, rotaciones, tablas de datos).

### 118 · El examen en papel se guarda, se pone a un turno y su nota se lleva

- **Qué pasaba (12 nov):** «Exámenes en papel» (regla 115) generaba el examen,
  lo descargaba y se perdía: no se podía reimprimir, ni evitar que el siguiente
  simulacro repita preguntas, ni saber quién lo hizo y cómo le fue. La academia
  lo pone en clase a un turno (martes y jueves por la mañana) y quiere un
  registro por alumno: sus exámenes presenciales, su nota y su evolución.
- **Tres tablas** (`docs/sql/examenes-clase.sql`; RLS y ninguna política, solo
  las toca la clave de servicio, regla 34):
  - `exam_papers`: el examen guardado, con una COPIA de sus preguntas. Si luego
    se edita o se descarta una del banco, el examen que se repartió en papel
    sigue siendo el mismo y se corrige contra lo que se imprimió.
  - `exam_sittings`: una «aplicación»: ese examen, a esos grupos (vacío = toda
    la academia), ese día, y hasta qué día pueden meter las respuestas.
  - `exam_results`: un alumno en una aplicación. Un solo resultado por alumno.
- **Las respuestas las mete EL ALUMNO, no el profesor** (en clase o al llegar a
  casa; el profesor no va a teclear 40 hojas). Tocando A, B o C pregunta a
  pregunta, o escribiéndolas de seguido (`abcb-ac…`, con `-` para el blanco,
  `parseaRespuestas`): si no salen EXACTAMENTE las que son, no se adivina nada,
  porque un desfase de una descuadra todas. El servidor corrige contra la copia
  guardada con la fórmula de la convocatoria (`scoreExam`, regla 22), una sola
  vez, solo el día del examen o después y dentro del plazo; la solución no se
  enseña hasta entregar (regla 110).
- **Esas respuestas son DECLARADAS por el alumno**, no recogidas por la
  academia: sirven para que él se corrija y para medir cómo salió cada
  pregunta, no como nota oficial. Por eso el profesor puede poner encima la
  nota oficial del papel (`teacher_score`), que manda sobre la calculada
  (`notaVigente`), y marcar a quien no se presentó (que no es un 0). Si un
  alumno se equivoca al teclear, «Que repita» le borra la entrega.
- **Lo que ve la academia** («En clase»): quién ha entregado, la nota media, la
  distribución, y las preguntas que más han fallado con qué opción mala engaña:
  para repasarlas en clase. **Lo que ve el alumno** («Exámenes»): sus notas, la
  media de su turno (solo si han entregado al menos tres: no señala a nadie, y
  nunca llegan ids de otros alumnos) y su evolución.
- **El informe semanal lo cuenta** (regla 116): no presentarse a un examen en
  clase suma 30 puntos (ya es de «vigilar» por sí solo) y sacar menos del
  aprobado suma 15.
- **Filtros del examen** (`getExamenImprimible`): todo el temario, bloques
  enteros o temas sueltos; dificultad como mezcla (más fáciles, equilibrada,
  más difíciles; se REPARTE, no se filtra); y «no repetir» las preguntas de los
  exámenes ya guardados, mientras queden bastantes (`question_ids`). Aviso
  honesto: hoy las 4.617 preguntas son de dificultad «media» (se sembraron con
  el valor por defecto), así que pedir más fáciles o más difíciles no cambia
  nada y la pantalla lo dice. La dificultad real es el paso siguiente.
- **Módulo `presencial`** («Exámenes» en el alumno), que se enciende y apaga
  por academia (regla 109). Sin las tablas, el alumno ve la lista vacía y la
  academia un aviso que dice qué guion falta.
- **Lo que NO hace todavía:** leer la hoja de respuestas con una foto; contar
  estas respuestas en «Repasar fallos» ni en el motor adaptativo (no entran en
  `question_attempts`: no llevan tiempos ni camino de respuesta, y mezclarlas
  falsearía lo que mide); calcular la dificultad de cada pregunta a partir de
  ellas (con 40 alumnos por examen, es la mejor fuente que habrá).
- **La hoja de respuestas se compara con el original MIRÁNDOLA** (regla 115):
  la primera versión pasó los tests y la revisión «a ojo» y aun así se veía
  fatal. Un PDF se comprueba renderizándolo a 200 ppp
  (`pdftoppm -r 200 -png`) y poniéndolo al lado del original, no leyendo su
  texto. Las proporciones (círculo ~6 pt, relleno en pastilla más ancho que el
  círculo, fila de respuesta blanca) salen de ahí.

### 119 · El banco repite el mismo hecho hasta 26 veces: se agrupa, no se borra

- **Qué pasaba (12 nov):** al leer una muestra del banco salió que muchas
  preguntas eran la misma con otras palabras. Medido sobre las 4.617 activas:
  **1.562 (el 34 %) son repeticiones de otra**; hay unos **3.055 hechos
  distintos**, y el mayor aparece 26 veces («tráfico ilícito de migrantes
  frente a trata», «seguridad privada, actividad complementaria y subordinada»,
  el modelo tripartito de las actitudes…). El banco se generó con el modelo a
  partir de los mismos artículos.
- **Qué cuesta:** un examen que lleva el mismo hecho dos veces regala puntos a
  quien lo sabe y castiga dos a quien no; deja menos sitio a los demás temas; y
  la dificultad medida de una pregunta se reparte entre sus repeticiones. En un
  examen de 100 de todo el temario son pocas (2,8 de media), pero en uno de un
  solo tema son muchas (5,6 de 25).
- **Regla:** las preguntas se agrupan en FAMILIAS (`question_bank.family_id`,
  mismo valor en todas las de una; NULL = sin repetidas) con
  `npm run familias` (ensayo) y `npm run familias -- --hazlo` (guarda). NO se
  borra ni se desactiva ninguna: el generador de exámenes
  (`planExamenSinFamilias`: simulacro del alumno y examen en papel) pone como
  mucho una por familia, y solo si no hay bastantes hechos distintos para llegar
  al tamaño pedido repite, y lo dice (`conRepetidas`): un examen completo con
  algún hecho repetido es mejor que uno corto, pero hay que saberlo.
- **Cómo se detecta, sin IA y sin gasto** (`app/lib/familias.ts`): el texto del
  enunciado más el de la opción CORRECTA (las malas varían, la buena no: es el
  hecho que se pregunta), pesado por lo raras que son las palabras en todo el
  banco (TF-IDF), y similitud del coseno ≥ 0,6. Tres salvaguardas que salieron
  de mirar pares reales, porque sin ellas se juntaban preguntas DISTINTAS:
  1. la respuesta correcta tiene que parecerse también por sí sola (dos
     preguntas sobre el mismo artículo que preguntan cosas distintas comparten
     casi todo el enunciado);
  2. las cantidades tienen que coincidir («al día siguiente» frente a «a los
     veinte días» es otro hecho);
  3. si las dos llevan números o códigos y no coinciden, no son la misma
     (otro artículo con la misma fecha de respuesta, o C2 frente a C3).
  Una familia no pasa de 30 (el tope es contra el encadenado A≈B, B≈C…; con 8 se
  troceaban en tres las que de verdad son una).
- **Lo que NO está resuelto:** la familia es de TEXTO, no de significado: dos
  preguntas del mismo hecho con palabras muy distintas no se juntan, y una
  familia de «dispositivos de red» (hub, switch, router) mezcla varios hechos
  y limita a una pregunta de las varias legítimas. Es conservador a propósito.
  Hay que repetir `npm run familias -- --hazlo` cuando entren preguntas nuevas.
- **Lo más importante que salió: el banco es MUY desigual por tema.** Los
  hechos distintos por tema (`docs/dificultad/hechos-por-tema.json`): el tema 31
  (Inmigración) tiene 40 preguntas y **7 hechos**; el 45, 40 → 10; el 39, 39 →
  12; el 32, 40 → 14; el 33, 40 → 16; el 28, 40 → 18; los temas 3, 8, 16 y 21
  tienen más de 300 cada uno. Un examen de un tema flojo repite hechos aunque
  haya 40 preguntas. Esto es lo que dice DÓNDE meter preguntas nuevas del
  temario propio de Alphapol, y es más importante que la dificultad.

### 120 · Un aviso solo es «enviado» si la base de datos lo aceptó, y el resultado del simulacro dice dónde se falla

*(12 nov 2026, de revisar con capturas la plataforma que usa la academia hoy.)*

- **El fallo.** `reportQuestion` (y toda acción de moderación) devuelve
  `{ success }` y NO lanza. El cuadro de «Avisar» de `ActiveTest` no lo miraba
  y daba siempre «Aviso enviado»: un reporte rechazado por la base de datos se
  le daba al alumno por entregado y la pregunta mala seguía en el banco. Ahora
  se mira `res.success`; si falla, se avisa y el cuadro queda abierto con lo
  escrito. Vigilado en `afianzar.test.ts` (acotado al trozo del reporte: otro
  `if (!res.success)` del mismo fichero habría hecho pasar un test más flojo).
- **Rendimiento por tema.** El resultado del SIMULACRO enseña, del peor al
  mejor, aciertos sobre total y porcentaje de cada tema (`rendimientoPorTema`
  en `app/lib/stats.ts`, regla 8), si hay dos temas o más. El porcentaje es
  sobre todas las del tema: un blanco no es un fallo (24) pero no es un
  acierto. Una pregunta sin tema no se agrupa en un «tema» inventado (16). En
  ENTRENAMIENTO no se enseña: no lleva nota (59).
- **Lo que se vio en su plataforma y NO se copia:** gemas, puntos y rachas
  (tono de academia, regla 85), el análisis con IA por cada fallo (un coste de
  Gemini por pregunta fallada, y el chat está fuera del MVP, 58) y el ranking
  nacional (expone al alumno con nota baja; un ranking por turno, si lo pide
  el dueño, saldría de los exámenes en clase, regla 118).

### 121 · La dificultad se estima con una vara fijada antes, y nada se rellena con un 2

*(12 nov 2026.)*

- **Por qué hay que medir el acuerdo.** Las 4.617 preguntas valen 2 porque se
  sembraron con el valor por defecto, así que los filtros de dificultad de
  «Exámenes en papel» no filtran nada. Antes de dejar que un modelo clasifique
  el banco entero se le hace clasificar la muestra de 150 hecha a mano y se
  compara. El criterio (`CRITERIO_ACUERDO` en `app/lib/dificultad.ts`: ≥ 60 %
  exacto, ≤ 5 % a dos niveles, sesgo ≤ ±0,3) está puesto ANTES de ver el
  resultado: si se ajusta a lo que salga, no mide nada. El sesgo cuenta porque
  un 70 % de acuerdo puede esconder que siempre se equivoca hacia el mismo lado.
- **`null` no es 2 (regla 16).** Lo que el modelo no contesta, o contesta dos
  veces, o fuera de 1-3, queda `null` y no se escribe. Rellenarlo con el valor
  por defecto es justo cómo se llegó a las 4.617 preguntas iguales.
- **De quién es cada valor.** `difficulty_source`: `NULL` (el 2 de la siembra),
  `estimada`, `preparador`, `medida`. Una reclasificación solo toca `NULL` y
  `estimada`; lo que puso una persona o salió de respuestas reales manda sobre
  la estimación. Por eso el script se niega a escribir sin esa columna.
- **Dos llaves para escribir.** `--hazlo` y haber pasado la muestra
  (`--muestra-ok`); en Actions, además, escribir CLASIFICAR. El modo muestra
  no escribe nunca. Todo vigilado en `tests/operacion.test.ts`.

### 122 · La dificultad se enseña después de contestar, la corrige quien la sabe y la manda la medida

*(12 nov 2026. Con las 4.617 preguntas ya clasificadas por la IA, regla 121.)*

- **Después, nunca antes.** El alumno ve «Fácil / Media / Difícil» en la
  corrección (`Dificultad` en `ui/`, en el resultado del simulacro y en el
  feedback del entrenamiento), pero NO sobre la pregunta sin contestar: una
  «difícil» se contesta con más miedo y sesga la respuesta que se quiere medir.
  Guardado por `afianzar.test.ts`, que acota el test al bloque de corrección.
  Un nivel que no es 1, 2 o 3 no pinta nada: ni un «Media» inventado ni un hueco.
- **El preparador la corrige desde «Banco oficial».** Selector de dificultad en
  el editor, filtro por nivel en la lista, y el origen a la vista («Estimada por
  la IA», «Puesta por un preparador»). El nivel solo viaja si lo ha cambiado:
  guardar el texto de una pregunta no puede convertir en «puesta por un
  preparador» lo que era una estimación. Lo que pone una persona se anota
  como `preparador` y ni la IA ni la medida lo pisan. Sin origen se enseña
  «Sin clasificar», no «Media»: es el 2 de la siembra, nadie lo decidió.
- **Preguntas repetidas (solo superadmin).** «Banco oficial» → «Preguntas
  repetidas»: cada familia (regla 119) con sus preguntas, y «Quedarme con
  esta» descarta el resto (`disabled`, no se borra, queda en el registro de
  acciones). Solo el superadmin: el banco global no es de un admin de academia
  (75). Una familia con una sola activa ya está resuelta y no vuelve a salir.
  La acción comprueba que la pregunta que se conserva sea de ESA familia y
  esté activa: sin eso, un id equivocado descartaría todas. **No es
  permanente contra `npm run familias -- --hazlo`:** las descartadas siguen
  siendo `disabled`, pero una pregunta que alguien separe a mano no existe aún.
- **La medida manda sobre la estimación, no sobre la persona** (`npm run
  dificultad:medida`, `app/lib/dificultad-medida.ts`). Con 30 respuestas o más
  de una pregunta, el acierto observado fija el nivel (≥ 75 % fácil, < 50 %
  difícil) y `global_success_rate`. Tres cosas la hacen honesta: (1) las cuentas
  de demostración no cuentan — hoy son **9.859 de las 9.911 respuestas**; medir
  con ellas sería medir datos inventados; (2) una sola respuesta por alumno y
  pregunta, la primera: una pregunta repasada cinco veces no son cinco
  alumnos que la saben; (3) un blanco no es un fallo (24). Si la medida
  discrepa de un preparador, se enseña como conflicto y NO se escribe.
  Hoy ninguna pregunta llega a 30 respuestas reales (máximo 25, de
  demostración), así que es infraestructura lista para cuando haya actividad
  y exámenes en clase.

### 123 · Esta instalación es de UNA academia: el admin de Alphapol puede tocar el banco global

*(12 nov 2026. Alphapol será la única academia que use la plataforma.)*

- **El problema.** La regla 75 decía: un admin de academia solo toca el banco
  PRIVADO de su academia; el global es del superadmin. Con varias academias en
  la misma plataforma era lo correcto. Con una sola, las 4.617 preguntas son
  globales y **ningún preparador podía corregir una dificultad, descartar una
  repetida ni atender el reporte de un alumno**: solo el superadmin, que no
  administra la academia (no ve Alumnos, Pagos ni Calendario).
- **El interruptor.** `UNA_SOLA_ACADEMIA = true` en `app/lib/permisos-banco.ts`.
  Con él, el admin edita, descarta y reactiva también el banco global
  (`puedeEditarBanco`, `filtroEscrituraBanco`), ve «Preguntas repetidas» y
  recibe los reportes de los alumnos sobre preguntas globales. Con `false`
  vuelve la regla 75 tal cual. El filtro va DENTRO de cada consulta (65): una
  fila que no es suya no cambia. El banco de OTRA academia no lo toca nadie
  salvo el superadmin, con o sin interruptor. Vigilado en
  `tests/permisos-banco.test.ts`, que compara el filtro del servidor con la
  función del panel para que no discrepen.
- **Lo que el interruptor NO abre:** generar con IA, ver el consumo, crear
  academias y **crear admins** (`requireSuperadmin`: solo tú das de alta al dueño
  y a quien deba entrar al panel), ni «Vaciar banco», que sigue acotado al
  banco privado de cada uno: con el global sería una pulsación para vaciar la
  plataforma.
- **«Reactivar».** Descartar ya se podía y deshacerlo era cosa de la base de
  datos. `reactivateQuestion` devuelve una descartada al banco; solo sobre
  `disabled`, para no convertir en activa una candidata sin revisar. Queda en
  «Logs» quién descartó y quién reactivó.
- **La portada del superadmin** pasa de «Academias» a «Banco oficial».
  «Academias» sigue ahí porque «Añadir admin» es como se crean las cuentas de
  quien dirige la academia.
- **Lo que NO existe: un rol de «preparador».** Los roles son `student`, `admin`
  y `superadmin`. Un profesor dado de alta en «Profesores» es una ficha (nombre,
  contacto, grupos), no una cuenta; vincularle una cuenta no le da permisos. Un
  preparador que necesite entrar al panel tiene que ser `admin` y **ve todo**:
  Alumnos, Pagos, Informe… Si el dueño no quiere que vean Pagos, hace falta un
  rol intermedio; no está construido.

### 124 · Los exámenes en clase: un nombre que se pone solo, un examen que no se repite sin avisar, y notas que se pegan

*(13 nov 2026. Salió de probar la pantalla con la academia en la mano.)*

- **«Cómo lo llamas» sobraba.** Al poner un examen a un turno ya se marcan los
  grupos, así que pedir un nombre aparte era escribir lo mismo dos veces. Ahora
  el nombre es opcional y, vacío, se pone solo: «Promo 44 · Alpha, Kappa · 13
  nov» (`nombreDeAplicacion`). El nombre del grupo y el día ya no se repiten en
  el encabezado: solo se enseña el nombre si se escribió a mano.
- **El mismo examen al mismo grupo dos veces duplicaba a los alumnos** (lo veían
  dos veces y sus notas contaban dos veces) y nada lo impedía. Ahora el
  formulario marca los grupos «Ya puesto el 11 nov», y el servidor se niega
  mientras no se confirme con «Ponerlo otra vez de todos modos»
  (`aplicacionesQueSeSolapan`). «Toda la academia» coincide con cualquier grupo.
  Si se repite a sabiendas, queda anotado en el registro.
- **La pantalla «En clase» tiene cuatro pestañas** (Notas, Resumen, Preguntas,
  Ajustes) en vez de una página de siete pantallas. «Notas» es una fila por
  alumno (nombre, calculada, oficial y «No vino»); «Que repita» queda bajo el
  nombre del que ha entregado. El nombre manda: se parte en dos líneas antes
  que cortarse. «Aplicación» era jerga del código y se fue de las pantallas:
  ahora son «Exámenes puestos a un turno».
- **«Pegar notas»** (`leeNotasPegadas` + `setResultadosProfesor`): se pega una
  columna del Excel o del chat («Álvarez Gil;7,5», «Beltrán 5», «Domínguez;no
  vino»). Casa por apellido sin mirar acentos, mayúsculas ni orden: todas las
  palabras escritas tienen que estar en el nombre del alumno. **Nunca adivina**:
  si encajan dos alumnos o ninguno, o la nota no es de 0 a 10, esa línea no se
  guarda y se dice cuál. Se ve lo reconocido ANTES de guardar. El guardado es
  todo o nada y de esta academia (regla 65): si un id no es del examen, no se
  escribe ninguno. Quien trae nota estuvo; a quien no vino se le quita la nota
  oficial. No toca lo que entregó el alumno.
- **La calculadora de nota del alumno** (`calculaNota`, en «Exámenes»): aciertos
  y fallos → nota. Herramienta suelta, no guarda nada. **No** se deja que el
  alumno escriba directamente su nota: un número no lo puede comprobar nadie
  (regla 110), y sin sus respuestas se pierde qué preguntas falla cada uno, que
  es lo que da valor a que las metan ellos. La fórmula sale de `scoreExam`
  (regla 22), no se reescribe: 4 aciertos y 11 fallos de 15 da 0, y la
  penalización que enseña la plataforma anterior (−3,67 PTS) son puntos sobre
  10, no aciertos.
- **El «Resumen» de un examen puesto** enseña, de un vistazo: la nota más alta y
  la más baja (con el nombre), cuántos aprueban (el mínimo sale de la convocatoria,
  `CNP_SCORING.passMark`, no de un número a mano), **a quién mirar** (los que están
  por debajo, de la peor nota a la mejor) y cómo ha cambiado la media respecto al
  examen anterior de ese mismo grupo. Cuenta la nota vigente (la del papel manda).
  Quien no vino no cuenta ni como suspenso. Sin ninguna nota no hay resumen de
  ceros: un aviso que dice qué saldrá (regla 16). El «examen anterior» es el más
  reciente, de fecha anterior, que coincida en algún grupo (`aplicacionesQueSeSolapan`),
  de esta academia; si falla leerlo, la pantalla sigue sin comparación.

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

Estado tras esta sesión: build ✅, typecheck ✅, 35 tests ✅ (ver `docs/PLAN-DE-TRABAJO.md`).

**Los tres asuntos que hay que mirar antes que nada:**

1. **No hay autenticación real en el servidor.** Todas las Server Actions reciben el
   `userId` como argumento desde el cliente y ninguna verifica una sesión. Como además
   usan la clave de servicio de Supabase (que salta RLS), cualquiera puede leer y
   escribir datos de cualquier usuario. §1.
2. **El banco de preguntas nunca llega a los alumnos.** Todo lo generado se guarda con
   `status: 'candidate'` y los alumnos solo leen `status: 'active'`. Cada test se genera
   en vivo con IA: lento y caro. §2.1.
3. **El panel de estadísticas casi con seguridad revienta en blanco** por leer una
   columna que no existe. §2.2.

---

## 1. Seguridad

> Estos hallazgos son de lectura estática. Antes de dar ninguno por resuelto conviene
> reproducirlos contra el proyecto real de Supabase.

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

### 1.3 · MEDIO — Datos personales sensibles enviados a Gemini sin filtrar

`processInterviewTurn` serializa la biodata **completa** en el prompt, en cada turno de la
entrevista (`app/actions/interview.ts:363`). Esa biodata incluye antecedentes familiares,
miedos y un campo explícito de `legal_issues`. Conviene decidir de forma consciente qué
campos salen del sistema, y reflejarlo en la política de privacidad.

### 1.4 · MEDIO — Sin límite de frecuencia en ninguna ruta de IA

Cinco acciones distintas llaman a Gemini sin ningún control de cuota por usuario.
Combinado con §1.1, la factura la marca cualquiera.

### 1.5 · BAJO — Mensajes de error crudos hacia el cliente

`getOfficialSyllabus` devuelve `e.message` "para debug" (comentario incluido), lo que
filtra estructura interna de la base de datos.

---

## 2. Fallos funcionales

### 2.1 · CRÍTICO — El banco de preguntas nunca se sirve

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

El comentario del código dice lo contrario de lo que hace: *"En seed masivo, asumimos
activas"* justo encima de `status: 'candidate'`.

### 2.2 · CRÍTICO — El panel de estadísticas revienta

```tsx
// StatsPanel.tsx:460
<p ...>{item.question_text.replace('[FLASHCARD] ', '')}</p>
```

`item` es una fila de `test_results`, y nada en el código escribe `question_text` en esa
tabla (se insertan `user_id`, `question_id`, `subject_id`, `is_correct`, `created_at`,
`response_time_ms`, `option_changes`, `error_type`). En cuanto el usuario tenga un solo
resultado guardado, `undefined.replace(...)` lanza y la pestaña se queda en blanco.
`item.topic` (línea 462) tampoco existe.

### 2.3 · ALTO — Las métricas de comportamiento se pierden en modo examen

`ExamManager.handleFinish` construye el payload con unas claves y `saveExamResults` lee
otras distintas:

| Envía la UI | Lee el servidor | Resultado |
|---|---|---|
| `response_time_ms` | `r.time` | siempre `0` |
| `option_changes` | `r.changes` | siempre `0` |

Todo el apartado "Atenea Mind" (índice de incertidumbre, perfil cronométrico) se alimenta
de columnas que en modo examen siempre valen cero.

### 2.4 · ALTO — Modo práctica: dos filas por cada fallo

En `ActiveTest`, al fallar se llama a `saveTestResult` en `handleAnswer` y **otra vez** en
`handleErrorTag` al etiquetar el error. Ambas hacen `INSERT`. Cada fallo cuenta doble y el
`winRate` queda sesgado hacia abajo de forma permanente.

### 2.5 · ALTO — La dificultad elegida no hace nada

`ExamConfig` deja elegir Básica/Estándar/Extrema, `ExamManager` la traduce a un número y
la pasa a `getQuestionsFromBank`… que nunca la usó. Era, de hecho, uno de los 7 errores de
compilación. El prompt de generación tiene la dificultad **fija** en "Media/Alta"
(`exams.ts:41`).

### 2.6 · ALTO — Fragmentos vacíos al indexar PDFs

El troceado de `uploadTopicPDF` hace `push(currentChunk)` **antes** de acumular nada. Si el
documento empieza con un párrafo de más de 1000 caracteres —lo normal en un texto legal—
el primer fragmento es la cadena vacía, `embedContent('')` falla, y el documento queda
indexado a medias sin avisar al administrador. Cubierto por
`tests/text.test.ts` (*"genera un primer fragmento VACIO"*).

Relacionado: el algoritmo nunca parte un párrafo, así que un artículo largo produce un
fragmento único gigantesco; y el solapamiento se toma del fragmento *ya solapado*, de modo
que los tamaños crecen por encima del máximo. Ambos con test.

### 2.7 · MEDIO — Perfil físico: nombres de campo que no casan

`StatsPanel` lee `physProfile.baseline_test.pullups`, pero `savePhysicalProfile` y
`generateWeeklyPlan` escriben y leen `baseline_metrics.pullups_score`. El KPI "Dominadas
Máximas" muestra siempre `0`. La barra de progreso de esa tarjeta está además cableada al
`65%`.

### 2.8 · MEDIO — Fuga de AudioContext en el cronómetro

`TacticalTimer.playBeep` crea un `new AudioContext()` en cada llamada y no lo cierra nunca.
Durante los últimos 10 segundos de una cuenta atrás se llama una vez por segundo: los
navegadores limitan los contextos simultáneos por documento, así que los pitidos se
apagan (y en algunos motores lanza).

Además, `speak()`, `playBeep()` y `onFinish()` se ejecutan **dentro del actualizador de
`setTime`**, que debe ser una función pura. En StrictMode se ejecuta dos veces: pitidos y
voz duplicados. `playBeep('milestone')` está en el tipo pero no tiene rama: no suena.

### 2.9 · MEDIO — Mutación directa del estado en `ActiveTest`

```tsx
const updated = [...localQuestions];
updated[currentIndex].userAnswer = optionId;   // copia superficial: muta el objeto original
```

La copia es superficial, así que se mutan los mismos objetos que están en el array
`questions` del padre. ESLint lo marca (`react-hooks/immutability`). Mismo patrón en
`handleErrorTag` y `handleNext`.

En la misma función, `saveTestResult` envía `optionChanges` justo después de
`setOptionChanges(prev => prev + 1)`: por el cierre obsoleto siempre guarda el valor
anterior.

### 2.10 · MEDIO — Preguntas duplicadas llegan con `id: null`

Cuando el `upsert` por `question_hash` choca, `generateAndSaveCandidate` devuelve
`{ ...qData, id: null, status: 'unsaved' }`. Esa pregunta se muestra igual, pero no se
puede votar ni reportar, y se guarda en `test_results` con `question_id` null. Cubierto en
`tests/questions.test.ts`.

### 2.11 · MEDIO — El log de entrenamiento no se persiste

`completeTrainingDay` recibía `logData` y lo ignoraba por completo: solo marcaba
`isCompleted`. Las series, repeticiones y sensaciones que introduce el usuario se pierden al
recargar. *(La firma ya está corregida y documentada; falta la tabla de destino.)*

### 2.12 · MEDIO — Variedad nula en las flashcards

`generateFlashcard` siempre toma `full_text.substring(0, 2500)` — los mismos 2500 primeros
caracteres, sin desplazamiento aleatorio (a diferencia de `generateTestQuestion`, que sí lo
hace). Repasar un tema produce tarjetas casi idénticas una y otra vez. Tampoco hay hash de
deduplicación como en las preguntas.

### 2.13 · MEDIO — El chat RAG no tiene memoria

`askAtenea(query)` recibe solo la consulta actual. La UI mantiene el historial en pantalla
pero nunca lo envía, así que no se puede preguntar "¿y en ese caso, qué plazo aplica?".
Tampoco se persiste ninguna conversación.

### 2.14 · BAJO — Varios

- `AdminUsers` pinta `u.total_tests` y `u.win_rate`, que no están en `profiles`
  (`select('*')`): las columnas "Tests" y "Efectividad" salen siempre a `0`.
- `ExamResults` dividía entre `questions.length` sin protección → `NaN%` con 0 preguntas.
  *(Corregido vía `scoreExam`, con test.)*
- `cleanLegalText` contenía `.replace(/[]/g, '')`. Una clase de caracteres **vacía** en JS
  no casa con nada: la línea nunca hizo nada. Con test que lo documenta.
- El índice de incertidumbre divide los cambios de las **5** últimas preguntas entre el
  total de hasta **100**: el número no significa lo que dice significar.
- `PROGRESO AL ASCENSO` calcula `winRate / (min + 20)`; en rango Inspector (min 90) el
  denominador es 110 y nunca llega al 100%.
- `indexToOptionId` (antes un ternario en línea) colapsa **cualquier** índice fuera de
  rango en `'c'`. Si la IA devuelve `correctIndex: 3`, la respuesta buena pasa a ser "c" en
  silencio. Con test.
- El troceado del `sort(() => Math.random() - 0.5)` es un barajado sesgado; conviene
  Fisher-Yates.

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

- `app/components/student/shared/VipButton.tsx` y `VipCard.tsx` están **vacíos** (0 bytes)
  y nadie los importa.
- Cinco acciones exportadas sin ningún consumidor: `deleteTopic`, `generateTestQuestion`,
  `getPsychProfile`, `getTopicsList`, `saveFlashcardResult`. Ojo con la última: existe la
  tabla de analítica `flashcard_results` y **nunca se escribe en ella**.
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
| 1.2 / 1.3 · Clave de servicio y RLS | pendiente |
| 1.5 / 1.6 · Cuotas y datos a Gemini | parcial (tope de seed puesto) |
| 2 – 5 | pendiente |

Los hallazgos de §1.1, §1.2 y §1.5 quedan cerrados en código; **falta verificarlos contra el
proyecto real de Supabase**. Ningún fallo funcional de §2 se ha tocado todavía.

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

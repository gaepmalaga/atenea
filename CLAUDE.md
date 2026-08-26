# Atenea Policial — guía para trabajar en este repo

Plataforma de preparación de oposiciones a Policía Nacional (CNP).
Next.js 16 (App Router) · React 19 · Supabase · Google Gemini · Tailwind 4.

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
| 2.4 | Un resultado por respuesta | ✅ cerrada (falta reparar el histórico) |
| **2.6** | **Indexado de PDFs** | ✅ **cerrada** |
| **1.3** | **Activar RLS** | ⬜ **SQL listo para ejecutar** |
| 1.2 | Acotar la clave de servicio | ⬜ va DESPUÉS de la 1.3 |
| 1.5 / 1.6 | Cuota por usuario en IA · qué se manda a Gemini | ⬜ parcial |
| 2.5, 2.7, 3 – 5 | Dificultad, perfil físico, IA, pedagogía, higiene | ⬜ |

### Dos cosas que solo puedes hacer tú (necesitan la consola de Supabase)

1. **Activar RLS** — [`docs/sql/1.3-activar-rls.sql`](docs/sql/1.3-activar-rls.sql).
   Hoy cualquiera con la clave pública puede volcar `question_bank` **con las respuestas
   correctas**, y leer los datos personales de los alumnos.
   **Es seguro ejecutarlo ya:** todas las consultas de la app van con la clave de servicio,
   que salta RLS, así que activarla no puede romper nada.
2. **Reparar los duplicados de la fase 2.4** —
   [`docs/sql/2.4-duplicados-test-results.sql`](docs/sql/2.4-duplicados-test-results.sql).
   Hunden el porcentaje de acierto de los alumnos. Va por pasos y con copia de seguridad.

**Sin verificar contra el Supabase real:** las fases 1.1, 2.1, 2.2, 2.3 y 2.4 están cerradas
en código y cubiertas por tests estáticos, pero nadie las ha probado todavía con
credenciales de verdad. Puntos de riesgo, por orden: el login (la sesión pasó de
`localStorage` a cookies), el estado de las preguntas sembradas, y el join de
`getUserStats` (necesita que las FK de `test_results` estén declaradas en la BD;
si no lo están hay un respaldo que degrada a consulta plana y lo deja en el log).

---

## Comandos

```bash
npm ci
cp .env.example .env.local     # las 4 variables son obligatorias: la app no arranca sin ellas
npm run dev

npm run check                  # typecheck + tests — pásalo ANTES de cada commit
npm run build                  # necesita las variables de entorno definidas
npm run lint                   # ~130 errores heredados, fase 5. No es puerta de calidad todavía.
```

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

`test_results` guarda `question_id`, no el enunciado. La UI pintaba
`item.question_text.replace(...)` y reventaba con un solo resultado guardado —
en **dos** módulos, incluido el de inicio. Los enunciados y el nombre del tema se
traen por **join** (`getUserStats`), no desnormalizados: sin migración y sin
copias que se queden obsoletas si un admin edita la pregunta.

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

### 7 · Una fila de `test_results` por respuesta

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

### 10 · La lógica pura vive en `app/lib/`, no dentro de las acciones

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
tests/render-safety.test.ts     lecturas sin proteger y aislamiento de módulos
tests/exam-results.test.ts      contrato de resultados cliente↔servidor
tests/single-result.test.ts     una fila por respuesta, sin doble inserción
```

**Dos convenciones importantes:**

1. **Los tests marcados `BUG:` describen el comportamiento *actual*, no el
   deseado.** Al corregir ese fallo, el test **debe** fallar: se invierte la
   aserción y se le quita el prefijo. Es el aviso de que el arreglo surtió efecto.
   En `text.test.ts` ya se invirtieron los tres del troceado (fase 2.6); quedan los de
   `cleanAIResponse` (fase 3) y `srs.test.ts` (fase 4).

2. **Los tests estáticos leen el código fuente** y fallan si vuelve un patrón
   peligroso. No necesitan Supabase. Si añades uno, recuerda quitar los
   comentarios antes de analizar (`stripComments`): un comentario que *cita* el
   patrón para explicarlo cuenta como si fuera código — pasó y costó un rato.

Cuando toques algo cubierto por un test estático, compruébalo **rompiéndolo a
propósito** y viendo que el test lo señala. Un guardián que no muerde no sirve.

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
- **Los `any` que quedan** son la razón por la que los desajustes de nombres de
  campo llegaron a producción sin que nadie se enterara. Al tocar un módulo, tipa
  lo que toques: al tipar `StatsPanel` el compilador señaló solo las lecturas
  nulas que causaban el crash.
- **El orden de la fase 1 está invertido respecto al plan.** La 1.3 (activar RLS)
  va antes que la 1.2 (acotar la clave de servicio), por lo explicado arriba.
- **`getUserStats` hace un join que puede no resolver.** PostgREST necesita que
  las FK estén declaradas. Hay un respaldo que degrada a consulta plana y lo
  registra en el log; al versionar el esquema (fase 1.3), confirma las FK y
  quita el respaldo.
- **Los comentarios del código mienten a veces.** El del seed decía "asumimos
  activas" justo encima de `status: 'candidate'`. Fíate del código, no del
  comentario, y corrige el comentario cuando lo veas.

---

## Cómo continuar

1. **Probar 1.1, 2.1, 2.2 y 2.3 contra el Supabase real.** Entrar como alumno y
   como admin; sembrar un tema y comprobar que las preguntas llegan a un test;
   hacer un simulacro y mirar que `test_results` guarda `response_time_ms` y
   `option_changes` distintos de 0, y que Inicio y Estadísticas cargan. Fallar
   una pregunta en entrenamiento y etiquetar el error debe dejar **una** fila.
2. **`supabase db pull`** para versionar el esquema.
3. **Fase 1.2** (acotar la clave de servicio) — pero **solo después** de ejecutar
   el SQL de la 1.3. Mover consultas al cliente del usuario sin RLS puesta las
   dejaría sin ninguna protección; con RLS ya activa, cada consulta que se mueva
   queda cubierta desde el primer momento.

Al cerrar una fase: actualiza la tabla de estado de este fichero, marca la fase
en `docs/PLAN-DE-TRABAJO.md` y el hallazgo en `docs/AUDITORIA.md`.

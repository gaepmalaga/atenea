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

### 1.2 Reducir el uso de la clave de servicio

`supabaseAdmin` salta RLS. Debe quedar reservado a lo que de verdad lo necesita
(indexado de PDFs, seed masivo). El resto pasa a un cliente con el token del usuario, para
que RLS actúe como segunda barrera.

### 1.3 Activar y documentar RLS

- Escribir las políticas de `profiles`, `test_results`, `flashcard_progress`,
  `flashcard_results`, `profiles_biodata`, `profiles_psych`, `profiles_physical`,
  `training_plans`, `question_votes`, `question_reports`.
- Volcarlas al repositorio en `supabase/migrations/` (hoy el esquema **solo existe dentro
  del proyecto de Supabase**: si se pierde, se pierde entero).

### 1.4 Cerrar la asignación masiva §1.2 ✅ HECHA

Hecha junto con 1.1: lista blanca de campos (`BIODATA_FIELDS`, `PHYSICAL_FIELDS`) en vez de
`{ user_id, ...formData }`. Nunca expandir un objeto del cliente sobre una fila.

### 1.5 Límite de frecuencia en las rutas de IA

Cuota por usuario y día sobre `askAtenea`, `generateAndSaveCandidate`, `generateFlashcard`,
`processInterviewTurn`, `generateWeeklyPlan`. El tope de `count` en `seedQuestionBank` ya
está puesto (200), pero **falta la cuota por usuario**: hoy un alumno autenticado sigue
pudiendo llamar en bucle.

### 1.6 Decidir qué se manda a Gemini §1.3

Elegir explícitamente qué campos de la biodata viajan en el prompt de la entrevista. Hoy va
todo, incluido `legal_issues`.

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
      nombres de campo sigue siendo la fase 2.7.
- [x] 22 tests nuevos (17 de aritmética + 5 estáticos de render), verificados reintroduciendo
      los fallos a propósito.

**Pendiente de verificar contra el proyecto real:** hacer un test y comprobar que Inicio y
Estadísticas cargan con datos reales; si el join no resuelve, saldrá el aviso en el log.

### 2.3 Recuperar las métricas de comportamiento §2.3

Unificar los nombres de campo entre `ExamManager.handleFinish` y `saveExamResults`
(`response_time_ms` / `option_changes`). **Definir un tipo compartido en `app/lib/` para el
payload y usarlo en ambos lados**: si el tipo hubiera existido, el desajuste no habría
llegado a producción.

### 2.4 Un resultado por respuesta §2.4

`saveTestResult` debe hacer `upsert` sobre `(user_id, question_id, session_id)` en vez de
`insert`, para que etiquetar el error actualice la fila en lugar de crear otra. Requiere
introducir un identificador de sesión de test, que hoy no existe.

> Ojo: hay datos históricos ya duplicados. Contar cuántos antes de tocar nada, y decidir si
> se limpian o se marcan.

### 2.5 Que la dificultad sirva de algo §2.5

1. Añadir columna `difficulty` a `question_bank`.
2. Que el prompt de generación reciba la dificultad (hoy está fija en "Media/Alta").
3. Aplicar el filtro en `getQuestionsFromBank` y **quitar el comentario "PENDIENTE"** que
   dejé en la firma.

Alternativa honesta si esto se pospone: ocultar el selector en la UI. Un control que no
hace nada es peor que no tenerlo.

### 2.6 Indexado de PDFs §2.6

Reescribir `chunkLegalText` para: no emitir nunca fragmentos vacíos, partir párrafos que
excedan el máximo, y calcular el solape sobre el texto original y no sobre el fragmento ya
solapado. **Los tres tests `BUG:` de `tests/text.test.ts` deben invertirse aquí.**

Además: `uploadTopicPDF` debe informar al admin de cuántos fragmentos fallaron, no
tragárselo en `console.error`.

### 2.7 Perfil físico §2.7

Unificar `baseline_test.pullups` vs `baseline_metrics.pullups_score`. Elegir uno, migrar
los datos existentes y tipar la estructura del perfil.

---

## Fase 3 — Calidad de la IA

El corazón del producto. Merece una fase propia.

- **Memoria en el chat §2.13.** Pasar el historial a `askAtenea` y persistir las
  conversaciones. Sin esto no se puede repreguntar.
- **Variedad en las flashcards §2.12.** Desplazamiento aleatorio en el texto fuente (como
  ya hace `generateTestQuestion`) y hash de deduplicación.
- **Validar la salida del modelo.** `cleanAIResponse` es un apaño de regex que corrompe el
  contenido en los casos límite (dos tests lo demuestran). Sustituir por salida
  estructurada / JSON mode, y validar el resultado con un esquema antes de guardarlo.
- **Verificar `correctIndex`.** Hoy cualquier índice fuera de rango se convierte en `'c'` en
  silencio (test en `questions.test.ts`). Debe rechazarse la pregunta.
- **Repasar los modelos.** `core.ts` usa el mismo modelo para `chatModel` y `smartModel`;
  el comentario sobre embeddings admite dudas sobre cuál funciona. Medir y decidir.
- **Coste.** Instrumentar el gasto por módulo antes de optimizar nada.

---

## Fase 4 — Pedagogía y datos

Ahora que los datos son fiables, que sirvan para algo.

- **Repetición espaciada de verdad §SRS.** Los tests de `srs.test.ts` documentan que
  "Duda" y "Bien" son indistinguibles desde la caja 1 y que "Duda" nunca mueve de caja.
  Evaluar pasar a SM-2 / FSRS.
- **Analítica de flashcards.** `saveFlashcardResult` existe, la tabla `flashcard_results`
  existe, y nadie la llama nunca. Conectarla o borrarla.
- **Persistir el log de entrenamiento §2.11.** Crear la tabla y guardar `logData`; quitar el
  "PENDIENTE" de `completeTrainingDay`.
- **Semana 2 del plan físico.** `handleGenerateNextWeek` es hoy un `alert()`.
- **Evaluación de la entrevista.** No se guarda ninguna transcripción ni se genera informe
  final. Es el módulo con más potencial y menos cerrado.
- **Arreglar la estadística que miente.** Índice de incertidumbre (muestras distintas en
  numerador y denominador), "progreso al ascenso" (nunca llega al 100%), barra del 65%
  cableada, columnas de `AdminUsers` siempre a cero.

---

## Fase 5 — Higiene

Baja urgencia, alto efecto compuesto. Se puede ir haciendo en paralelo.

- **Los 126 `any`.** No es cosmética: son la razón de que §2.3 y §2.7 pasaran inadvertidos.
  Empezar por tipar las filas de la base de datos (`supabase gen types typescript`).
- Las 41 variables sin usar y los 12 `react/no-unescaped-entities`.
- Las 11 dependencias de efectos incompletas y las 4 mutaciones de estado §2.9.
- Fuga de `AudioContext` y efectos secundarios dentro del actualizador de estado §2.8.
- Borrar `VipButton.tsx` / `VipCard.tsx` (vacíos y huérfanos) y las acciones muertas.
- Sustituir los `alert()` / `confirm()` por componentes de UI propios.
- Reescribir el `README.md` (sigue siendo el de `create-next-app`).
- CI en GitHub Actions: `typecheck` + `lint` + `test` en cada push.
- Fisher-Yates en lugar de `sort(() => Math.random() - 0.5)`.

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

1. **Probar 1.1, 2.1 y 2.2 contra el Supabase real.** Entrar como alumno y como admin;
   sembrar un tema y comprobar que las preguntas llegan a un test; hacer un test y mirar
   que Inicio y Estadísticas cargan. Si algo falla, lo más probable es el login (la sesión
   pasó de `localStorage` a cookies).
2. **Sacar el esquema a `supabase/migrations/`** (`supabase db pull`). Hoy solo vive dentro
   del proyecto de Supabase. Es el activo con más riesgo de pérdida y no cuesta nada.
3. **Fases 1.2 y 1.3** (acotar la clave de servicio y activar RLS) para cerrar seguridad,
   o **2.3** (métricas de comportamiento) si se prefiere seguir en funcional: hoy el tiempo
   y los cambios de opción se pierden en modo examen, y el panel ya está preparado para
   mostrarlos en cuanto lleguen de verdad.

> El estado vivo del proyecto está en [`CLAUDE.md`](../CLAUDE.md), en la raíz. Al cerrar una
> fase, actualiza los dos.

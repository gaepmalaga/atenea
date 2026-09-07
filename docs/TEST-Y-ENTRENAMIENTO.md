# El test y sus dos modos — planteamiento definitivo

> Cerrado el 7 de septiembre de 2026 con el dueño, tras dos vueltas en las que
> el módulo se había llenado de fricción (marca de confianza + diagnóstico
> obligatorio en cada pregunta). Esto es lo que va a haber. Si algo de aquí se
> reabre, que sea con un motivo escrito, no por deriva.

---

## La idea en una frase

**Dos modos, y solo dos.** El **entrenamiento** te da lo que necesitas aprender
y no puntúa. El **simulacro** te mide y es fiel al examen real. La inteligencia
va toda en el entrenamiento; el simulacro no adapta nada.

---

## Lo que comparten

- El mismo banco de preguntas.
- La misma pantalla de pregunta.
- Por cada respuesta se guarda una fila en `question_attempts` con: acierto,
  **opción elegida**, **tiempo total**, **cambios de opción**, y (nuevo)
  **tiempo hasta el primer toque**. De ahí sale toda la inteligencia, **sin
  preguntarle nada al alumno**.

**La regla que manda (CLAUDE.md regla 56):** se deduce todo lo que se pueda
deducir; se pregunta solo lo que no se puede deducir **y** además cambia lo que
el sistema va a hacer; y nunca bloquea.

---

## ENTRENAMIENTO — para aprender

### Qué elige el alumno

| Ajuste | Opciones | Notas |
|---|---|---|
| **Alcance** | Un tema · Varios (por **bloques** del temario) · Todo | «Varios» agrupa por bloques (Bloque I Jurídicas, II Sociales…), no 45 casillas sueltas |
| **Nº de preguntas** | Un número, **con el que propone el sistema ya puesto** | «Hoy te tocan 18»: el sistema sabe cuántas tienes vencidas. Se puede subir o bajar |
| Dificultad | — | **No se elige.** La calibra el método para que aciertes ~85 % (la regla del 85 %, donde más se aprende) |

### Qué preguntas te da — nunca al azar

`buildSmartSession` (ya existe). Reparte por cajones, en este orden de prioridad:

1. **Recaídas** — lo que fallaste y toca repasar. Siempre, y primero.
2. **Repaso vencido** — lo medio aprendido cuyo intervalo ha vencido.
3. **Consolidación** — lo que casi dominas.
4. **Nuevo** — con **tope que escala**: ~60 % si has visto poco del banco,
   ~22 % si ya has visto mucho. Inundar de nuevo hunde el acierto y dejas de
   aprender.
5. **Atascadas** — **máximo 2 por sesión**. Repetirlas más no funciona: se avisa
   de que releas el artículo.

Y **entrelaza los temas** (mezclado se retiene más que en bloque), salvo un tema
que estrenas: ese va **en bloque al principio** y luego a la mezcla.

### La pantalla

Contestas → ves **al momento** si está bien, la explicación y el artículo →
**SIGUIENTE**. Un solo toque por pregunta.

- Sin reloj (correr no aporta cuando la pregunta se corrige al momento).
- Sin volver atrás (volver a una ya corregida es mirar la respuesta).
- Sin blancos (dejar en blanco no significa nada aquí).

### Lo único que se te pregunta, y casi nunca

Si fallas una pregunta que **ya tenías aprendida o que se te atraganta**
(`mereceLaPenaPreguntar`: cajones `consolidando` / `dominada` / `atascada`),
aparecen **tres botones** para corregir el diagnóstico deducido: «fue un
despiste» / «me lió la pregunta» / «no la sabía». **Un toque, saltable** —
«SIGUIENTE» está disponible desde el primer momento.

Solo ahí, porque solo ahí acertar el motivo cambia cuándo vuelve la pregunta: un
despiste no debe mandarla a la caja 1 y traerla mañana. **Fallar material nuevo
no pregunta nada** — es lo normal.

### Al terminar: NO hay nota

Hoy sale la nota del BOE sobre 5 preguntas, que no significa nada y desanima. En
su lugar, el balance de lo aprendido:

> **3 consolidadas · 2 vuelven mañana · 4 nuevas incorporadas**
> _Próxima sesión: 14 preguntas, el jueves._

---

## SIMULACRO — para medir

### Qué elige el alumno

| Ajuste | Opciones |
|---|---|
| **Alcance** | Un tema · Varios (bloques) · Todo |
| **Nº de preguntas** | **25 · 50 · 100** (presets, no número libre) |
| **Dificultad** | Básica · Estándar · Extrema — **aquí SÍ**: tú decides cómo de duro quieres el ensayo |

Presets y no número libre para que **dos simulacros sean comparables**. El de 100
es el de verdad.

### Qué preguntas te da — no adapta, pero tampoco es aleatorio

El `shuffle(banco).slice(100)` de hoy puede darte 40 preguntas del mismo
artículo, repetirte lo de ayer, o salir facilísimo un día y durísimo al
siguiente. Entonces comparar dos notas no significa nada. El simulacro es
**representativo**:

- **Reparto por temas** proporcional a la convocatoria (no al azar).
- **No repite** lo que has visto en los últimos N días (si no, la nota va
  inflada por memoria reciente).
- **Misma mezcla de dificultad siempre** → dos simulacros comparables.
- **Cobertura por artículo** dentro del tema (no se amontona en uno).

Eso es inteligencia puesta donde suma: hace el simulacro **mejor como medida**,
no lo rompe.

### La pantalla

- **Reloj: 30 s por pregunta** (100 preguntas en 50 minutos, del BOE). Avisos al
  20 % y al 5 % del tiempo.
- **Sin corrección** durante el examen.
- Se puede **volver atrás**, **marcar para revisar**, y **dejar en blanco a
  propósito**.
- **Pantalla de revisión** antes de entregar (contestadas / en blanco /
  marcadas).
- **Entrega automática** al agotarse el tiempo.

### Al terminar

1. **Nota de la convocatoria**: `[A − E/(n−1)] × 10/P`, se aprueba con **3**.
   Cada **dos fallos** se pierde **un acierto**. Un blanco no resta.
2. **La cuadrícula 1..N.** Verde acertada · rojo fallada · **blanco** sin
   contestar. **Todas clicables**: al pulsar una ves el enunciado, la opción que
   marcaste, la correcta, la explicación, el artículo **y cuánto tardaste**.
   > Ese último dato es el que dice qué sabes de verdad: una verde de 8 segundos
   > y una de 90 no son lo mismo.
3. **«Repasar los N fallos»** → lleva al módulo de repaso.

---

## Las tres señales nuevas (aprobadas por el dueño)

Se añaden porque **cambian una decisión**, no por coleccionar datos.

### 1 · Qué distractor eligió — dato ya guardado, sin uso hoy

`question_attempts.selected_index` se escribe desde P3.4 y **nadie lo lee** para
decidir nada.

- **Distractor persistente**: fallar 3+ veces eligiendo **siempre la misma
  opción equivocada** no es una laguna — es una **creencia concreta y falsa**.
  Pide tratamiento distinto: no repetir la pregunta sin más, sino llevar a la
  distinción exacta (el artículo, una ficha del matiz). La pantalla de repaso ya
  lo dice («has caído 3 veces en la misma opción»); ahora lo usa el planificador.
- **Trampa conocida** (cruzado entre alumnos): si el 60 % elige el mismo
  distractor, la pregunta es una trampa — señal para moderación.

Coste: cero SQL.

### 2 · Tiempo relativo, no absoluto

Hoy se compara contra 20 s / 45 s fijos. Pero una pregunta de tres líneas y una
de «¿cuál es la MÁS CORRECTA según el texto?» no se responden en el mismo tiempo.
Se compara el tiempo **contra la media del propio alumno** y **contra la media de
esa pregunta**. Quita el ruido del largo del enunciado.

Coste: cero SQL (se deriva de lo que ya hay).

### 3 · Tiempo hasta el primer toque — **columna nueva**

El tiempo total mezcla *recordar* con *deliberar*. Separarlos es la diferencia
entre «lo tenía» y «lo he razonado». Nueva columna
`question_attempts.first_touch_ms` (nullable; el histórico y el simulacro sin
medir van a `null`, regla 8).

Guion: `docs/sql/tiempo-primer-toque.sql`.

---

## Lo que NO va a haber (para no reabrirlo)

- Modos intermedios entre entrenamiento y simulacro.
- Nota en el entrenamiento.
- Adaptación en el simulacro.
- Preguntas al alumno sobre **cómo** ha contestado (salvo el toque opcional de
  corrección en los fallos caros).
- Marca de confianza explícita, ajustes de «fricción», ni elección de dificultad
  en entrenamiento.

---

## Qué hay que construir — HECHO (7 sep 2026)

Lo demás (`buildSmartSession`, `computeQuestionStates`, la penalización del BOE,
el reloj, la pantalla de revisión) ya estaba.

| # | Qué | Estado |
|---|---|---|
| 1 | **Cuadrícula de resultados** clicable (verde/rojo/blanco) + tiempo por pregunta | ✅ `ExamResults.tsx` → `ResultadoSimulacro` |
| 2 | **Selector de alcance**: 1 tema / bloques / todo (usa la tabla `blocks`) | ✅ `ExamConfig.tsx` + `getStudentSyllabus` (`admin.ts`) |
| 3 | **Entrenamiento sin nota**: el resumen de lo consolidado y cuándo vuelve | ✅ `ExamResults.tsx` → `ResultadoEntrenamiento` |
| 4 | **Simulacro representativo** + presets 25/50/100 | ✅ `app/lib/exam-blueprint.ts` (`planExamen`) + `getSimulacro` (`exams.ts`) |
| 5 | **«Hoy te tocan N»** como número propuesto en la config | ✅ `getRecuentoEntrenamiento` (`exams.ts`) + debounce en `ExamConfig` |
| 6 | **Señal 1** (distractor) enganchada al planificador | ✅ `computeQuestionStates.distractorFijo` → `smart-session` lo trata como atascada |
| 7 | **Señal 2** (tiempo relativo) en `answer-signals.ts` | ✅ `perfilTiempos` + `inferFirmeza(s, base)` |
| 8 | **Señal 3** (`first_touch_ms`): columna + captura en `ActiveTest` + uso | ✅ columna ejecutada, `marcarPrimerToque` en `ActiveTest`, lee el planificador |

**Verificado en el preview** (7 sep, sesión de alumno): entrenamiento termina sin
nota con el balance de cajones; simulacro de 20 preguntas (banco corto de 25)
con reloj 10:00, aviso de banco corto, pantalla de revisión y cuadrícula 1..20
con el detalle por pregunta (enunciado, tu opción, la correcta, explicación,
artículo, tiempo).

Tests nuevos: `tests/exam-blueprint.test.ts` (el simulacro representativo).
`ExamConfig` ya no ofrece dificultad en entrenamiento, y sus guardas estáticas
viven en `tests/answer-signals.test.ts`.

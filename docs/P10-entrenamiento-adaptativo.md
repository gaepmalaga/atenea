# P10 · Entrenamiento adaptativo

> Base: [`METODO-APRENDIZAJE.md`](METODO-APRENDIZAJE.md).
> **El modo «Entrenamiento» pasa a ser adaptativo.** El simulacro NO se toca.

## La idea en una frase

Banco de preguntas común, pero cada alumno tiene sus propios **cajones** por
pregunta (nueva / recaída / en aprendizaje / consolidando / dominada / atascada).
Cada vez que pulsa «empezar entrenamiento», el sistema arma la sesión con una
**cuota de cada cajón**, calibrada para que acierte ~85 % (regla del 85 %), e
**intercala** los temas.

## Decisión de arquitectura: derivar al vuelo, sin tabla nueva

El estado de cada pregunta (cajón, próximo repaso) **no se guarda**: se calcula
en el momento a partir de `question_attempts`, que ya registra cada respuesta.

- Es lo que este repo ya hace en `getUserStats` y en el panel de academia (leen
  hasta 20.000 respuestas y agregan en memoria).
- **P10 v1 no necesita ningún guion SQL.**
- Si algún día se nota lento, se añade `question_state` como caché usando la
  MISMA función. `question_attempts` sigue siendo la única verdad.

## Los cajones

`app/lib/question-scheduler.ts` (puro, testeable — regla 21).

`computeQuestionStates(attempts, now)` recorre las respuestas de un alumno en
orden cronológico y por cada pregunta calcula:

| Campo | Cómo |
|---|---|
| `box` | 0 = nunca contestada. `acierto` → `min(5, box+1)`. `fallo` → `1`. `blanco` → sin cambio |
| `streak` | Aciertos seguidos. `fallo` lo pone a 0 |
| `lapses` | Nº de veces que ha caído a la caja 1 desde ≥2. `lapses ≥ 4` = **atascada** |
| `lastAnsweredAt` | Fecha del último acierto/fallo (los blancos no cuentan) |
| `dueAt` | `lastAnsweredAt + BOX_INTERVALS[box]` días |
| `avgTimeMs` / `avgChanges` | De los intentos con dato. Alimenta el criterio de fluidez |
| `lastErrorType` | Para dirigir el cajón (olvido/laguna/trampa/lectura) |
| `soloBlancos` | La ha visto pero solo la ha dejado en blanco → cuenta como nueva pero **marcada «la evitas»** |

**Intervalos** (`BOX_INTERVALS`, índice = `box`): `[0, 1, 3, 8, 21, 45]` días.
Más largos que los de las fichas (`[1,3,7,15,30]`): la preparación es de meses y
una pregunta cuesta más de recuperar que una ficha.

**Fluidez:** `box` sube igual con cualquier acierto, pero una caja 5 con
`avgTime` alto o `avgChanges > 0` en los últimos intentos se marca
`dominadaFragil` — la sesión la re-testea de vez en cuando en vez de darla por
cerrada (técnica 9).

**Reset por tipo de error** (técnica 7): un `fallo` con `error_type =
'fallo_procesamiento'` (lectura) baja a caja 2, no a la 1 — leíste mal, no es que
no lo sepas.

## La sesión

`app/lib/smart-session.ts` (puro).

`buildSmartSession({ states, disponibles, limit, now, dificultad })` → lista
ordenada de `questionId` + un resumen `{ recaidas, repasos, nuevas, consolidar,
refuerzo }`.

**Cubos, por prioridad:**

1. **Recaídas** — caja 1, vencidas. Van SIEMPRE y primero. Orden: más vencida.
2. **Repasos** — cajas 2–4, vencidas. Orden: más vencida, luego menor acierto
   personal.
3. **Nuevas** — nunca contestadas. **Cap ~30 % de la sesión** (inundar de
   material nuevo hunde el acierto por debajo del punto dulce).
4. **Consolidación** — caja 5 vencida (incl. `dominadaFragil`).
5. **Refuerzo / relleno** — cajas 1–2 no vencidas aún pero vistas hace < 2 días.

**Mezcla objetivo** (con material de sobra): ~40 % recaídas+repasos, ~25 %
nuevas, ~20 % consolidación, ~15 % relleno. Si un cubo se queda corto, se
redistribuye proporcionalmente a los demás.

**Calibración al 85 %:** cada cubo tiene un `P(acierto)` esperado
(recaídas ~0,55 · repasos ~0,75 · consolidación ~0,90 · nuevas: `global_success_rate`
de la pregunta si existe, si no 0,5 · relleno ~0,7). Se estima la media ponderada
de la mezcla; si sale < 0,80 se desplaza hacia consolidación/repasos, si > 0,92
hacia nuevas/recaídas. Una sola pasada de ajuste.

**Banco corto:** si el total disponible < `limit`, se devuelve lo que hay con la
bandera que ya pinta el mensaje «avisa a tu academia».

**Intercalado:** la lista final se ordena en round-robin por tema (dos preguntas
seguidas del mismo tema solo si no queda otra). *v1.1:* un tema con < 5 intentos
del alumno se sirve en bloque al principio (bloque de aprendizaje) antes de
entrar a la mezcla.

## Integración

- **Acción nueva** `getAdaptiveSession({ topics, limit, difficulty })` en
  `exams.ts`: lee el banco de esos temas + las respuestas del alumno
  (`supabaseAdmin` + `.eq('user_id')`, como `getUserStats` — regla 34), corre el
  scheduler y el builder, y devuelve las preguntas ya con `topic` + el resumen.
  Si el interruptor está apagado → selección aleatoria (lo de ahora).
- `ExamManager.handleStart`: en modo `practice` llama a `getAdaptiveSession` (una
  sola vez, no el bucle por tema). En modo `exam` sigue igual.
- **Interruptor** `training_adaptive` en `module_settings` (texto libre, patrón
  de la regla 54). **Encendido por defecto**; apagarlo = vuelve al aleatorio.
- **Pantalla de resultados / inicio:** el resumen de la sesión («8 de repaso · 4
  nuevas · 3 para consolidar») y «próximo repaso: N preguntas mañana».
- **Vista «cómo llevas cada tema»** (`resumeCajonesPorTema`, puro): por tema,
  cuántas nuevas / en aprendizaje / consolidando / dominadas. Es la curva de
  aprendizaje. Va en Estadísticas.

## Lo que NO entra en v1

- FSRS (se deja el hueco en los datos).
- Marca de confianza / entrenar el blanco (técnica 8) → v2.
- Tabla `question_state` (solo si hay problema de rendimiento real).
- Intervención especial para «atascadas» más allá de marcarlas (técnica 10) → v2.
- Que el simulacro sea adaptativo — **nunca**, tiene que reflejar el examen real.

## Tests

- `question-scheduler.test.ts` — transiciones de caja, blanco no penaliza, fecha
  de repaso, `lapses`/atascada, reset por lectura, fluidez.
- `smart-session.test.ts` — cuotas, redistribución con cubos vacíos, cap de
  nuevas, intercalado, banco corto, calibración.
- Guardas estáticas: `getAdaptiveSession` con `requireUser` + módulo `test` +
  clave de servicio; el interruptor va antes de nada.

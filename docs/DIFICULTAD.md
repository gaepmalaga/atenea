# La dificultad de las preguntas

**Estado (12 nov 2026):** las 4.617 preguntas activas valen `difficulty_level = 2`
(se sembraron con el valor por defecto) y `global_success_rate` vale 0 en todas.
Por eso los filtros de dificultad de «Exámenes en papel» y la mezcla del
simulacro no cambian nada todavía (regla 118). Esto es el plan para llenarlo,
y lo que ya se ha hecho.

## Qué mide

Dificultad = **cuánta gente preparada fallaría la pregunta**, no lo complicada
que sea de redactar. Tres niveles (la columna ya existe):

| Nivel | Qué es |
|---|---|
| **1 · fácil** | Un dato explícito y aislado que todo el que ha estudiado el tema sabe (una definición clásica, un órgano conocido), con opciones muy distintas y sin negaciones. |
| **2 · media** | Hay que distinguir entre elementos parecidos (órganos, competencias, definiciones cercanas), aplicar una regla a un supuesto sencillo o recordar una lista con excepciones. |
| **3 · alta** | Un dato numérico o una fecha poco conocidos (plazos, penas, años), «excepto» o «NO es correcta», combinación de varios preceptos, opciones casi idénticas, o un detalle de organigrama o de disposición transitoria. |

Un plazo o una pena concretos son de nivel 3 aunque la pregunta sea corta: con
tres opciones numéricas el que no se lo sabe acierta una de cada tres.

## Tres capas, de la más barata a la más fiable

1. **Estimación inicial** (esto). Una clasificación hecha una vez con la rúbrica
   de arriba, marcada como estimada.
2. **El preparador** la corrige a mano desde «Banco oficial» (pendiente de
   construir): manda sobre la estimación.
3. **La medida.** Con 30 o más respuestas reales de alumnos, la dificultad sale
   del acierto observado y sustituye a las otras. La mejor fuente son los
   exámenes en clase (regla 118): 40 alumnos por examen dan 40 respuestas a cada
   pregunta de golpe. No sirven las respuestas de los alumnos de demostración.

## La muestra (hecha)

150 preguntas, reproducibles: las 3 primeras de cada uno de los 45 temas por
`md5(id)` más 15 extra. Clasificadas a mano por Claude con la rúbrica:
[`dificultad/muestra-claude.json`](dificultad/muestra-claude.json).

| | Preguntas | Fáciles | Medias | Difíciles |
|---|---|---|---|---|
| Todas | 150 | 15 (10 %) | 61 (41 %) | 74 (49 %) |
| Bloque jurídico (T1-26) | 88 | 7 | 27 | 54 |
| Bloque social (T27-34) | 26 | 6 | 14 | 6 |
| Bloque técnico-científico (T35-45) | 36 | 2 | 20 | 14 |

Las del bloque jurídico salen bastante más duras: son artículos, plazos y penas.

## Resultado de la comparación con Gemini (12 nov, Actions «Operación» #6)

`gemini-3.5-flash-lite` contra las 150 clasificadas a mano. **Pasa el criterio**
que se fijó antes de mirar. Coste real: $0,0153.

| | Resultado | Criterio |
|---|---|---|
| Coinciden | 110 de 150 (73,3 %) | ≥ 60 % |
| A un nivel | 40 | |
| A dos niveles | 0 | ≤ 5 % |
| Sesgo | −0,04 niveles | ±0,3 |
| Sin nivel | 0 | |

|  | modelo 1 | modelo 2 | modelo 3 |
|---|---|---|---|
| **mano 1** | 7 | 8 | 0 |
| **mano 2** | 2 | 50 | 9 |
| **mano 3** | 0 | 21 | 53 |

Reparto: a mano 15 / 61 / 74; el modelo 9 / 79 / 62. **El modelo tiende a la
media**: de las 74 difíciles a mano, 21 las pone medias; de las 15 fáciles, 8.
Nunca confunde fácil con difícil. Para un filtro de dificultad esto es útil,
pero conviene saberlo: «difícil» según el modelo es algo más exclusivo que
según el preparador. La corrección del preparador (capa 2) y la medida real
(capa 3) existen precisamente para esto.

## Lo que falta

Hecho en el código (12 nov, regla 121), **sin ejecutar todavía en producción**:
el prompt con la rúbrica, la validación de lo que devuelve el modelo, la medida
del acuerdo y el script `npm run dificultad`, con tres acciones nuevas en
«Operación» (Actions → Operación → Run workflow).

1. **`dificultad-muestra`** (de pago, céntimos). Gemini clasifica las 150 de la
   muestra y se compara con la hecha a mano. No escribe nada. Dice si pasa el
   criterio, fijado ANTES de mirar: coincidencia exacta ≥ 60 %, errores de dos
   niveles ≤ 5 % y sesgo medio ≤ ±0,3 niveles (tres niveles dan un 33 % por
   azar). Enseña las diferencias de dos niveles, para afinar la rúbrica mirándolas.
2. **`dificultad-ensayo`** (gratis). Cuenta las activas y estima el coste.
3. **Ejecutar `docs/sql/dificultad-origen.sql`** (una columna, `difficulty_source`)
   y refrescar el esquema (`node scripts/schema-snapshot.mjs`). Sin ella el
   script se niega a escribir: no se podría distinguir lo estimado de lo que
   ponga el preparador, y una reclasificación pisaría su trabajo.
4. **`dificultad-todas`** (pide escribir CLASIFICAR). Solo si la muestra pasó.
   Escribe `difficulty_level` y `difficulty_source = 'estimada'`; no toca lo que
   tenga origen `preparador` ni `medida`; lo que el modelo no clasifica se queda
   como estaba (no pasa a 2).
5. **El preparador la corrige desde «Banco oficial»** (pendiente de construir).
6. **Calcular la medida** (`global_success_rate` y dificultad observada) desde
   los exámenes en clase y desde `question_attempts` real, y que sustituya a la
   estimada a partir de 30 respuestas, excluyendo las cuentas de demostración.

## Lo que salió de paso: preguntas casi repetidas (RESUELTO EN PARTE: regla 119)

Al leer las 150 salió un problema que no es de dificultad: **el banco tiene
muchas preguntas que son la misma con otras palabras**. En la muestra:
tres variantes de «plazo de 15 años de nulidad de la nacionalidad» (Art. 25 CC),
cuatro del modelo tripartito de actitudes (tema 29), tres de tráfico de
migrantes frente a trata (tema 31), cuatro de seguridad activa y pasiva (tema
44), dos de la señal V-2 (tema 43), tres de la Cumbre de Río. Consecuencias: un
examen puede llevar el mismo concepto tres veces, y la dificultad medida de una
se reparte entre varias. Pendiente: una pasada de similitud (los embeddings ya
existen para el temario) para agrupar las repetidas y que un examen no lleve
dos de la misma familia.

También hay alguna pregunta de calidad dudosa, por ejemplo «¿cuál es la última
fecha de modificación del Artículo 29?» (un dato del documento, no de la
norma) o un «NO forma parte» cuya respuesta marcada parece ser un elemento que
sí forma parte. Conviene que «Moderación» las pueda detectar.

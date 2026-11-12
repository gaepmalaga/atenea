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

## Lo que falta

1. **Comparar con Gemini.** Un script que clasifique esa misma muestra con
   `gemini-3.5-flash-lite` y la rúbrica, y mida el acuerdo con la de arriba
   (porcentaje de coincidencias y de errores de dos niveles). Gemini solo
   funciona en producción: va por el flujo «Operación» de GitHub Actions, que
   tiene su clave. Si coincide bien, se ajusta el prompt y se sigue; si no, se
   afina la rúbrica.
2. **Clasificar las 4.617** con el prompt validado (ensayo gratis primero:
   `--ensayo` enseña qué haría sin gastar) y guardarlas como estimadas.
3. **Dónde guardar «estimada» frente a «puesta por el preparador»**: hace falta
   una columna (`difficulty_source`) para que la medida y la mano del preparador
   no se pisen con una reclasificación. Guion de esquema aparte.
4. **Calcular la medida** (`global_success_rate` y dificultad observada) desde
   los exámenes en clase y desde `question_attempts` real, y que sustituya a la
   estimada a partir de 30 respuestas.

## Lo que salió de paso: preguntas casi repetidas

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

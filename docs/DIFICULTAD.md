# La dificultad de las preguntas

**Estado (12 nov 2026):** las 4.617 preguntas activas están clasificadas por la
IA (ver «Estado» más abajo). Antes valían todas 2 y los filtros de dificultad
de «Exámenes en papel» y la mezcla del simulacro no cambiaban nada (regla 118).
Esto es el plan, y lo que ya se ha hecho.

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

## Estado (12 nov, reglas 121 y 122)

**Hecho y en producción:** las 4.617 preguntas activas están clasificadas por la
IA (`difficulty_source = 'estimada'`): 472 fáciles (10 %), 2.012 medias (44 %) y
2.133 difíciles (46 %). La columna `difficulty_source` existe. Coste: unos 5
céntimos.

**Hecho en la rama, sin desplegar:**
- El alumno ve «Fácil / Media / Difícil» en la corrección, nunca antes de contestar.
- El preparador la corrige desde «Banco oficial» (selector, filtro por nivel y
  origen a la vista). Lo que pone una persona no lo pisa ni la IA ni la medida.
- «Preguntas repetidas» (solo superadmin): quedarse con una de cada familia.
- `npm run dificultad:medida` (acciones `dificultad-medida-ensayo` y
  `dificultad-medida` en «Operación»): el nivel sale del acierto observado con
  30 respuestas reales o más, y escribe `global_success_rate`. Sin las cuentas de
  demostración, con una respuesta por alumno y pregunta, y sin pisar al preparador.

**Lo que falta**
1. **Esperar datos.** Ninguna pregunta tiene aún 30 respuestas reales (el máximo
   es 25, y casi todas son de las cuentas de demostración: 9.859 de 9.911).
   Los exámenes en clase (regla 118) son la mejor fuente: 40 alumnos dan 40
   respuestas a cada pregunta de golpe. Cuando los haya: `dificultad-medida-ensayo`
   y, si el reparto es razonable, `dificultad-medida`.
2. **Revisar los umbrales con datos.** ≥ 75 % de acierto es fácil y < 50 % es
   difícil. Con tres opciones adivinar da 33 %. Son un punto de partida: con las
   primeras respuestas reales se mira cómo reparten y se ajustan.
3. **Revisión de la estimación.** La IA tiende a la media (de las 74 difíciles
   a mano, 21 las puso medias). Conviene que un preparador repase las «difíciles»
   y las «fáciles» más dudosas con el filtro de «Banco oficial».
4. **Si el preparador y la medida discrepan** se ve en el informe del ensayo
   (conflictos); nunca se escribe solo.

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

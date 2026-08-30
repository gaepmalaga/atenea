# Plan de producto — de herramienta a plataforma

> Escrito el 27 de agosto de 2026. Complementa a
> [`PLAN-DE-TRABAJO.md`](PLAN-DE-TRABAJO.md), que era un plan de **recuperación**:
> arreglar lo que estaba roto. Este es un plan de **producto**: lo que la
> plataforma todavía no sabe hacer.
>
> **P1 está cerrada** (27 ago). El resto sigue sin empezar. Ver *Estado de P1*,
> justo debajo de esa sección.
>
> **Actualizado el 27 ago** con tres decisiones tomadas: la plataforma sirve por
> ahora a **una sola academia**; el primer paso es un **piloto gratis** con una
> academia amiga; y el problema de la pantalla del test **no era visual, era de
> información**. P3, P4 y P6 están reescritas con eso.

---

## Lo que pediste, y en qué se traduce

| Lo que dijiste | Fase | Tamaño |
|---|---|---|
| «me da miedo que los documentos se partan, se pierda información» | **P1** · Ingesta fiable | Mediana |
| «debemos añadir la opción de añadir preguntas manualmente» | **P2** · Editor de preguntas | Pequeña |
| «la pantalla del test me sigue pareciendo muy básica» | **P3** · Lo que falta en el test | Mediana |
| «un super admin que habilite o deshabilite módulos» | **P4** · Super admin y módulos | **Mediana** (era grande) |
| «un panel mucho más avanzado, que gestione sus alumnos» | **P5** · Panel de academia | Grande |
| «pagos etc…» | **P6** · Cobros | **Aplazada** hasta validar |

**Con una sola academia, la mitad del plan encoge.** P4 deja de arrastrar el
multi-academia y se queda en un rol y unos interruptores; P5 ya no depende de P4;
y P6 se aplaza hasta que el piloto diga si el modelo funciona.

Lo que **no** encoge es P1: hay un fallo activo ahora mismo. Y P3 ha crecido, no
por diseño, sino porque al mirarla de cerca apareció algo peor que el aspecto.

---

## P1 · Que el temario entre entero, y que se sepa si no

### Lo que está pasando ahora mismo

Medido contra tu base de datos el 27 de agosto:

| Documento | Texto guardado | Fragmentos indexados |
|---|---|---|
| TEMA 9 — Ley Orgánica 2/1986 (FCS) | 108.233 caracteres | **0** |
| BOE-A-1978 (Constitución) | 124.764 caracteres | 40 |
| tema 40 | 26.106 caracteres | 31 |

**El TEMA 9 no existe para el chat.** Su texto está completo en la base de datos
—no se perdió al extraerlo del PDF— pero no se indexó ni un solo fragmento. Si
un alumno pregunta por la Ley de Fuerzas y Cuerpos de Seguridad, el chat le
responde que no encuentra nada en el temario.

Debería tener unos **136 fragmentos** (108.233 caracteres ÷ 800 útiles por
fragmento). Tiene cero.

> Los otros dos suman más caracteres en fragmentos que en el original (106 % y
> 122 %). Eso **no** es un error: es el solape de 200 caracteres entre fragmentos
> consecutivos, que existe a propósito para que una frase partida siga
> encontrándose. Ahí no se pierde nada.

### Por qué pasa

**El documento se guarda ANTES de indexarlo.** En `uploadTopicPDF`:

1. Se extrae el texto del PDF.
2. Se inserta la fila en `documents`. ← ya está guardado
3. Se trocea y se indexa fragmento a fragmento.
4. Si fallan todos, se lanza un error… pero **el paso 2 ya ocurrió**.

Resultado: una fila huérfana. El documento aparece en tu lista de temario como
cualquier otro, y nada indica que esté mudo. La fase 2.6 añadió el aviso de
«indexado parcial», pero solo se ve **en el momento de subir**: si cierras la
pestaña, o si el documento se subió antes de ese arreglo, no queda rastro.

### Y un segundo problema, más de fondo

**El troceado no respeta la estructura del documento.** `chunkLegalText` corta
por párrafos (`\n\n`) y, si no los hay, por frases y finalmente por corte duro a
los 1.000 caracteres.

El problema con un texto legal es que ese PDF tiene **30 saltos de párrafo en
108.000 caracteres**. Es decir: el extractor devuelve línea a línea, no párrafo a
párrafo, así que los «párrafos» que ve el algoritmo son bloques de ~3.600
caracteres que se parten a ciegas.

Consecuencia práctica: **un fragmento puede empezar a mitad del artículo 11 y
acabar a mitad del 12**. Cuando el chat lo recupera, la cita sale mutilada. Y
cuando la IA genera una pregunta a partir de ese fragmento, puede estar mezclando
dos artículos distintos.

Esto es exactamente lo que intuías. No es que se pierda texto: es que **se pierde
la estructura**, que en derecho es la mitad del significado.

### Qué hay que hacer

**1. Nunca dejar un documento a medias.**

- Indexar **antes** de dar el documento por bueno. Si no se puede indexar, no se
  guarda: mejor un error claro que un tema mudo.
- Guardar en `documents` un estado (`indexado` / `parcial` / `fallido`) y el
  número de fragmentos, para que la lista del panel lo enseñe siempre, no solo
  en el momento de subir.
- Un botón **«Reindexar»** por documento. Hoy, si algo falla, la única salida es
  borrar y volver a subir.

**2. Trocear por estructura, no por longitud.**

Para un texto legal, el corte natural es el **artículo**. La propuesta:

- Detectar los encabezados (`Artículo 11.`, `TÍTULO II`, `CAPÍTULO III`,
  `Disposición adicional…`) con expresiones regulares, que en el BOE son muy
  regulares.
- Un fragmento = un artículo, siempre que quepa. Si un artículo es enorme, se
  parte por apartados (`1.`, `2.`, `a)`, `b)`) antes que a ciegas.
- Guardar en cada fragmento **de qué artículo viene**. Eso mejora dos cosas de
  golpe: el chat puede citar «Artículo 11.1 LOFCS» en vez del nombre del fichero,
  y las preguntas generadas pueden llevar su referencia legal.

Esto pide una columna nueva en `document_chunks` (`referencia`, texto) y
reescribir `chunkLegalText` con una estrategia por documento: la actual sigue
valiendo para apuntes sueltos, la nueva para textos legales.

**3. Enseñar lo que ha entrado.**

Un visor por documento: cuántos fragmentos, de qué artículos, y poder leerlos.
Hoy subes un PDF y no hay forma de comprobar qué ha entendido la plataforma. Ese
es el origen real de tu desconfianza, y se cura enseñándolo.

### Por qué va primera

Porque hay un tema mudo **ahora mismo** y no había forma de saberlo sin
consultar la base de datos a mano. Y porque todo lo demás —las preguntas, el
chat— se apoya en que el temario esté bien dentro.

### Estado de P1 · actualizado el 27 de agosto de 2026

| | Qué era | Estado |
|---|---|---|
| P1a | El texto del PDF llegaba cortado al ancho de la página | ✅ |
| P1b | Un fragmento por artículo, con su referencia legal | ✅ |
| P1c | El estado del indexado deja de ser invisible | ✅ |
| P1d | Un documento ya no puede quedarse a medias sin que se sepa | ✅ |
| P1e | El panel enseña si un tema está mudo, y deja arreglarlo | ✅ |
| P1f | La referencia que se guardaba era falsa en la mayoría del temario | ✅ |
| P1g | La referencia legal llega hasta el alumno | ✅ SQL ejecutado el 27 ago |
| P1h | **Enseñar lo que ha entrado**: visor de fragmentos por documento | ✅ |

**El TEMA 9 ya no está mudo.** Reindexado desde el panel el 27 de agosto:

| Documento | Antes | Ahora |
|---|---|---|
| Constitución | 40 fragmentos, 0 referencias, máximo 3.100 car. | 232 fragmentos, 229 con referencia, 184 distintas, máximo 989 |
| TEMA 9 (LOFCS) | **0 fragmentos** | 177 fragmentos, 118 con referencia, 72 distintas, máximo 999 |
| tema 40 (apuntes) | 31 fragmentos, máximo 2.419 car. | 40 fragmentos, sin referencia (no es texto legal), máximo 979 |

Las 72 referencias de la LOFCS son sus 54 artículos y sus 18 disposiciones. Los
59 fragmentos sin referencia son el preámbulo, que no sale de ningún artículo.
Comprobado además que el chat recupera el TEMA 9: tres preguntas de prueba sobre
la ley devuelven fragmentos suyos con similitud 0,72–0,85.

**La búsqueda ya devuelve el artículo.** Comprobado contra la base de datos
después de ejecutar el guion, preguntando *«¿cuándo pueden las Comunidades
Autónomas crear sus propios cuerpos de policía?»*:

```
[0.817] Artículo cuarenta y uno    · TEMA 9 - La Ley Orgánica 2-1986…
[0.817] Artículo treinta y siete   · TEMA 9 - La Ley Orgánica 2-1986…
[0.795] Artículo cuarenta y dos    · TEMA 9 - La Ley Orgánica 2-1986…
```

Antes de P1f, ese «Artículo treinta y siete» —el que dice cuándo puede una
comunidad crear su policía— se citaba como «Artículo treinta». Es el ejemplo
exacto del fallo: la referencia existía y era falsa.

**Y ya se puede mirar lo que ha entrado.** Botón *Ver* en cada documento: los
cuatro números de arriba (fragmentos, cuántos traen artículo, cuántos artículos
distintos, el más largo), los fragmentos agrupados por su artículo y en el orden
del documento, y un buscador. Buscar *«Artículo treinta y»* en el TEMA 9 deja 13
de 177 fragmentos, repartidos en los nueve artículos de la decena — cada uno con
el suyo, empezando por su encabezado. Antes de P1f los nueve se llamaban
«Artículo treinta».

Con esto **P1 queda cerrada**: el temario entra entero, se sabe si no, y se
puede comprobar.

---

## P2 · Escribir una pregunta a mano

### Lo que hay hoy

**No existe** una pantalla de «crear pregunta». Solo se pueden **editar** las que
ya existen, desde Banco Oficial o desde Moderación.

En la práctica, si quieres una pregunta concreta hay que generar varias con IA y
reescribir la que más se acerque. Es absurdo.

### Qué hay que hacer

Un formulario de alta, disponible desde Banco Oficial:

- Tema, enunciado, tres opciones, cuál es la correcta, explicación y dificultad.
- Marcada con `origin: 'manual'` (hoy hay `bank`, `live_ai` y `candidate`), para
  poder distinguir en las estadísticas qué rinde mejor: lo escrito a mano o lo
  generado.
- Entra directamente como `active`: si la escribe un administrador, no tiene
  sentido que pase por moderación.
- La misma validación que ya usa todo lo demás (`validateGeneratedQuestion`): sin
  opciones repetidas, sin enunciado vacío, con la respuesta correcta dentro de
  rango.

**Añadido natural, y probablemente lo que más tiempo te ahorre:** importar desde
CSV o Excel. Si ya tienes preguntas escritas en una hoja de cálculo, subirlas de
golpe vale por semanas de trabajo.

### Por qué va segunda

Es la más pequeña de todas y no depende de nada. Se puede hacer en paralelo con
cualquier otra.

---

## P3 · La pantalla del test

> **Decidido (27 ago):** el problema no era el color. Era **qué información hay
> en pantalla**. Esta sección se reescribió con esa respuesta.

### El hallazgo que cambia la prioridad

**El «Simulacro real» no penaliza los errores.** `scoreExam` calcula
`aciertos / total`, y ya está.

En la oposición a Policía Nacional el examen de conocimientos **penaliza los
fallos**: las respuestas incorrectas restan. Un opositor que hace 100 preguntas,
acierta 60 y falla 40 no saca un 60 en el examen real — saca bastante menos.

Consecuencia: **la nota que hoy da el simulacro miente, y miente hacia arriba**.
Un alumno puede llegar al examen creyendo que iba aprobado. Para una plataforma
de oposiciones eso es el peor fallo posible, porque no se nota hasta que ya no
tiene remedio.

Y hay un efecto de segundo orden: como no penaliza, **contestar a todo siempre
sale a cuenta**. En el examen real no: hay un punto en el que arriesgar es peor
que dejar en blanco. La plataforma no solo da mal la nota, es que **enseña una
estrategia equivocada**.

> **Resuelto (27 ago), y hecho.** La fórmula está en la
> [Resolución de 7 de julio de 2026 de la Dirección General de la Policía](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-15055),
> primera prueba:
>
>     [A − E/(n−1)] × 10/P
>
> 100 preguntas, 3 alternativas, 50 minutos, mínimo **3 puntos**. Con n = 3,
> **cada dos fallos se pierde un acierto**, y las respuestas en blanco no
> aparecen en la fórmula: no restan.
>
> Implementada en [`app/lib/scoring.ts`](../app/lib/scoring.ts) con las reglas en
> un objeto configurable, no en constantes sueltas: la fórmula cambia entre
> convocatorias y entre escalas.

### Lo que sí tiene hoy

Cronómetro, progreso por preguntas, atajos de teclado, votar y reportar la
pregunta, corrección inmediata en entrenamiento y clasificación obligatoria del
fallo. La clasificación del error es, de hecho, **mejor que la de la mayoría de
plataformas del sector**: casi ninguna te obliga a decir *por qué* fallaste.

### Lo que le falta, por orden de lo que más echaría de menos un opositor

**1. Nota con penalización, y en tiempo real.**
Que el resultado sea el del examen de verdad. Y en modo entrenamiento, ver el
efecto de cada fallo en el momento enseña la estrategia correcta.

**2. Poder volver atrás.**
Hoy el test es una vía de sentido único: `handleNext` avanza y no hay manera de
retroceder. **En el examen real puedes volver sobre tus pasos**, y es lo que
hace todo el mundo. Es probablemente lo que más frustra de la pantalla actual.

**3. Marcar una pregunta para revisarla luego.**
Una bandera. Estándar absoluto en el sector y en Moodle: dudas, la marcas,
sigues, y al final vuelves a las marcadas. Sin esto, dudar te obliga a decidir
en el momento.

**4. El mapa de preguntas.**
Una cuadrícula con las 100 preguntas y su estado: contestada, en blanco,
marcada. Es *el* elemento que distingue una pantalla de examen seria de un
formulario. Moodle lo lleva de serie («navegación por el cuestionario») y todas
las plataformas de oposiciones lo copian. Permite además saltar a cualquier
pregunta.

**5. Dejar en blanco a propósito.**
Con penalización, el blanco es una **decisión estratégica**, no un descuido. Hace
falta un botón explícito de «dejar en blanco» y que el resumen distinga
contestadas de blancos.

**6. Tiempo límite de verdad.**
El «Simulacro real» dice tener cronómetro, pero **no hay límite**. Un simulacro
sin reloj que corra hacia cero no es un simulacro. Hace falta tiempo total
configurable, cuenta atrás, avisos y entrega automática al agotarse.

**7. La referencia legal de la pregunta.**
De qué artículo sale. Para un opositor esto vale casi tanto como la explicación:
le dice qué releer. **Depende de P1**: solo se puede mostrar si el troceado
guarda de qué artículo viene cada fragmento. Es la razón por la que P1 va antes
que esto.

**8. Pantalla de revisión antes de entregar.**
Moodle la llama «Terminar intento». Un resumen: has contestado 87, dejado 13 en
blanco, marcado 6 para revisar. Y desde ahí, volver a cualquiera. Entregar sin
ver esto es fácil de hacer por error.

**9. Notas del alumno sobre la pregunta.**
Un campo suyo, privado, que reaparezca cuando le vuelva a salir.

### Lo que NO hay que copiar del sector

Muchas plataformas de test están llenas de ruido: rachas, insignias, medallas,
rankings entre alumnos. Es tentador y se ve moderno, pero en una pantalla de
examen **compite con la pregunta**. Un opositor que está resolviendo un supuesto
no necesita saber que lleva 12 días de racha.

La regla para esta pantalla: **todo lo que se muestre tiene que ayudar a decidir
la respuesta o a gestionar el examen.** El resto va a las estadísticas.

### El orden dentro de P3

```
1. Penalización en la nota      ✅ hecho (27 ago)
2. Volver atrás + marcar        ✅ hecho (27 ago)
3. Mapa de preguntas            ✅ hecho (30 ago)
4. Blanco explícito             ✅ hecho (30 ago)
5. Tiempo límite + entrega auto ✅ hecho (30 ago)
6. Pantalla de revisión final   ✅ hecho (30 ago)
7. Referencia legal             ⛔ BLOQUEADO: falta columna en `question_bank`
8. Notas personales             ⛔ BLOQUEADO: falta tabla
```

**Los dos que quedan necesitan tocar el esquema, y eso solo lo puedes hacer
tú.** El 7 necesita una columna `legal_reference` en `question_bank` que se
rellene al generar la pregunta desde el fragmento (el fragmento ya sabe de qué
artículo viene: eso lo dejó P1g en `document_chunks.reference`). El 8 necesita
una tabla `question_notes`. No se puede escribir el código antes: PostgREST
rechaza la escritura **entera** si una sola columna no existe, así que
adelantarlo rompería el guardado de preguntas.

### Lo que salió al hacer el 3 y el 4

**La marca amarilla tapaba el estado.** En el mapa, «marcada» se pintaba
sustituyendo el color en vez de encima, así que una pregunta marcada y
contestada se veía igual que una marcada y en blanco — justo lo que hay que
poder distinguir al final. Ahora la marca es una muesca aparte.

**No se podía retirar una respuesta.** El punto 4 no era solo poder saltarse
una pregunta (eso ya se podía): era que, una vez pulsada la A, la única salida
era dejar la A. Con penalización eso importa, porque el blanco es una decisión.

**Y el fallo de verdad: el blanco se guardaba como fallo.** La nota ya lo
trataba como neutro, pero al escribir en `question_attempts` caía en
`is_correct: false`. El mismo examen daba dos verdades, y el porcentaje de
acierto castigaba no arriesgar — al revés de lo que enseña la fórmula. Se
distingue con `selected_index`, que llevaba declarada desde siempre y **nadie
escribía**; ver [`docs/sql/P3-blanco-no-es-fallo.sql`](sql/P3-blanco-no-es-fallo.sql).

### Lo que salió al hacer el 6

**Entregar estaba a un clic del botón de avanzar.** En la última pregunta,
«SIGUIENTE» entregaba el examen: irreversible, en el mismo sitio y con el mismo
aspecto que el botón que llevabas veinte preguntas pulsando. Ahora lleva al
resumen, y el botón dice REVISAR.

De la 2 salió algo que no estaba previsto: **las métricas eran por visita**. El
cronómetro se reiniciaba al cambiar de pregunta, así que en cuanto se puede
volver atrás, revisar una respuesta al final borraba el tiempo que costó la
primera vez. Ahora se acumulan por pregunta. Efecto colateral: es la primera vez
que `option_changes` sale distinto de 0 en una fila real — en entrenamiento no
puede serlo, y en el simulacro no había forma de cambiar una respuesta después
de avanzar.

Los seis primeros no dependen de nada y son la mitad del valor.

**El fleco que dejó la penalización — ✅ resuelto el 30 ago.** La pantalla de
resultados ya distinguía fallo de blanco, pero `buildExamResults` guardaba el
blanco como `is_correct: false`, así que en las estadísticas seguía contando
como fallo. Se creía que hacía falta una columna nueva; no hacía falta:
`selected_index` ya existía y **nadie la escribía**. Ahora se rellena, con `-1`
para el blanco deliberado y `null` reservado a las filas antiguas, que es lo
que evita leer todo el histórico como blancos.

### El arreglo del Markdown — ✅ hecho

Las preguntas con `**correcta**` sin renderizar están limpias: 4 de 67
afectadas, 0 ahora. Se limpia **al guardar**, no al mostrar — un enunciado de
test debe ser texto plano, y el enunciado se pinta en cuatro sitios distintos.

### Lo que se añadió sin estar en el plan: repasar lo fallado — ✅ hecho

No estaba escrito aquí porque salió de una pregunta directa: *«¿existe algún
lugar donde poder ver falladas etc… para repasar?»*. No existía.

Y era el agujero más caro de todos: la plataforma sabía exactamente qué había
fallado cada alumno **y por qué** —el diagnóstico del error es obligatorio, y
casi ninguna plataforma del sector lo pide— y ese dato se recogía y se moría en
la tabla. Ahora hay pestaña propia, justo después del test: las falladas
agrupadas y ordenadas por insistencia, con la correcta, la explicación, y el
diagnóstico devuelto como consejo. Clasificar el error solo sirve si luego se
le dice al alumno qué hacer con esa clasificación.

---

## P4 · Super admin y módulos que se encienden y se apagan

> **Decidido (27 ago):** por ahora la plataforma sirve a **una sola academia**.
> Esto simplifica mucho la fase, pero condiciona *cómo* hay que construirla.

### Lo que hay hoy

Dos roles: `admin` y `student`. Un solo espacio: un temario, un banco, una lista
de usuarios. No hay forma de apagar un módulo: los siete están siempre visibles.

### Lo que se hace ahora

**Un tercer rol y unos interruptores. Nada más.**

- `profiles.role` pasa a admitir `superadmin`.
- Tabla `module_settings`: qué módulos están activos. Una fila por módulo, con su
  estado y quién lo cambió.
- `StudentDashboard` deja de tener los siete módulos escritos a mano y los lee de
  ahí.
- Pantalla de super admin: la rejilla de interruptores, más la vista de
  administradores y alumnos que pediste.
- Y de paso, la pantalla que hoy falta: **cambiar el rol de un usuario** sin
  entrar en Supabase.

**La regla que no puede saltarse:** apagar un módulo tiene que apagarlo **también
en el servidor**. Si `chat` está apagado, `askAtenea` debe rechazar la llamada
antes de tocar a Gemini. Una Server Action es un endpoint público: esconder el
enlace del menú no impide que nadie la llame, y cada llamada al chat se paga.
Esto va en la misma guarda que ya usan `requireUser` y `requireAdmin`.

### Lo que NO se hace ahora, pero se deja preparado

No se crea la tabla `organizations` ni se toca ninguna consulta. Con una academia
sería trabajo puro sin beneficio.

Pero como el plan a un año es marca blanca o multi-academia, hay dos decisiones
baratas ahora que evitan rehacerlo entero después:

- **`module_settings` con una columna `organization_id` que hoy va siempre a
  `null`.** Cuesta cero y significa que el día que existan academias solo hay que
  rellenarla, no reescribir la tabla.
- **Los ajustes se leen desde un único sitio** (un `getModuleSettings()` con
  caché). El día que dependan de la academia, se cambia esa función y no las
  quince pantallas que la usan.

Eso es todo lo que hay que anticipar. Cualquier otra cosa es construir para un
futuro que puede no llegar.

### Marca blanca: qué significa de verdad

Si el modelo acaba siendo cederla a otras academias, «marca blanca» son tres
cosas, y solo la tercera es cara:

1. **Logo y nombre configurables.** Barato. Un puñado de ajustes.
2. **Colores propios.** Barato *si se hace desde el principio* con variables CSS.
   Caro si hay que ir a buscar colores escritos a mano por cincuenta ficheros.
3. **Datos separados.** Esto es lo caro: es el multi-academia entero.

Las dos primeras se pueden hacer casi gratis mientras se construye P5. La tercera
es un proyecto y no toca todavía.

---

## P5 · El panel de la academia

> **Ahora se puede hacer antes**, porque con una sola academia no depende de P4.

### Qué debería tener

**Alumnos, de verdad.** Hoy la lista da nombre, rol, preguntas hechas y acierto.
Falta lo que un profesor necesita para dar clase:

- Ficha individual: evolución en el tiempo, temas fuertes y débiles, cuándo entró
  por última vez, en qué falla sistemáticamente.
- **Quién ha abandonado.** Un alumno que lleva dos semanas sin entrar es el dato
  más accionable que hay en una academia, y hoy no se ve en ninguna parte.
- Invitar por correo, en vez de esperar a que se registren solos y aparezcan.
- Agrupar por clase o promoción.

**Contenido.** Qué temas tienen banco y cuáles no, qué preguntas falla todo el
mundo (señal de que están mal redactadas, no de que sean difíciles), qué temas no
toca nadie.

> **Y algo más, que apareció haciendo un simulacro de verdad (27 ago):** de las
> 35 preguntas que figuraban como aprobadas en Constitución (I), **15 eran de
> Inteligencia** — OSINT, Deep Web, Dark Net. No era un fallo del código: el
> examen servía lo que decía el banco. Eran las 15 de la tanda de febrero que no
> guardaron `document_id`, así que se había perdido el rastro de su origen.
>
> Importa más de lo que parece porque `question_attempts` guarda el tema
> **elegido**, no el de la pregunta: un alumno estudiando Constitución acumulaba
> estadísticas de Constitución respondiendo sobre la Deep Web.
>
> Corregido con [`scripts/revisar-tema-de-las-preguntas.mjs`](../scripts/revisar-tema-de-las-preguntas.mjs),
> que embebe cada enunciado y lo busca en el temario: las 15 daban entre 3,36 y
> 4,15 de parecido con Inteligencia y **0,00** con la Constitución. Ahora
> Constitución (I) tiene 20 activas e Inteligencia 15 — su primer banco, porque
> hasta hoy sus 26 preguntas estaban todas en moderación.
>
> **Esto es exactamente lo que el panel de academia tiene que enseñar solo.** Que
> haga falta un guión para descubrirlo es el problema.

**Visualmente**, la palabra es *información*, no adornos. Que se vea de un vistazo
qué necesita atención. Un panel con veinte números iguales no es más avanzado: es
más ruidoso.

### Lo que tu amigo va a pedir el primer día

Vale la pena anticiparlo, porque es lo que decide si el piloto funciona:

- **Dar de alta a sus alumnos** sin pelearse con nada.
- **Ver quién trabaja y quién no**, para poder llamarle.
- **Subir su propio temario** y que las preguntas salgan de ahí, no de un temario
  genérico.
- **Que sus preguntas sean suyas.** Merece la pena hablarlo antes: si sube su
  material y la IA genera preguntas con él, conviene dejar por escrito de quién
  son.

---

## P6 · Cobros

> **Decidido (27 ago):** primero un piloto gratis con una academia amiga para
> validar el modelo. Los cobros **no se construyen todavía**.

### Por qué esperar es lo correcto

Los dos caminos que planteas llevan a productos distintos:

- **Marca blanca a academias.** Cobras a la academia. Pocos clientes, factura
  grande, contrato. Probablemente ni necesites pasarela al principio: con dos o
  tres clientes, una transferencia y una factura hecha a mano funcionan.
- **Captar alumnos tú directamente.** Cobras al alumno. Muchos clientes, importe
  pequeño, altas y bajas constantes. **Esto sí exige pasarela desde el día uno**,
  además de gestionar bajas, devoluciones y morosidad.

Construir cobros antes de saber cuál de los dos es sería trabajo tirado. Y el
piloto es exactamente lo que resuelve esa duda.

### Lo único que conviene hacer ya

**Medir el uso desde el principio.** Cuando llegue el momento de poner precio,
vas a necesitar saber cuánto cuesta servir a un alumno: cuántas llamadas a Gemini
consume al mes, cuánto ocupa su temario. Ese dato solo existe si se ha ido
guardando.

La tabla `ai_quota` ya cuenta las llamadas por usuario y ruta. Basta con **no
borrar el histórico** y añadir un panel simple de consumo. Cuesta poco ahora y no
se puede reconstruir después.

### Y una conversación que no es técnica

Si tu amigo valida el modelo y luego quieres usar su banco de preguntas para
captar alumnos por tu cuenta, **eso hay que acordarlo antes de que exista el
banco**, no después. Él va a poner su temario y su criterio de moderación; el
banco resultante vale dinero. Un piloto que empieza sin esa conversación acaba en
una discusión incómoda justo cuando la cosa empieza a funcionar.

No es trabajo mío, pero es lo que puede hundir el proyecto teniendo el código
perfecto.

---

## Orden propuesto

```
P1  Ingesta fiable            hay un fallo activo AHORA
P3  Penalización en la nota    el simulacro da una nota falsa
P2  Preguntas a mano           pequeña, sin dependencias
P3  Volver atrás + marcar      lo que más se echa de menos
P3  Mapa, blanco, tiempo       completa la pantalla de examen
──────────────────────────────────────────────────────────────
P4  Super admin + módulos      un rol y unos interruptores
P5  Panel de academia          lo que tu amigo va a pedir el día 1
──────────────────────────────────────────────────────────────
P6  Cobros                     después del piloto, no antes
```

**Los dos primeros son correcciones, no mejoras.** Un tema mudo y una nota que
miente hacia arriba son fallos que el usuario no puede detectar por su cuenta, y
eso los pone por delante de cualquier funcionalidad nueva.

P3 aparece tres veces a propósito: no es una fase, es una lista de cosas
independientes. La penalización va la primera porque corrige un dato falso; el
resto puede entrar poco a poco.

La primera línea separa lo que mejora la plataforma de lo que la prepara para
tener clientes. La segunda separa lo gratis de lo que cobra.

---

## Lo que necesito de ti antes de empezar

Las tres preguntas anteriores están respondidas. Quedan dos, y ninguna bloquea
el arranque:

1. **La fórmula de penalización** de la convocatoria vigente. Sale del BOE de la
   convocatoria, no de memoria. Mientras tanto se puede construir configurable y
   ajustar el número después.
2. **Qué módulos quiere apagar tu amigo**, si es que quiere apagar alguno. Sirve
   para saber si P4 corre prisa o puede esperar detrás de P5.

Con eso, se puede empezar por P1 mañana mismo.

---
## Y algo que no pediste, pero yo pondría antes que casi todo

**Repasar las preguntas falladas.** Hoy un alumno ve sus fallos clasificados por
tipo de error y no puede hacer nada con ellos: no hay forma de volver a
responderlos.

Para una plataforma de estudio eso es el agujero más grande que tiene. Es
pequeño de construir —una consulta a `question_attempts` filtrando
`is_correct = false` y un modo de test que las sirva— y es probablemente la
funcionalidad que más notaría un opositor de todo este documento.

Lo dejo aquí para que decidas, no para colarlo.

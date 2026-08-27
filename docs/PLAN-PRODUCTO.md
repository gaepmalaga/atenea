# Plan de producto — de herramienta a plataforma

> Escrito el 27 de agosto de 2026. Complementa a
> [`PLAN-DE-TRABAJO.md`](PLAN-DE-TRABAJO.md), que era un plan de **recuperación**:
> arreglar lo que estaba roto. Este es un plan de **producto**: lo que la
> plataforma todavía no sabe hacer.
>
> **Nada de esto está empezado.** Es el documento que hay que discutir antes de
> tocar código.

---

## Lo que pediste, y en qué se traduce

| Lo que dijiste | Fase | Tamaño |
|---|---|---|
| «me da miedo que los documentos se partan, se pierda información» | **P1** · Ingesta fiable | Mediana |
| «debemos añadir la opción de añadir preguntas manualmente» | **P2** · Editor de preguntas | Pequeña |
| «la pantalla del test me sigue pareciendo muy básica» | **P3** · Rediseño del test | Mediana · **te necesito** |
| «un super admin que habilite o deshabilite módulos» | **P4** · Super admin y módulos | Grande |
| «un panel mucho más avanzado, que gestione sus alumnos» | **P5** · Panel de academia | Grande |
| «pagos etc…» | **P6** · Cobros | Grande · **decisión legal** |

El orden no es caprichoso y se explica en cada apartado. El resumen: **P1 va
primera porque hay un fallo activo ahora mismo**, y P4 va antes que P5 porque el
panel avanzado necesita saber qué es una academia, y eso lo define P4.

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

### El problema

Te sigue pareciendo básica después de un rediseño. Eso significa que el problema
no es lo que le falta, sino **de qué va**: no hay una dirección visual detrás, y
sin ella cada iteración es adivinar.

Lo que se hizo hoy (cronómetro, progreso segmentado, atajos, cerrar el hueco) son
mejoras de **función**. Lo que falta es una decisión de **carácter**.

### Lo que necesito de ti

Una de estas tres, o una referencia tuya:

**a) Examen oficial.** Sobrio, denso, papel. Como el cuadernillo real de la
oposición: numeración clásica, tipografía de imprenta, cero adornos. La ventaja
es que entrena en las condiciones del examen de verdad.

**b) Sala de control.** Coherente con el resto de la app —«Centro de Mando»,
«Operaciones», hora ZULU—: fondo oscuro, datos en vivo, tipografía técnica,
sensación de instrumento. Ahora mismo la app dice ser esto y luego la pantalla de
test es blanca y ligera: **hay una contradicción**.

**c) Concentración.** Lo contrario: quitar todo menos la pregunta. Sin barra
lateral, sin colores, una sola cosa en pantalla. Apostar por que estudiar es un
acto de foco.

**O mándame una captura** de cualquier app que te guste —aunque no sea de
oposiciones— y trabajo sobre eso. Es más rápido que tres rondas de adivinar.

> Mi opinión, ya que la pides implícitamente: la **(b)** es la única coherente
> con lo que la aplicación ya dice ser. Hoy el panel del alumno es oscuro y
> táctico, y el test es una tarjeta blanca flotando. Esa es buena parte de la
> sensación de «básico».

### Y un arreglo pendiente, ya identificado

5 de las 67 preguntas del banco llevan Markdown sin renderizar en el enunciado
(`**correcta**`). La IA lo escribe para poner una palabra en negrita y la
pantalla lo pinta en crudo. Dos salidas: interpretar el Markdown al mostrarlo, o
limpiarlo al guardar. **Recomiendo limpiarlo al guardar**: menos superficie, y el
banco queda con texto plano, que es lo que un enunciado de test debe ser.

---

## P4 · Super admin y módulos que se encienden y se apagan

### Lo que hay hoy

Dos roles: `admin` y `student`. Un solo espacio compartido: un temario, un banco,
una lista de usuarios. **Todos los administradores lo ven todo.**

No hay forma de apagar un módulo. Los siete del alumno están siempre visibles
para todos.

### Lo que pides

Un tercer nivel por encima, que vea a administradores y alumnos, y que pueda
encender y apagar módulos desde la propia interfaz.

### Lo que eso implica de verdad

Es la fase con más consecuencias, porque **arrastra la idea de academia**. Si un
super admin va a ver «los datos de admin y alumnos», la pregunta inmediata es:
¿de qué administrador es cada alumno? Y eso hoy no se puede responder.

Así que P4 son en realidad dos cosas:

**1. El concepto que falta: la academia.**

- Una tabla `organizations` (id, nombre, plan, estado).
- `profiles` gana `organization_id`.
- El temario, el banco de preguntas y los alumnos pasan a pertenecer a una.
- **Todas las consultas del proyecto** —y hay muchas— tienen que filtrar por
  ella. Las políticas de RLS también.

Esto no es un ajuste. Es la decisión estructural más grande del plan y afecta a
casi todos los ficheros de `app/actions/`.

> **Decisión que solo puedes tomar tú:** ¿el banco de preguntas es **común** a
> todas las academias o **propio** de cada una? Cambia por completo el diseño.
> Común significa que todos se benefician del trabajo de todos; propio significa
> que cada academia tiene su producto y no lo comparte. Hay una vía intermedia
> —un banco base común más el propio de cada una— que es la más útil y la más
> cara de construir.

**2. Los módulos configurables.**

Una vez existe la academia, esto es sencillo:

- Tabla `module_settings`: qué módulos están activos para cada academia.
- Los siete módulos del alumno (`home`, `chat`, `test`, `cards`, `training`,
  `interview`, `stats`) pasan a leerse de ahí en vez de estar escritos a mano en
  `StudentDashboard`.
- El super admin ve una rejilla de interruptores por academia.

**Y una regla que no puede saltarse:** apagar un módulo tiene que apagarlo
**también en el servidor**, no solo esconder el botón. Si `chat` está apagado,
`askAtenea` debe rechazar la llamada. Una Server Action es un endpoint público:
esconder el enlace no impide que alguien lo llame, y cada llamada al chat se paga.

**Tres roles, no dos:** `superadmin` > `admin` > `student`. Y hará falta una
pantalla para gestionar roles, porque hoy eso se hace a mano en Supabase.

---

## P5 · El panel de la academia

### Lo que pides

Un panel «mucho más avanzado y visual» para que un administrador gestione a sus
alumnos.

### Qué debería tener

**Alumnos, de verdad.** Hoy la lista de usuarios da nombre, rol, cuántas
preguntas ha hecho y su acierto. Falta lo que un profesor necesita:

- Ficha individual: evolución en el tiempo, temas fuertes y débiles, cuándo
  entró por última vez.
- **Quién ha abandonado.** Un alumno que lleva dos semanas sin entrar es el dato
  más accionable que existe en una academia, y hoy no se ve.
- Invitar por correo en vez de que se registren solos y esperar a que aparezcan.
- Agrupar por clase o promoción.

**Contenido.** Qué temas tienen banco y cuáles no —hoy tienes 35 preguntas
aprobadas y **todas** son de Constitución (I)—, qué preguntas fallan más de la
cuenta (señal de que están mal redactadas), qué temas no toca nadie.

**Visualmente**, la palabra clave es *información*, no adornos: que se vea de un
vistazo qué necesita atención. Un panel con muchos números iguales no es más
avanzado, es más ruidoso.

### Por qué va después de P4

Porque «sus alumnos» necesita que exista la academia. Construir este panel antes
significa construirlo dos veces.

---

## P6 · Cobros

### Lo que hay hoy

Nada. Ni pagos, ni planes, ni suscripciones, ni facturas.

### Antes de escribir una línea

Esto no es una funcionalidad más: **es un negocio con obligaciones legales**.
Antes de diseñar nada hay que responder:

- **¿Quién paga a quién?** ¿La academia te paga a ti por usar Atenea, o el alumno
  paga a la academia y tú te llevas una parte? Son dos productos distintos: el
  segundo te convierte en intermediario de pagos, con todo lo que eso implica.
- **¿Suscripción o pago único?** ¿Por academia, por alumno activo, por volumen?
- **Facturación española.** IVA, facturas numeradas, conservación. Esto no lo
  resuelve una pasarela sola.

### Cómo se haría

- **Stripe**, casi con seguridad. Es el estándar y resuelve tarjetas, SEPA,
  suscripciones, reintentos y facturas.
- **Ni un dato de tarjeta pasa por Atenea.** Se redirige a Stripe y se vuelve.
  Guardar números de tarjeta te mete en un mundo de certificaciones que no
  quieres.
- La suscripción decide qué puede hacer cada academia, y eso **enlaza
  directamente con P4**: los módulos que un plan incluye son los mismos
  interruptores del super admin.
- Cuando alguien deja de pagar, hay que decidir qué pasa: ¿se corta el acceso?
  ¿se conserva el temario? ¿cuánto tiempo?

### Por qué va última

Porque cobrar por algo exige que ese algo esté delimitado, y quien lo delimita es
P4. Vender «acceso a los módulos X e Y» necesita que los módulos se puedan
encender y apagar.

---

## Orden propuesto

```
P1  Ingesta fiable          ← hay un fallo activo
P2  Preguntas a mano        ← pequeña, en paralelo con lo que sea
P3  Rediseño del test       ← bloqueada: necesito dirección visual
──────────────────────────────────────────────────────────────
P4  Academias + super admin ← la decisión estructural
P5  Panel de academia       ← necesita P4
P6  Cobros                  ← necesita P4 y una decisión de negocio
```

La línea separa dos mundos. **Arriba**, mejoras sobre lo que ya existe: se pueden
hacer una a una, sin riesgo, y cada una se nota al día siguiente. **Abajo**, una
plataforma distinta: multi-academia, con roles, con clientes que pagan. El paso
de una a otra es P4, y conviene cruzarlo a sabiendas.

---

## Lo que necesito de ti antes de empezar

1. **La dirección visual del test** (P3): (a) examen oficial, (b) sala de control,
   (c) concentración — o una captura de algo que te guste.
2. **El banco de preguntas** (P4): ¿común a todas las academias, propio de cada
   una, o mixto?
3. **El modelo de cobro** (P6): ¿quién paga a quién?

Sin la 1 no puedo rediseñar sin adivinar. Sin la 2 no puedo diseñar la base de
datos de P4. La 3 puede esperar, pero condiciona P4 y conviene tenerla en la
cabeza al construirlo.

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

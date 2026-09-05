# Traspaso — 30 y 31 de agosto, y 3–4 de septiembre de 2026

Punto de partida para la siguiente conversación. Lo que hay que leer antes de
tocar nada sigue siendo [`CLAUDE.md`](../CLAUDE.md); esto es sólo el estado del
día y por qué está donde está.

---

## 4 de septiembre · La interfaz, usándola de verdad

Hasta ahora la interfaz se corregía **a ciegas**: leyendo código, razonando
sobre CSS y pidiendo capturas. Esta tanda empieza por montar un
[**banco de pruebas**](BANCO-DE-PRUEBAS.md) que levanta la aplicación entera en
un navegador de verdad, a tamaño de móvil, con las 48 Server Actions
sustituidas por datos de prueba. Y a partir de ahí, usarla.

### Lo que se rompía y no se veía

| | |
|---|---|
| **Un examen a medias no existía en ningún sitio** hasta entregarlo. Una recarga, un Atrás o que el móvil descartara la pestaña se llevaban cuarenta minutos. | Ahora se guarda en cada respuesta y ofrece reanudarlo. Nunca solo: el reloj sigue corriendo. |
| **Atrás salía de la aplicación.** En Android es el gesto que más se usa. | Cada pestaña deja su entrada en el historial. Con un examen abierto, pregunta. |
| **Cada cambio de pestaña te dejaba al final de la página** — "siempre me lleva al final". La barra de pestañas vive abajo, así que pulsarla implica llevar la página bajada. | Arriba del todo al cambiar de pantalla. |
| **El chat se borraba** al ir a mirar el temario y volver. | Sobrevive en `sessionStorage`. |
| **De la sala de voz no se podía salir.** Sin botón y sin Atrás, y el botón de empezar se queda en "SINTONIZANDO…" si el navegador no carga las voces. | Salida siempre presente, que corta la voz y el micrófono. |
| **El recuadro de escribir del chat quedaba 22px por debajo de la barra de pestañas.** Un `100dvh-140px` a ojo cuando eran 162. | Se mide el hueco real. Con el teclado abierto, encoge con él. |
| **El mapa de preguntas del simulacro se podía ver pero no pulsar**: 12px de alto, 18px por segmento con 20 preguntas. | Un botón abre la cuadrícula buena, con un botón por pregunta. |
| **La barra de progreso del examen no se había visto NUNCA**: un `<span>` es inline y un elemento inline ignora `width` y `height`. Medía 0x0. | `block`, y más contraste. |
| **La pantalla de la nota era un callejón sin salida**: quien acababa de fallar cinco preguntas se iba con la nota sin ver ni una. | "Repasar los N fallos" va primero. |

### Pantallas que nadie había mirado

El banco mentía sin querer: varios stubs devolvían otra forma que la acción de
verdad, así que la pantalla se pintaba con `undefined` y el recorrido la daba
por buena. **La pantalla de repaso de fallos, el registro de actividad, el
visor de fragmentos y el panel del plan de entrenamiento no se habían visto
nunca con datos.** Al arreglarlos aparecieron: un módulo que reventaba entero
por leer un campo sin comprobarlo, filas de 634px en una pantalla de 390, y un
plan semanal que ocupaba 1.100px de scroll sin enseñar ni un ejercicio.

Ahora las formas se comprueban **a nivel de tipos** y `npm run check` lo exige.

### Lo que además se llevó por delante

- **Tres módulos ponían su propia cabecera** debajo de la que ya había: entre
  las dos, 300px de un móvil de 844 antes de llegar a nada usable.
- **Nueve controles por debajo de los 44px táctiles**, uno de ellos el que
  borra un documento, con el mismo aspecto que el que se pulsa a diario.
- **Letra de 72px y de 128px fija en un móvil.** Ahora lo vigila un test.
- **El panel de academia se arrastraba de lado** por un `min-w-0` que faltaba:
  `truncate` no sirve de nada si el contenedor crece para no truncar.
- **`npm run build` entra en CI.** Decía que no podía porque el prerender
  exigía "las cuatro variables reales": exige que existan, no que sirvan. Cada
  push a `main` despliega solo, y hasta ahora nada compilaba la aplicación
  antes de que llegara a producción.

### Lo que sigue sin verse

Todo esto está medido en un navegador de verdad, pero **con datos de mentira**.
Sigue faltando entrar como alumno en producción y hacer un test entero: es lo
único que comprueba que lo que se guarda es lo que se lee.

---

## Lo primero: ya hay producción

**https://atenea-eight.vercel.app**

Estaba desplegada desde febrero y `CLAUDE.md` decía que no había nada. Lo que
no funcionaba era **entrar**: Supabase tenía la Site URL en
`http://localhost:3000` y ninguna Redirect URL, así que la autenticación no
podía volver a la aplicación. Corregido el 30 ago:

| Ajuste | Valor |
|---|---|
| Site URL | `https://atenea-eight.vercel.app` |
| Redirect URLs | `https://atenea-eight.vercel.app/**` · `http://localhost:3000/**` |

Localhost sigue en la lista a propósito, para que el desarrollo local no se
rompa.

Cada push a `main` despliega solo. Los 12 commits que estaban sin subir ya
están en GitHub.

> El proyecto duplicado `atenea-jw3h` **ya está borrado** (31 ago; reconfirmado
> el 5 sep 2026: en Vercel solo quedan `atenea` y el no relacionado `brand-os`).

---

## Lo que se hizo en esta tanda

### P3 · La pantalla del test — cerrada, 8 de 8

```
1. Penalización en la nota      ✅  (27 ago)
2. Volver atrás + marcar        ✅  (27 ago)
3. Mapa de preguntas            ✅
4. Blanco explícito             ✅
5. Tiempo límite + entrega auto ✅
6. Pantalla de revisión final   ✅
7. Referencia legal             ✅  (31 ago)
8. Notas personales             ✅  (31 ago)
```

**P3 queda cerrada.** Los dos últimos dejaron de estar bloqueados en cuanto se
ejecutó el DDL: ver más abajo.

**El hallazgo que más importa de los cuatro:** el blanco se guardaba como
fallo. La nota ya lo trataba como neutro desde el 27 ago, pero al escribir en
`question_attempts` caía en `is_correct: false`. El mismo examen daba dos
verdades, y el porcentaje de acierto **castigaba no arriesgar** — al revés de
lo que enseña la fórmula del BOE.

Se creía que hacía falta una columna nueva. No hacía falta: `selected_index`
llevaba declarada desde siempre y **nadie la escribía**. Ver la regla 24 de
`CLAUDE.md` para los tres estados y por qué `null` no puede significar «en
blanco».

Lo demás, en las reglas 25 (el reloj) y 26 (entregar no puede estar a un clic
de avanzar).

### Repasar lo fallado — nuevo, no estaba en el plan

Salió de una pregunta directa: *«¿existe algún lugar donde poder ver falladas
etc… para repasar?»*. No existía, y era el agujero más caro: la plataforma
sabía exactamente qué había fallado cada alumno **y por qué** —el diagnóstico
del error es obligatorio, y casi ninguna plataforma del sector lo pide— y ese
dato se recogía y se moría en la tabla.

Pestaña propia, justo después del test. Agregación en
[`app/lib/review.ts`](../app/lib/review.ts), pantalla en
`app/components/student/modules/review/FailedQuestions.tsx`.

### P2 · Escribir preguntas a mano — cerrada

Era lo siguiente con más valor y no necesitaba esquema. Botón **Nueva** en el
Banco Maestro, con dos pestañas:

- **Escribir una**: tema, enunciado, tres opciones marcando la válida,
  justificación y dificultad. Entra directamente como `active` —la escribe un
  administrador sobre su propio temario— y con `origin: 'manual'`, que es lo
  que permitirá comparar después qué rinde mejor, lo escrito a mano o lo
  generado. El tema y la dificultad se conservan al guardar: escribir diez
  seguidas no obliga a elegirlos diez veces.
- **Importar una hoja**: el CSV se lee en el navegador y viaja ya troceado. Se
  ve antes de importar cuántas están listas, cuántas repetidas y **cuáles se
  rechazan, con su línea y el motivo**. Hay plantilla descargable.

Lo que salió sin estar previsto está en el *Estado de P2* de
[`PLAN-PRODUCTO.md`](PLAN-PRODUCTO.md): la huella `question_hash` estaba
copiada dos veces, el tipo `origin` mentía sobre lo que se guarda de verdad, y
la guarda de `ignoreDuplicates` solo miraba un fichero de los dos que ahora
escriben en el banco.

### Los dos guiones de P3 · escritos, ejecutados y comprobados

| Guion | Qué hace | Estado |
|---|---|---|
| [`P3.7-referencia-legal-de-la-pregunta.sql`](sql/P3.7-referencia-legal-de-la-pregunta.sql) | `legal_reference text` en `question_bank` | ✅ 31 ago |
| [`P3.8-notas-personales.sql`](sql/P3.8-notas-personales.sql) | tabla `question_notes` con RLS de propietario | ✅ 31 ago |

Comprobado **contra la base de datos real**, no contra la pantalla del editor:

- `question_bank` acepta un insert con `legal_reference`, y `question_notes`
  acepta insert y update — los dos caminos nuevos están ahora en
  `npm run smoke`, que inserta una fila de verdad y la borra.
- La clave pública **no** puede escribir en `question_notes`: devuelve
  `42501 new row violates row-level security policy`.
- El join `question_notes → question_bank` resuelve, así que la clave ajena
  está declarada de verdad (sin ella PostgREST no lo resolvería).

### P3.7 y P3.8 · el código

**7 · La referencia legal.** Cambió más de lo previsto, y para bien: no era
rellenar una columna, era cambiar **de dónde sale el contexto**. La generación
tomaba una ventana aleatoria de 12.000 caracteres del documento entero, así que
ni sabía de qué artículo hablaba. Ahora `elegirContexto` elige un fragmento
—que desde P1b es un artículo, con su referencia arreglada en P1f— y guarda de
cuál sale. El alumno la ve en el feedback del entrenamiento y en el repaso de
fallos. Para los apuntes, que no tienen artículos, se mantiene el respaldo sobre
el texto completo.

**8 · Las notas.** Un recuadro suyo en el feedback y en cada tarjeta del repaso,
que vuelve a salir con la pregunta. La miga está en un sitio inesperado: la
aplicación entra con la clave de servicio, que **salta RLS**, así que el filtro
por usuario de cada consulta es la única barrera de verdad. Hay un test estático
que lo vigila.

### P4 · Los módulos, cerrada

La pregunta que llevaba la fase parada desde el 27 de agosto tenía respuesta:
*«que se pueda apagar cualquiera»*. Pestaña **Módulos** en el panel, con los
ocho interruptores.

Lo que importa no es el interruptor: **apagar un módulo lo apaga también en el
servidor**. Filtrar el menú no es una medida de seguridad — una Server Action es
un endpoint público, y las de IA se pagan por llamada.

No se hizo el rol `superadmin`, a propósito: con una academia, el admin eres tú.

---

## El chat: de «no consta» a responder de verdad

Es lo que más cambió, y no salió de un plan: salió de que el dueño probó el chat,
le dio una respuesta indefendible y preguntó *«¿tú crees que una IA que tenga
este PDF puede responder así de mal?»*. La respuesta era no. Lo que sigue es todo
lo que hubo detrás.

### La respuesta que lo destapó

Pregunta: **«¿cuántos artículos tiene la Constitución?»**. Contestó *«no consta
en el temario oficial aportado»*, **pegó seis citas** —[1] a [6]— para respaldar
que no sabía nada, y a continuación soltó cuatro «trampas de examen» sobre la
reforma constitucional, que nadie había preguntado. Todo precedido de
*«ASPIRANTE, PROCEDO A ANALIZAR SU CONSULTA»*.

**El modelo no se equivocaba: obedecía.** Cuatro normas del prompt lo obligaban:

| Norma del prompt viejo | Lo que producía |
|---|---|
| `CITAS OBLIGATORIAS` | seis citas detrás de un «no consta» |
| `CIERRE OBLIGATORIO` | las trampas aunque no hubiera respondido |
| `TONO: Militar` | la fórmula de tratamiento |
| `ESTRUCTURA` fija | un dato de una línea servido como ficha de 400 palabras |

Ahora todo es **proporcional y condicional**: la respuesta en la primera línea,
la longitud la marca la pregunta, las citas solo si se usa la fuente y el cierre
solo si hay una confusión real. Una sección de relleno no es neutra: **enseña al
alumno a saltársela**, y el día que traiga algo importante ya no la lee.

Y el prompt se mudó a [`app/lib/chat.ts`](../app/lib/chat.ts) (`buildChatPrompt`).
No es purismo: un prompt que solo se ejecuta en producción es un prompt que nadie
revisa, y ese llevaba meses así con todos los tests en verde.

### Lo que el troceado había destruido

Con el prompt arreglado, seguía sin poder contestar. Y el motivo era de fondo:
**ningún fragmento del texto dice cuántos artículos hay**, porque una norma no se
cuenta a sí misma. El buscador devolvía los artículos de reforma —lo más parecido
a una pregunta sobre «la Constitución» en abstracto— y el modelo hacía lo único
honesto con lo que tenía.

Se taparon tres agujeros, y conviene saber que **los tres eran rodeos**:

1. **El índice.** Desde P1b cada fragmento sabe de qué artículo viene, así que
   contarlos responde la pregunta. Entra como una fuente más, etiquetada
   *«recuento de lo indexado, no texto de la norma»*, y si faltan artículos en el
   rango el número se da como **mínimo**.
2. **El artículo exacto.** Si la pregunta nombra un artículo, se trae por su
   referencia. Confiar en que el embedding distinga el 27 del 127 no vale.
3. **La estructura.** *«¿Cuántos títulos tiene?»* volvía a caer en «no consta»:
   `document_chunks.reference` guarda el artículo y nada más. Los encabezados sí
   están en el texto guardado.

**Dos trampas de la estructura, las dos vistas en el BOE de verdad:** el PDF trae
su propio índice al principio, así que cada encabezado sale dos veces (contar
apariciones daría el doble); y los nombres de capítulo se repiten entre títulos
—hay un «CAPÍTULO PRIMERO» en el Título I, otro en el III y otro en el VIII—, así
que se cuentan como pares título→capítulo, lo que además absorbe la duplicación.

**Y el temario no numera igual en todas partes.** La Constitución escribe
*«Artículo 82»* y la LOFCS *«Artículo cuarenta y uno»*. Con el lector de cifras a
secas, el índice contaba **cero** artículos en la LOFCS y la describía como «no es
un texto legal articulado» — una ley de 54.

Medido contra la base de datos: Constitución **169 artículos (1–169) sin huecos**,
11 títulos, 11 capítulos y 15 disposiciones; LOFCS **54 (1–54) sin huecos**, 5
títulos y 18 disposiciones; el tema 40, apuntes, sin artículos ni títulos — que es
lo correcto.

### El cambio que hizo innecesario casi todo lo anterior

La pregunta del dueño fue la buena: *«¿por qué no toma directamente el PDF
completo y responde como una inteligencia de verdad?»*. Se midió
([`scripts/medir-contexto.mjs`](../scripts/medir-contexto.mjs)):

| | tokens |
|---|---|
| Constitución completa | 35.009 |
| El temario entero (3 documentos) | 72.355 |
| Lo que admite `gemini-2.5-flash` | 1.048.576 |

**El temario entero ocupa el 6,9 % de la ventana.** El troceado en fragmentos de
mil caracteres era obligatorio cuando un modelo aceptaba 8.000 tokens; hoy es lo
que destruye la información que después hay que reconstruir a mano. Con el
documento delante, el modelo responde *«el Título I comprende los artículos 10 a
55»* sin que nadie le prepare nada — justo la pregunta que media hora antes se
había dicho que necesitaba guardar la jerarquía al indexar.

**De la búsqueda semántica se queda ELEGIR.** Los fragmentos siguen siendo la
forma barata de saber *de qué documento* habla la pregunta; lo que cambia es que,
una vez elegido, se manda entero.

### Elegir es ahora el punto débil, y ya fallaba con tres documentos

*«¿Qué artículos comprende el Título I de la Constitución?»* seleccionaba la **Ley
de Fuerzas y Cuerpos de Seguridad**, porque sus fragmentos sobre títulos y
artículos se parecen más a esa frase que el articulado de la Constitución. La
pregunta lo decía y nadie la escuchaba. Con 85 temas eso deja de ser un fallo
ocasional para ser la norma.

Dos capas, en este orden:

- **Si la pregunta nombra el tema, se acabó adivinar** (`documentosNombrados`,
  delante del parecido).
- **Y si el alumno lo elige, ni eso:** el chat tiene un **desplegable de tema**,
  como ya lo tienen los tests. Con tema puesto se mandan sus documentos enteros y
  **no se paga ni el embedding** — la mitad de las llamadas de pago de cada
  mensaje. Solo salen los temas con documento cargado: uno vacío ahí sería una
  promesa que la plataforma no puede cumplir.

Probado con el selector en la Constitución, y en elíptico (sin nombrarla):

| Pregunta | Respuesta |
|---|---|
| ¿Cuántos artículos tiene? | 169, del 1 al 169 |
| ¿Qué artículos comprende el Título I? | Del 10 al 55 |
| ¿Puede el Rey disolver las Cortes? | Sí, en los términos previstos — art. 62.b |
| ¿Cuántos capítulos tiene el Título VIII? | 3 |
| ¿Cuál es la capital de Francia? | No consta — una línea |

### Cómo se revisa esto sin entrar en la aplicación

Dos guiones, los dos de pago porque preguntan de verdad:

```bash
npm run chat:probar                                   # las preguntas de siempre
npm run chat:probar -- --tema=39 "¿cuántos artículos tiene?"
node scripts/medir-contexto.mjs                       # cuánto ocupa el temario
```

Usan **el mismo prompt y el mismo camino de recuperación** que la aplicación, así
que lo que sale ahí es lo que verá el alumno. Los tests de `chat.test.ts` vigilan
otra cosa: que las normas del prompt viejo no vuelvan a colarse.

### Lo que queda abierto del chat

- **El coste.** Una pregunta sobre la Constitución pasa de ~3.000 a ~35.000
  tokens de entrada. Lo que lo sostiene es que solo se manda *el documento que
  hace falta* —nunca el temario entero— y que la cuota por usuario ya existe. Con
  tema elegido, además, se ahorra el embedding.
- **Con 85 temas**, el coste por pregunta **no crece**: siguen haciendo falta uno
  o dos documentos. Lo que no cabría es mandarlos todos, y por eso están los topes
  `MAX_DOCUMENTOS_ENTEROS` y `MAX_CHARS_DOCUMENTOS`. Lo que no cabe **no se
  parte**: viaja en fragmentos.
- **Si nadie usa «todo el temario»**, se puede tirar la búsqueda semántica entera
  —embeddings, fragmentos e índice— y quedarse con tema + documento. Sería mucho
  menos código. Es una decisión que ahora se puede *medir* en vez de opinar.
- **La jerarquía al indexar** se pidió y **no se hizo**: después de medir era una
  columna, una reindexación y más piezas para llegar donde el documento entero
  llega solo. Queda anotado por si se quiere igualmente.
- **Un fleco de estilo:** alguna respuesta mete el artículo dentro del corchete
  (`[1, Art. 62.b]`) cuando el prompt pide que ahí vaya solo el número. El dato es
  correcto; se aprieta en una línea si molesta al verlo.

---

## Estado de las comprobaciones

| Qué | Cómo está |
|---|---|
| `npm run check` | ✅ 581 tests, typecheck limpio |
| `npm run smoke` | ✅ los 7 caminos de escritura entran contra el proyecto real |
| `npm run build` | ✅ |
| Guardas estáticas nuevas | ✅ comprobadas rompiéndolas a propósito |
| Consulta del repaso contra la BD real | ✅ el join resuelve las 17 filas falladas con opciones y respuesta correcta |
| **Las pantallas nuevas, vistas funcionando** | ❌ **no** |

Lo último es la deuda honesta de esta tanda: **verde no es lo mismo que visto**.
Para verlo hace falta una sesión de alumno, y una sesión pide contraseña.

Sin ver quedan: el botón de dejar en blanco y la tecla `0`, la cuenta atrás y
la entrega automática al llegar a cero, la pantalla de revisión antes de
entregar, la pestaña de Repasar fallos, **el alta manual y la importación de
preguntas** (P2), **la pestaña de Módulos** (P4) y **el desplegable de tema del
chat**. El servidor de desarrollo arranca y la portada carga sin errores en
consola; a partir del login hace falta contraseña.

> Del chat sí se ha visto lo que importa, aunque no en pantalla: `npm run
> chat:probar` le pregunta de verdad, con el mismo prompt y la misma
> recuperación, y las respuestas están arriba.

> Para entrar como alumno sin fricción: cambiar `profiles.role` a `student` un
> momento con la clave de servicio y devolverlo a `admin` al terminar.

---

## El cuello de botella real

**No es el código, es el esquema.** El DDL sólo lo puede ejecutar el dueño del
proyecto desde el editor SQL de Supabase, y hay cosas paradas por eso.

Lo que **no** hay que hacer es adelantar el código: PostgREST rechaza la
escritura **entera** si una sola columna no existe, así que escribir contra una
columna que aún no está rompe el guardado en producción. Es el fallo que este
repositorio ya ha pagado tres veces.

Lo que sí: dejar el guion en `docs/sql/` con el *porqué* dentro, y seguir por
otra parte. Así se hizo con
[`P3-blanco-no-es-fallo.sql`](sql/P3-blanco-no-es-fallo.sql), que quedó como
endurecimiento **opcional** — el código funciona igual con o sin él.

---

## Por dónde seguir

1. **Entrar y verlo.** Es lo único que separa «pasa los tests» de «funciona».
   Por orden de lo que más se nota: el desplegable de tema del chat, la pestaña
   de Módulos, el alta manual de preguntas y la pantalla del test.
2. **P5 está hecha en parte** (31 ago): pestaña *Academia* con quién ha abandonado,
   la ficha de cada alumno y la cobertura del temario. Lo primero que enseñó al
   conectarla a los datos reales: **43 de los 45 temas no tienen ni una pregunta**.
   Falta lo que manda correos (invitar) y lo que necesita esquema (agrupar por
   clase).
3. **Decidir sobre la búsqueda semántica.** Si con el selector de tema nadie usa
   «todo el temario», sobra: se puede retirar embeddings, fragmentos e índice, y
   el chat se queda en tema + documento. Es una decisión que ahora se puede
   medir en vez de opinar.
4. **P6 (cobros)** sigue aplazado hasta después del piloto, como se decidió.

---

## Pendiente del dueño

- **Probar en producción entrando como alumno.** Es lo único que separa «pasa
  los tests» de «funciona», y a estas alturas es lo único que queda de estas dos
  tandas.
- **Login con Google**: aplazado por decisión propia. Necesita credenciales
  OAuth de Google Cloud.
- **Subir más temario.** Hay 45 temas dados de alta y solo 3 con PDF. El chat y
  el banco de preguntas valen exactamente lo que valga el temario cargado.

Resuelto el 31 de agosto, y ya no hace falta hacer nada con ello:

- ~~32 preguntas esperando en Moderación~~ → aprobadas. El banco tiene **67
  activas y 0 pendientes**.
- ~~Decidir sobre `atenea-jw3h`~~ → borrado. Se comprobó antes que la URL de
  producción cuelga del proyecto `atenea`, no de él.
- ~~Qué módulos querría apagar la academia~~ → *cualquiera*. P4 cerrada con los
  ocho interruptores.

> **Ojo con `Confirm email`:** sigue activado en Supabase. Quien se registre no
> podrá entrar hasta pulsar el enlace del correo, y en el plan Free el envío es
> limitado.

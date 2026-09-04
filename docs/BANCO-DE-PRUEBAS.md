# El banco de pruebas de la interfaz

Levanta la interfaz **entera** —alumno y administración— en un navegador de
verdad, a tamaño de móvil, con las 48 Server Actions sustituidas por datos de
prueba. Sin Supabase, sin Gemini y sin sesión.

```bash
cd .banco-pruebas
node compilar-css.mjs          # Tailwind del proyecto -> estilos.css
node construir.mjs             # empaqueta la interfaz con las acciones falsas
python3 -m http.server 8899    # y se abre http://localhost:8899/index.html

node todas-las-pantallas.cjs   # LAS 19 PANTALLAS, una por una. Empieza por aquí.
node recorrido.cjs             # el camino del examen: scroll, Atrás, reanudar
node examen-completo.cjs       # un examen entero, las dos modalidades, hasta la nota
node tactiles.cjs              # solo lo que no llega a 44px
node invisibles.cjs            # lo que pide un tamaño y se pinta a 0x0
node contraste.cjs             # texto que no se lee, medido contra su fondo real
node comparar-formas.mjs       # en qué se desvía cada stub de su acción
node zoom.cjs                  # una captura ampliada de un trozo concreto
```

`?vista=admin` abre el panel de administración en vez del alumno.
Las capturas van a `.banco-pruebas/tomas/`.

## Por qué existe

Durante muchas iteraciones la interfaz se corrigió **a ciegas**: leyendo el
código, razonando sobre CSS y pidiendo capturas de pantalla. Así se arreglaron
cosas, pero se colaron otras que solo se ven usando la aplicación, y algunas las
introdujeron esas mismas correcciones.

Lo que ha encontrado, por orden de aparición:

| Fallo | Dónde |
|---|---|
| `NaN` en el panel: "NaN documentos indexados" | `AdminContent`, sumaba `docCount` sin comprobarlo |
| Un `<select>` de 731px de ancho en una pantalla de 390 | `FlashcardDeck`, un desplegable nativo crece con su opción más larga |
| La cabecera del examen se salía 16px por cada lado | `ActiveTest`, un `-mx-4` que compensaba un relleno que en modo zen no existe |
| "CONTESTAD…" cortado por tres píxeles | `StatTile` |
| "INTELIGENCIA" y "OPERACIONES" pisándose | `MobileNav`, `flex-1` sin `min-w-0` |
| Trece controles por debajo de los 44px táctiles | Todo el panel de administración |
| La barra de progreso del examen, a 0x0 desde siempre | `ActiveTest`, un `<span>` inline ignora `width` y `height` |
| El recuadro de escribir del chat, 22px por debajo de la barra de pestañas | `IntelChat`, un `100dvh-140px` a ojo cuando eran 162 |
| El panel de academia se arrastraba de lado (470px en 390) | Un hijo de `grid` sin `min-w-0`: `truncate` no trunca, el contenedor crece |
| El mapa de preguntas del simulacro, 12px de alto y 18px por segmento | `ActiveTest`: se podía ver, no pulsar |
| El registro de actividad, filas de 634px | `AdminActivity`, el mismo `min-w-0` que faltaba |
| Tres módulos con DOS cabeceras seguidas, 300px antes de nada | Drills, Prep. Física, Perfilado |
| El plan de entrenamiento tapado por la barra de pestañas | `sticky bottom-6` en un móvil cae dentro de la navegación |
| "EJECUTAR" cortado por el borde de su propia tarjeta | El generador de preguntas: `overflow-hidden` recorta y la página no crece, así que nada lo delataba |
| El compositor de preguntas, ilegible en modo claro | Campos casi negros con texto blanco dentro de un diálogo blanco |
| 80 textos por debajo de 3:1 de contraste | Sobre todo `text-slate-400` sobre blanco y `text-slate-600` sobre el panel oscuro |
| "Vaciar banco" pegado a "Nueva", igual de grande | La acción más destructiva a 12px del botón de crear (regla 26) |

Ninguno se veía leyendo el código.

## Qué comprueba cada guion

**`todas-las-pantallas.cjs`** — las 19: los ocho módulos del alumno, las siete
secciones del panel, las subpantallas que no son una pestaña (el corredor de
las pruebas físicas, la sala de voz) y el plan de entrenamiento. En cada una:

- **Lo que se sale de la pantalla**, pero solo si de verdad provoca scroll
  horizontal Y no está recortado por un contenedor con scroll propio. Sin ese
  segundo filtro, seis de cada siete avisos eran la fila de pestañas del panel
  —que se arrastra a propósito— y el culpable de verdad quedaba enterrado.
- **El texto cortado** por no caber, con cuántos píxeles le faltan.
- **El área táctil**, contra el mínimo de 44px.
- **Lo que pide un tamaño y se pinta a 0x0** (ver abajo).
- **Que el módulo no se haya caído.** Busca el texto exacto de
  `ModuleErrorBoundary`. Lo tuvo mal un tiempo y por eso una pantalla de repaso
  que reventaba entera se contaba como "0 problemas".
- **Los errores de consola.** Se envuelve `console.error` DENTRO de la página:
  desde fuera, `m.text()` de un error con formato devuelve la plantilla, así que
  el resumen decía "2 fallos de JavaScript" y los imprimía como `%o` y `%s`.

**`recorrido.cjs`** — comportamiento, no píxeles:

- **El scroll al cambiar de pantalla.** Baja del todo, cambia de pestaña y
  exige que la nueva empiece arriba. Es el fallo que se notaba en toda la
  aplicación: la barra de pestañas vive abajo, así que al pulsarla vas siempre
  con la página bajada y entrabas en la siguiente por el final.
- **Que un examen sobreviva.** Empieza un test, responde, recarga la página y
  exige que ofrezca reanudarlo. En simulacro no se guarda nada en la base de
  datos hasta entregar, así que sin esto una recarga se llevaba cuarenta
  minutos.
- **El botón Atrás.** Comprueba que vuelve a la pestaña anterior en vez de
  salir de la aplicación.

**`examen-completo.cjs`** — el examen de principio a fin, en las dos
modalidades: entrenamiento (corrige al momento, con diagnóstico obligatorio del
fallo) y simulacro (navegación libre, revisión y entrega). Termina imprimiendo
**lo que ve el alumno en la pantalla de la nota**, que es de lo que más se
acuerda un opositor y era lo último que se había mirado.

**`invisibles.cjs`** — elementos que **piden** un tamaño (`h-1.5`, `w-full`,
`w-[3rem]`…) y se pintan a **0x0**. No es lo mismo que "no se ve": esto es CSS
que se escribió, se leyó como correcto y el navegador ignoró.

El caso que lo motivó: la barra de progreso del examen era un `<span>` con
`h-1.5 w-full`. Un `<span>` es `inline` por defecto, y **un elemento inline
ignora `width` y `height`**. La barra medía 0x0, así que en el simulacro
—donde además es el mapa de preguntas— se navegaba a ciegas. Estuvo así desde
que existe la pantalla y no lo delató ningún test: las clases eran correctas una
por una. No se puede detectar leyendo el código, porque dentro de un contenedor
flex los hijos se "bloquifican" y el mismo `<span>` sí funciona.

Un tamaño puesto **a cero a propósito** no cuenta: una barra de progreso al 0 %
mide 0 y está bien.

## Qué comprueba `contraste.cjs`

El contraste real de cada texto contra el fondo que de verdad tiene detrás,
con la fórmula de la WCAG, en las 19 pantallas y en los diálogos.

Existe por el compositor de preguntas (alta manual, P2): se escribió con la
paleta del panel de administración —que es oscura siempre— pero vive dentro
del `Modal` del sistema de diseño, que **sigue el tema del usuario**. En un
móvil en modo claro quedaban recuadros casi negros con texto blanco dentro de
un diálogo blanco, y las opciones B y C eran gris sobre gris. **Ilegible, en la
pantalla donde se escriben las preguntas a mano.** No lo veía nada: las clases
eran correctas una por una, el elemento tenía su tamaño y el texto no se salía
de ningún sitio. Hay que medirlo.

Dos cosas que el detector tuvo que aprender, y las dos costaron un rato:

- **Tailwind v4 emite `oklch()`.** Con un regex de `rgb()`, todo color de
  Tailwind salía `null`, el detector se saltaba ese fondo y subía hasta el
  `<body>` blanco: decía que el panel de administración —que es negro— tenía
  texto blanco sobre blanco. 71 avisos, todos falsos. Se resuelve pintando el
  color en un canvas de 1×1 y leyendo el píxel: la conversión la hace el
  navegador, que es quien sabe.
- **Un degradado no tiene un color.** Si algún ancestro trae `background-image`
  no se puede medir, y adivinarlo daría avisos inventados: ahí no se opina.

El umbral es **3:1** y no el 4.5:1 de la WCAG a propósito. Esto no es una
auditoría de accesibilidad, es un detector de "esto no se ve": con 4.5 salen
cientos de avisos de texto de apoyo que está bien como está, y una guardia que
se queja de lo razonable acaba desactivada.

Medido: de **80 textos por debajo de 3:1 a 0**.

## Que el banco no pueda mentir: `formas.ts`

`acciones-falsas.ts` tiene que exportar cada acción **con la forma exacta que
devuelve la de verdad**. Si no, la pantalla se pinta con `undefined` y el banco
da por buena una pantalla que en producción no lo es. Pasó tres veces:

- `getAcademyOverview` en inglés (`coverage`, `students`) cuando la de verdad
  usa `cobertura` y `alumnos`: **Academia se caía entera**.
- `getFailedQuestions` devolvía `{ data }` en snake_case y la de verdad devuelve
  `{ success, items, byTopic }` en camelCase: `res.items` era `undefined`, así
  que **la pantalla de repaso salía siempre vacía** y el módulo entero no lo
  había visto nadie con datos.
- `getDocumentChunks`, `getGlobalActivity`, `getActiveTrainingPlan` y
  `generateNextWeek` devolvían `data` donde la acción devuelve `chunks`,
  `activity` y `plan`. Tres pantallas más, vacías siempre.

Ahora es un **error de compilación**. [`formas.ts`](../.banco-pruebas/formas.ts)
compara, a nivel de tipos, las claves obligatorias de la rama de éxito de cada
stub contra las de su acción. `npm run check` lo comprueba.

Dos decisiones para que sea usable y no ruido:

- **En un solo sentido.** Todo lo que promete la acción tiene que estar en el
  stub; al revés no, porque un campo de más no rompe ninguna pantalla.
- **Solo las claves obligatorias.** Casi todas las acciones declaran
  `error?: string` también en la rama buena; contarla daba 43 falsos positivos.

`comparar-formas.mjs` imprime, campo a campo, en qué se desvía cada uno: el
fichero de tipos dice *cuál*, el guion dice *en qué*.

> Para que esto corra hubo que meter `.banco-pruebas/**/*.ts` en el `include`
> del `tsconfig.json`: **TypeScript se salta los directorios que empiezan por
> punto**, así que el fichero de acciones falsas nunca se había comprobado.

## Lo que NO cubre

- **Los datos de verdad.** Las acciones son de mentira: comprueban que la
  pantalla aguanta la forma de la respuesta, no que la consulta sea correcta.
  De eso se encargan `npm run check` y `npm run smoke`.
- **El servidor.** Nada de RLS, cuotas ni permisos.
- **Safari.** El navegador del banco es Chromium. El zoom de los campos con
  letra menor de 16px es un comportamiento de Safari en iPhone que aquí no se
  reproduce: por eso vive en el sistema de diseño y lo vigila un test estático
  (`tests/design-system.test.ts`), no el banco.

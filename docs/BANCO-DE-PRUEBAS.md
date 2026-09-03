# El banco de pruebas de la interfaz

Levanta la interfaz **entera** —alumno y administración— en un navegador de
verdad, a tamaño de móvil, con las 48 Server Actions sustituidas por datos de
prueba. Sin Supabase, sin Gemini y sin sesión.

```bash
cd .banco-pruebas
node compilar-css.mjs          # Tailwind del proyecto -> estilos.css
node construir.mjs             # empaqueta la interfaz con las acciones falsas
python3 -m http.server 8899    # y se abre http://localhost:8899/index.html
node recorrido.cjs             # el recorrido completo, con sus comprobaciones
node tactiles.cjs              # solo lo que no llega a 44px
```

`?vista=admin` abre el panel de administración en vez del alumno.

## Por qué existe

Durante muchas iteraciones la interfaz se corrigió **a ciegas**: leyendo el
código, razonando sobre CSS y pidiendo capturas de pantalla. Así se arreglaron
cosas, pero se colaron otras que solo se ven usando la aplicación, y algunas las
introdujeron esas mismas correcciones.

En cuanto existió el banco, la primera ejecución encontró en dos minutos:

| Fallo | Dónde |
|---|---|
| `NaN` en el panel: "NaN documentos indexados" | `AdminContent`, sumaba `docCount` sin comprobarlo |
| Un `<select>` de 731px de ancho en una pantalla de 390 | `FlashcardDeck`, un desplegable nativo crece con su opción más larga |
| La cabecera del examen se salía 16px por cada lado | `ActiveTest`, un `-mx-4` que compensaba un relleno que en modo zen no existe |
| "CONTESTAD…" cortado por tres píxeles | `StatTile` |
| "INTELIGENCIA" y "OPERACIONES" pisándose | `MobileNav`, `flex-1` sin `min-w-0` |
| Trece controles por debajo de los 44px táctiles | Todo el panel de administración |

Ninguno se veía leyendo el código.

## Qué comprueba `recorrido.cjs`

No es un test de píxeles. Comprueba **comportamiento**:

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
- **Lo que se sale de la pantalla**, pero solo si de verdad provoca scroll
  horizontal: un adorno recortado por `overflow-hidden` sobresale del
  rectángulo y no es un fallo.
- **El texto cortado** por no caber, con cuántos píxeles le faltan.
- **El área táctil**, contra el mínimo de 44px.

## Lo que NO cubre

- **Los datos de verdad.** Las acciones son de mentira: comprueban que la
  pantalla aguanta la forma de la respuesta, no que la consulta sea correcta.
  De eso se encargan `npm run check` y `npm run smoke`.
- **El servidor.** Nada de RLS, cuotas ni permisos.
- **Safari.** El navegador del banco es Chromium. El zoom de los campos con
  letra menor de 16px es un comportamiento de Safari en iPhone que aquí no se
  reproduce: por eso vive en el sistema de diseño y lo vigila un test estático
  (`tests/design-system.test.ts`), no el banco.

## Al añadir una acción nueva

`acciones-falsas.ts` tiene que exportarla, **con la forma exacta que devuelve la
de verdad**. Si no, la pantalla revienta al montarse — que es justo lo que pasó
con `getAcademyOverview`: el stub la escribió en inglés (`coverage`,
`students`) y la de verdad usa `cobertura` y `alumnos`, así que Academia se caía
entera. Merece la pena mirarlo: si tu stub tiene que mentir para que la pantalla
funcione, probablemente la pantalla no aguanta lo que el servidor puede
devolverle.

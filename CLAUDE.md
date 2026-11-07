# Campus Alphapol (repo `atenea`) — guía para trabajar aquí

Plataforma para preparar la oposición a Policía Nacional (Escala Básica), de la
academia **Alphapol** (Málaga). Producción: https://atenea-eight.vercel.app
(cada push a `main` despliega solo). Next.js 16 (App Router) · React 19 ·
Supabase · Gemini · Tailwind 4 · Vercel · Resend.

**Habla siempre en castellano** con el dueño: respuestas, commits y documentos.

## Qué leer y cuándo

| Fichero | Para qué |
|---|---|
| [`docs/TRASPASO.md`](docs/TRASPASO.md) | **Empieza aquí.** Qué está hecho, qué falta y cómo probar (BD real, IA, despliegue) |
| [`docs/REGLAS.md`](docs/REGLAS.md) | El porqué de cada regla de la tabla de abajo. **No lo leas entero:** busca `### N ·` de la zona que toques |
| `supabase/schema.json` | El esquema REAL. Míralo antes de tocar cualquier tabla |
| [`docs/PLAN-PRODUCTO.md`](docs/PLAN-PRODUCTO.md) | El plan de producto (P1-P15). Casi todo hecho; consultar antes de abrir una fase |
| [`docs/HISTORIAL.md`](docs/HISTORIAL.md) | La tabla de estado de fase en fase (ago-nov 2026). Solo si hace falta saber cuándo se hizo algo |
| [`docs/BANCO-DE-PRUEBAS.md`](docs/BANCO-DE-PRUEBAS.md) | Las pantallas en un navegador de verdad, sin BD |

## Cómo se trabaja

1. **`npm run check`** (typecheck + ~1.200 tests) antes de cada commit, y
   **`npm run build`** si tocas la app (necesita las 4 variables de
   `.env.example`, que pueden ser inventadas). CI ejecuta los dos.
2. **Verde no es visto** (regla 38). Una pantalla cambiada se mira en el banco
   de pruebas o en la app local contra la BD real (`docs/TRASPASO.md` §4).
3. **Un test que vigila algo se comprueba rompiendo el código a propósito**:
   si no falla, no sirve. Los tests estáticos leen el código sin comentarios
   (`stripComments`).
4. **Esquema primero:** guion en `docs/sql/` → ejecutado →
   `node scripts/schema-snapshot.mjs` → código. PostgREST rechaza la escritura
   ENTERA si falta una columna.
5. **La BD es la de producción.** Deshaz lo que crees al probar, nunca borres
   datos reales, y si subes de rol una cuenta de prueba, devuélvela.
6. **Ramas:** se trabaja en la rama de la sesión; a `main` solo cuando el dueño
   pida desplegar. Nada de identificadores de modelo en commits.
7. **Al terminar algo:** su regla nueva va al final de `docs/REGLAS.md` (con
   número), su línea en la tabla de abajo, y el estado en `docs/TRASPASO.md`.

## Comandos

```bash
npm run dev                 # webpack (Turbopack no resuelve tailwind en dev)
npm run check               # typecheck + tests
npm run build
npm run lint                # ~18 errores, todos el falso positivo de set-state-in-effect (useEffect que carga datos)
npm run smoke               # escribe una fila real por camino de escritura y la borra
npm run cuenta -- correo 'clave' student   # cuenta con el correo ya confirmado
npm run reset               # ensayo de vaciar respuestas/banco (docs/RESET-Y-SIEMBRA.md). `-- --hazlo` borra
npm run sembrar             # indexa los PDF del temario y llena el banco (de pago; `-- --comprobar-pdfs` gratis)
npm run chat:probar         # qué contesta el chat de verdad (de pago; el chat está fuera del MVP)
npm run limpiar             # ensayo de dejar la BD solo de Alphapol (regla 81). `-- --hazlo` borra
npm run sembrar:peso -- --ensayo           # qué preguntas generaría (regla 78). Sin --ensayo, de pago
npm run sesion:adaptativa -- correo 20     # la sesión que el motor le montaría a un alumno (gratis)
node scripts/schema-snapshot.mjs           # refresca supabase/schema.json
node scripts/marca/iconos.mjs              # regenera los iconos desde los SVG (regla 88)
scripts/nube/sql.sh "select …"             # SQL contra la BD real desde la nube
scripts/nube/arrancar-local.sh             # app en :3100 contra la BD real desde la nube
```

## Mapa del código

```
app/actions/      Server Actions (endpoints PÚBLICOS), una por dominio. core.ts = clientes (server-only)
app/lib/          lógica pura y testeable (stats, scoring, scheduler, baremo, rm…) + auth.ts + marca.ts
app/components/
  ui/             el sistema de diseño: TODO lo que se pinta sale de aquí (regla 36)
  auth/           carga y pantallas de entrada (marca, no siguen el tema: reglas 87 y 90)
  student/        el panel del alumno, un módulo por pestaña
  Admin/          el panel de administración (una pestaña por fichero)
  fisica/         calendario, planificador, sesiones, marcas y 1RM (regla 86)
docs/sql/         cada cambio de esquema, con su porqué
tests/            Vitest. Muchos son guardas estáticas sobre el código
.banco-pruebas/   la app con acciones falsas, para Playwright
scripts/          operación (siembra, limpieza, cuentas), esquema, marca, nube
```

## Lo imprescindible (si no lees nada más)

- **Seguridad.** Una Server Action es un endpoint HTTP público. El usuario sale
  de `requireUser()`/`requireAdmin()`/`requireSuperadmin()` (devuelven
  resultado, no lanzan), **nunca** de un parámetro (1). Nada de `...formData`
  sobre una fila: lista blanca (2). Un fichero `'use server'` solo exporta
  `async function`: ni tipos ni constantes (53).
- **Dos clientes de Supabase.** Lo del alumno va con su sesión
  (`createSupabaseServerClient`, RLS lo protege); lo compartido y lo de
  administración, con la clave de servicio, que se salta RLS (34). Todo lo de
  administración se acota con `organization_id` **dentro de la consulta** (65,
  75). `rls.test.ts` vigila las dos direcciones.
- **PostgREST corta a 1.000 filas sin avisar:** pagina con `paginaCompleta` y
  `.order('id')` (74).
- **Errores:** `const { error } = await …` siempre; `success: true as const`
  (4).
- **`null` no es `0`.** Un campo vacío es `null` (16). «Sin datos» y «cero» se
  pintan distinto (8).
- **Un blanco no es un fallo.** `selected_index = -1` es blanco y `null` es
  «no se sabe» (24). La nota es la del BOE: cada dos fallos, un acierto menos
  (22).
- **Una fila de `question_attempts` por respuesta** (7). La traducción
  camelCase↔snake_case vive en `toResultRow` (6).
- **Estados de pregunta** en `QUESTION_STATUS`; todo upsert sobre
  `question_hash` con `ignoreDuplicates: true` (3).
- **IA.** La salida se valida antes de guardar (10). Cuota por usuario en la BD
  (20). Solo el superadmin genera (39, 75). Todo `generateContent` lleva su
  `registraGasto` (41). Modelo `gemini-3.5-flash-lite` (92).
- **Interfaz.** Todo sale de `app/components/ui/`: 44 px táctiles,
  `text-base` en los campos, `dvh` y nunca `vh` (36). La marca sale de
  `app/lib/marca.ts` y `app/marca.css`, que remapea `indigo-*` al marino
  (81). Tono de academia, no militar (85).
- **El motor adaptativo** deduce del comportamiento y no pregunta (55, 56, 60,
  73). El test tiene dos modos: entrenamiento sin nota, simulacro sin adaptar
  (59).

## Índice de las reglas

Cada una salió de un fallo real. El detalle, en `docs/REGLAS.md`.

| # | Regla |
|---|---|
| 1 | Ninguna Server Action acepta un identificador de usuario |
| 2 | Nunca expandir un objeto del cliente sobre una fila |
| 3 | Los estados de una pregunta salen de una constante |
| 4 | No tragarse los errores de la base de datos |
| 5 | Nada de leer una columna sin comprobar que existe |
| 6 | El cliente habla camelCase, la base de datos snake_case |
| 7 | Una fila de `question_attempts` por respuesta |
| 8 | La aritmética que se muestra al alumno va en `app/lib/stats.ts` |
| 9 | El troceado de PDFs tiene tres garantías |
| 10 | Lo que devuelve el modelo no vale hasta que se comprueba |
| 11 | En un chat con recuperación, la memoria empieza por la búsqueda |
| 12 | El intervalo de repaso depende solo de la caja |
| 13 | Un `setState` no se puede leer en la línea siguiente |
| 14 | El tiempo sale del reloj, no de contar intervalos |
| 15 | Barajar es Fisher-Yates, nunca `sort(() => Math.random() - 0.5)` |
| 16 | Un campo en blanco es `null`, nunca `0` |
| 17 | Lo que escribe la IA se normaliza al guardarlo y al releerlo |
| 18 | La progresión del entrenamiento decide antes de preguntarle a la IA |
| 19 | Lo que sale hacia el modelo es una lista blanca, nunca la fila |
| 20 | La cuota de IA es por usuario y por ruta, y la lleva la base de datos |
| 21 | La lógica pura vive en `app/lib/`, no dentro de las acciones |
| 22 | La nota del simulacro es la de la convocatoria, no el porcentaje |
| 23 | Las métricas de una pregunta se acumulan, no se reinician |
| 24 | Un blanco no es un fallo, y se distingue con `selected_index` |
| 25 | La duración del simulacro sale del BOE, y el reloj se deriva |
| 26 | Entregar no puede estar a un clic de avanzar |
| 27 | Lo que entra a mano se valida igual que lo que escribe la IA |
| 28 | El contexto con el que se genera una pregunta decide lo que se puede citar |
| 29 | Una nota del alumno es suya, y por eso vive aparte |
| 30 | Hay preguntas del temario que la búsqueda semántica no puede responder |
| 31 | Apagar un módulo tiene que apagarlo también en el servidor |
| 32 | Un prompt que obliga a rellenar secciones produce respuestas absurdas |
| 33 | Se le enseña el documento entero, no seis recortes |
| 34 | Con la clave de servicio, RLS no protege nada |
| 35 | El panel de la academia enseña lo accionable, no lo bonito |
| 36 | Todo lo que se pinta sale de `app/components/ui/` |
| 37 | Una aplicación de una sola ruta tiene que fingir que son varias |
| 38 | Lo que no se ha usado, no funciona |
| 39 | El gasto de IA no lo decide quien no paga la factura |
| 40 | El tope por hora acota la ráfaga; el que acota la factura es el del día |
| 41 | No se afina lo que no se mide |
| 42 | El documento entero se paga solo si el alumno elige tema |
| 43 | Una puerta y un escritorio no hacen el mismo trabajo |
| 44 | Guardar el historial y usarlo como contexto son dos cosas distintas |
| 45 | El panel de administración sigue el tema, menos su barra |
| 46 | «Viene» y «estudia» son cosas distintas |
| 47 | Generar es una sola pregunta con tres respuestas |
| 48 | El entrenador real es otro productor del mismo plan |
| 49 | «Logs» no es un registro si no dice quién |
| 50 | Los datos de la academia no viven solo en la cabeza del dueño |
| 51 | El panel de consumo suma, no cobra |
| 52 | El cobro es en efectivo; el código solo controla el acceso |
| 53 | Un solo panel de alumno: los grupos se asignan DESDE el alumno, y los pagos son una rejilla mensual |
| 54 | Segunda vuelta de P8: cuatro ajustes que pidió el dueño al probarlo |
| 55 | El «Entrenamiento» del test es adaptativo (P10) |
| 56 | Se deduce todo lo deducible; se pregunta solo lo que cambia el plan |
| 57 | Quien tiene preparador de verdad no ve nada de la IA |
| 58 | El chat sale del MVP sin borrar una línea |
| 59 | El test tiene DOS modos y solo dos: entrenamiento mide nada, simulacro no adapta nada |
| 60 | Se DEDUCE cómo respondió el alumno; no se le pregunta |
| 61 | Lo que se hace mientras el alumno lee, ya está hecho cuando pulsa |
| 62 | «Repasar fallos» va por prioridad, no por lista plana |
| 63 | Inicio dice «qué hago hoy»; Estadísticas dice «cómo voy». No se repiten. |
| 64 | La convocatoria la fija el admin; el alumno ve la cuenta atrás |
| 65 | La academia de la sesión se resuelve una vez, no se repite en cada acción |
| 66 | Un aviso de «sin revisar» que salía siempre no avisaba de nada |
| 67 | Confirmar un enlace de correo no es lo mismo que quedar dentro |
| 68 | Los interruptores de físicas eran globales, no por academia |
| 69 | «¿Olvidaste tu contraseña?» no existía |
| 70 | Registrarse ya no da acceso: se solicita, y la solicitud se avisa por correo (P12) |
| 71 | Un solo byte NUL tumba la fila entera, y Postgres no dice por qué |
| 72 | El temario también admite exámenes reales como tema extra |
| 73 | El motor adaptativo v2 aprende del comportamiento, no de etiquetas — y por qué se descartó un diseño más ambicioso |
| 74 | PostgREST corta a 1.000 filas SIN avisar — y el entrenamiento adaptativo llevaba tiempo trabajando con menos de la mitad del histórico |
| 75 | Un admin de academia podía tocar el banco de OTRA academia, o el global entero |
| 76 | El motor adaptativo trabajaba en silencio: el panel de "Alumnos" ya lo dice |
| 77 | «Mi Evolución» sustituye a Estadísticas: una sola pantalla, no datos sueltos |
| 78 | El banco crece donde pesa el examen real, no a cifra plana — y los exámenes oficiales nunca son fuente de preguntas nuevas |
| 79 | La preparación física se prueba con el móvil en la mano, y entrena la prueba oficial |
| 80 | Las dudosas: se marca la duda, y la plataforma dice si compensa contestarlas |
| 81 | La plataforma es de Alphapol: la marca sale de un sitio, y lo de Atenea se fue entero |
| 82 | Asistencia: las sesiones se derivan del horario, y todo va en la hora de la academia |
| 83 | Dar de alta a 100 alumnos no puede depender de mandar 100 correos |
| 84 | El registro del entrenamiento va aparte del plan, por alumno y fecha |
| 85 | La app habla como Alphapol, no como un videojuego de policías |
| 86 | La física como la lleva un preparador: sesiones sueltas, de un grupo o de un alumno |
| 87 | La pantalla de carga es marina como el arranque de Android, y se ve poco |
| 88 | El icono: lo más grande que deja cada sistema, y por eso hay dos |
| 89 | El 1RM: el preparador escribe la carga en %, el alumno la lee en kilos |
| 90 | La puerta de entrada sigue a la pantalla de carga |
| 91 | El panel «Alumnos» no trae las respuestas: le llegan los totales |
| 92 | El modelo de Gemini se cambia antes de que lo apague Google |

## Trampas conocidas

- `npm run build` necesita las 4 variables de entorno (sirven inventadas):
  `core.ts` lanza al importarse si falta alguna.
- Un error de escritura de Supabase no se ve en pantalla: mira el log del
  servidor antes que el navegador.
- Los comentarios del código mienten a veces: fíate del código, y corrige el
  comentario cuando lo veas.
- Los guiones de `docs/sql/` antiguos se escribieron deduciendo el esquema:
  contrasta uno nuevo con `supabase/schema.json`.
- En una sesión en la nube, Node no pasa por el proxy sin `NODE_USE_ENV_PROXY=1`.
- Vercel Hobby, Supabase Free (sin copias de seguridad, 30 correos/hora),
  Resend gratis (100/día) y Gemini de prepago: los límites de hoy
  (`docs/TRASPASO.md` §3a).

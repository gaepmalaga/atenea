# Historial del proyecto

Lo que antes vivía en `CLAUDE.md` y ya es historia: la tabla de estado fase a
fase (de agosto a noviembre de 2026), las tareas del dueño de entonces y el
«cómo continuar» de agosto. Se guarda tal cual estaba, por si hace falta saber
cuándo y por qué se hizo algo. **El estado de hoy está en
[`TRASPASO.md`](TRASPASO.md).**

> Ojo, desactualizado: lo de mandar correo con Gmail (`atenea.alumnos@gmail.com`,
> `SMTP_PASS`) se abandonó el 12 sep. Todo el correo va por **Resend**
> (regla 70 de [`REGLAS.md`](REGLAS.md)).

## Estado actual

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Recuperar el terreno: build, typecheck, tests | ✅ cerrada |
| 1.1 | Sesión verificada en el servidor | ✅ cerrada |
| 1.4 | Asignación masiva en perfiles | ✅ cerrada |
| 2.1 | Ciclo de vida de las preguntas | ✅ cerrada |
| 2.2 | Panel de estadísticas + Error Boundaries | ✅ cerrada |
| 2.3 | Métricas de comportamiento | ✅ cerrada |
| 2.4 | Un resultado por respuesta | ✅ cerrada (el histórico no existía: ver 2.8) |
| 2.6 | Indexado de PDFs | ✅ cerrada |
| **3** | **Calidad de la IA + memoria del chat** | ✅ **cerrada** |
| **1.3** | **Activar RLS** | ✅ **cerrada** (ejecutada el 26 ago 2026) |
| **1.2** | **Acotar la clave de servicio** | ✅ **cerrada** (31 ago): lo del alumno va con su sesión |
| **1.5 / 1.6** | **Cuota por usuario en IA · qué se manda a Gemini** | ✅ **cerradas** (la cuota, ya en la BD: regla 20) |
| **4** | **SRS, analítica e informe de la entrevista** | ✅ **cerrada en parte** |
| **2.7** | **Perfil físico y plan de entrenamiento** | ✅ **cerrada** |
| **5** | **Higiene** | ✅ **cerrada** (0 `any`, lint solo en el falso positivo de `set-state-in-effect`) |
| **2.8** | **Resultados a `question_attempts` + esquema versionado** | ✅ **cerrada** (26 ago 2026) |
| **2.5** | **Dificultad** | ✅ **cerrada** (la columna ya existía: `difficulty_level`) |
| **P1** | **Ingesta fiable del temario** (plan de producto) | ✅ **cerrada** (27 ago 2026) |
| **P3** | **La pantalla del test** (plan de producto) | ✅ **cerrada, 8 de 8** (31 ago) |
| **P2** | **Escribir preguntas a mano** (plan de producto) | ✅ **cerrada** (30 ago) |
| **P4** | **Módulos que se encienden y se apagan** (plan de producto) | ✅ **cerrada** (31 ago) |
| — | **Repaso de lo fallado** | ✅ **hecho** (30 ago) |
| — | **El chat: prompt, documento entero y selector de tema** | ✅ **hecho** (31 ago) |
| **P5** | **Panel de academia** (plan de producto) | ✅ **cerrada**. P5f (agrupar por clase) se **rehízo como P7 y P8** — era muchos-a-muchos. P5e (invitar por correo) queda **aparcado** por decisión del dueño |
| **P6** | **Cobros → control de acceso y pagos** (plan de producto) | ✅ **cerrada** (5 sep): el modelo es cobro EN EFECTIVO en la academia. Panel de consumo de IA + acceso + registro de pagos. Sin pasarela, a propósito. El registro de pagos se **rehízo en P8** (rejilla mensual) |
| **P7** | **Grupos y preparación física** (plan de producto) | ✅ **cerrada** (6 sep): grupos muchos-a-muchos con tipo, pestañas Grupos y Prep. física, plan de entrenamiento de grupo |
| **P8** | **Un solo panel de alumno** (feedback al probar P5/P6/P7) | ✅ **cerrada** (6 sep): Usuarios + Academia + Acceso & Pagos → **una pestaña «Alumnos»**. Tipos de grupo editables (`group_kinds`), varios profesores por grupo (`class_group_staff`), grupos asignados **desde el alumno**, y **pagos mes a mes** (`monthly_payments`). Ver **regla 53** |
| — | **P8, segunda vuelta** (feedback al probarlo) | ✅ **hecho** (6 sep): «Alumnos» sin admins, «marcar pagado» y plan individual fuera de la ficha, **pestañas reordenables** (localStorage), **dos interruptores de físicas** (`training_ai` / `training_group`, sin SQL), **«Pagos» con vista histórico** (rejilla × 12 meses), y el **plan de grupo semana a semana con histórico** (P9, `group_training_plans` con PK `(class_id, week_start)`). Todo verificado en el preview. Ver **regla 54** |
| — | **Icono de la app** | ✅ **hecho** (6 sep): fuera el `favicon.ico` por defecto de Vercel (triángulo borroso en el móvil). `app/icon.tsx` (PNG 512 con `next/og`), `app/apple-icon.tsx` (180), `app/manifest.ts` (PWA `standalone`, «Atenea»). **No volver a añadir `app/favicon.ico`** |
| **P10** | **Entrenamiento adaptativo** (el diferenciador) | 🔶 **v1 hecha, en rama `claude/p10-entrenamiento-adaptativo`, SIN fusionar** (6 sep). Cajones por alumno + sesión con cuota de cada uno + curva de aprendizaje. Derivado al vuelo de `question_attempts`, **sin SQL**. Verificado end-to-end en el preview. Ver **regla 55** y [`docs/P10-entrenamiento-adaptativo.md`](P10-entrenamiento-adaptativo.md) |
| — | **El temario completo** | ✅ **generado** (3 sep): 45 temas, 51 PDF en `temario/`, ver [`docs/TEMARIO.md`](TEMARIO.md) |
| — | **Sistema de diseño y móvil** | ✅ **hecho** (3 sep): `app/components/ui/` y la interfaz migrada encima, alumno y admin. Ver **regla 36** |
| — | **Despliegue** | ✅ **en producción**: https://atenea-eight.vercel.app |
| — | **La capa de comportamiento** | ✅ **hecha** (4 sep): el examen ya no se pierde, el scroll y el botón Atrás funcionan, y el chat sobrevive a cambiar de pestaña. Ver **regla 37** |
| — | **Reset y siembra** | ✅ **hecho** (4 sep): tres guiones para dejar la plataforma limpia, indexar los 51 documentos y llenar el banco. Ver [`docs/RESET-Y-SIEMBRA.md`](RESET-Y-SIEMBRA.md) |
| — | **Generación solo del admin · topes de gasto · login nuevo** | ✅ **hecho** (4 sep): alumno y admin dejan de compartir quién paga la IA. Ver **reglas 39, 40 y 41** |
| — | **Banco de pruebas de la interfaz** | ✅ **hecho** (4 sep): las 19 pantallas en un navegador de verdad, a tamaño de móvil, midiendo tamaño táctil, desbordes, elementos a 0x0 y contraste. Ver [`docs/BANCO-DE-PRUEBAS.md`](BANCO-DE-PRUEBAS.md) |
| — | **Revisión completa de `/admin`** | ✅ **hecho en parte** (5 sep): «viene» y «estudia» ya no se confunden (regla 46), generar preguntas/fichas es un panel de tres pasos (regla 47), un entrenador real puede escribir el plan (regla 48), «Logs» ahora es auditoría de quién hizo qué (regla 49) y hay una pestaña de datos de la academia y profesores (regla 50). Los dos guiones SQL de auditoría y ajustes están **ejecutados** (5 sep) |
| — | **El test, planteamiento definitivo** | ✅ **hecho** (7 sep): fuera la fricción por pregunta (se deduce, regla 60), DOS modos y solo dos (entrenamiento sin nota / simulacro representativo con cuadrícula, regla 59), selector de alcance (tema/bloques/todo), «hoy te tocan N», y las 3 señales del método (distractor fijo, tiempo relativo, `first_touch_ms`). El chat sale del MVP (regla 58). Logo: la égida. Verificado en el preview. Ver [`docs/TEST-Y-ENTRENAMIENTO.md`](TEST-Y-ENTRENAMIENTO.md) |
| — | **Pulido tras probar en el móvil** | ✅ **hecho** (7 sep): selector de tema = hoja modal numerada (no `<select>`), sin reloj en entrenamiento, fuera los pulgares de votar pregunta (queda «Avisar»), y el calendario de físicas con fechas reales + mirar semanas anteriores del plan de grupo. Reglas 57 y 59 |
| — | **Segunda vuelta de feedback: fichas, velocidad, «fallos», estadísticas, «Mi perfil»** | ✅ **hecho** (8 sep): fichas instantáneas (precarga, regla 61), animación de cambio de módulo a 150 ms, `SelectorTema` (hoja modal en test/fallos/fichas), rediseño de «Repasar fallos» (por prioridad, regla 62), **Inicio vs Estadísticas** sin solape (regla 63), **¿Aprobaría?** (media de simulacros por `exam_id`), **«Mi perfil»** con la convocatoria y su cuenta atrás (regla 64), biodata/entrevista fuera del MVP (regla 58). `docs/sql/convocatoria.sql` **ejecutado** (8 sep) |
| **P11** | **Multi-academia** (plan de producto) | 🔶 **P11a-g e i cerradas** (12 sep): esquema, rol `superadmin`, rutas `/<slug>`, filtro de `organization_id` en el panel, banco global/privado, reportes enrutados al superadmin (P11e), y la pestaña **«Academias»** — comparativa entre academias y alta de academias nuevas (P11f/P11i). Ver **regla 65**. Slug de producción `alphapol`; `gaepmalaga@gmail.com` es `superadmin`. **Verificado en pantalla con sesión de superadmin real** (12 sep): las 4 pestañas correctas, «Academias» con su comparativa, y «Nueva academia»/«Añadir admin» probados de verdad sin errores. SMTP propio (Gmail) también configurado y verificado end-to-end. **Decidido y cerrado el 14 sep** (regla 75): el temario y la moderación del banco global pasan a ser solo del `superadmin` — ver más abajo. **Sin empezar**: selector de academia en el login si una cuenta está en varias (P11h) — ver [`docs/PLAN-PRODUCTO.md`](PLAN-PRODUCTO.md) §P11 |
| **P12** | **Solicitudes de alta con aviso por correo, y exentos de pago** | ✅ **cerrada y verificada end-to-end** (12 sep). Decisión del dueño: la norma global pasa a ser que TODO alumno que se registra —incluida `atenea`, la casa— espera a que su academia lo acepte; el admin recibe un correo con la solicitud y el alumno recibe el resultado por correo; una lista blanca por academia deja entrar correos concretos sin solicitud ni pago («exentos»); y hay un campo para invitar a un alumno por correo (entra con acceso directo, sin solicitud). Ver **regla 70**. Guion SQL ejecutado, alumnos actuales de Alphapol y `atenea` activados y el interruptor encendido en las dos. El correo va por **Resend con dominio propio** (`ateneapolicial.com`), no por Gmail — la cuenta de Gmail se bloqueó a mitad del despliegue y se abandonó del todo |
| — | **Motor adaptativo v2: aprender del comportamiento, no de etiquetas** | ✅ **cerrada** (14 sep). Foco perdido descontado de la firmeza, curva de olvido personal POR PREGUNTA (`factorPersonal`), la programación hecha visible al alumno (`razonRepaso`/`porQueHoy`), feedback que explica también por qué fallan las opciones incorrectas (prompt + mínimo real en `explanation`), los tres tipos de blanco (`tipoDeBlanco`, enganchado en `ResultadoSimulacro`) — de paso salió y se corrigió un fallo real: `toResultRow` borraba `first_touch_ms` de TODO blanco, también del que sí se había medido —, un grafo de confusión entre preguntas descubierto de los datos (`detectaConfusion`), enganchado en «Alumnos» junto a «Preguntas que falla casi todo el mundo», **`answer_path`** (el camino completo de la respuesta: `docs/sql/camino-respuesta.sql` **ejecutado** por el dueño, `patronDeCambio` distingue autocorrección de volver al primer instinto, ya integrado en `inferFirmeza`), y **el peso real del examen** (`PESO_EXAMEN_REAL`, 497 preguntas de los 5 exámenes oficiales 2021-2025 clasificadas por tema con una expresión regular sobre el propio texto del PDF —nada de IA—, usado como desempate en `smart-session.ts` sin pisar nunca la urgencia). Ver **regla 73**: por qué se descartó un diseño con `claims`/mecanismos de distractor etiquetados, y una corrección de rumbo real a media sesión sobre el peso del examen (se dijo primero que hacía falta IA para extraerlo; no era cierto, y quedó corregido). Todo verificado escribiendo de verdad contra la producción real, con sesión de alumna y de admin. `npm run check` (997 tests) y `npm run build` en verde |
| — | **Un admin de academia ya no puede tocar el banco de OTRA academia, ni el global entero** | ✅ **cerrada** (14 sep), a preguntas directas del dueño mirando el panel de un admin real. `seedQuestionBank`/`seedFlashcardBank`/`generateAndSaveCandidate`/Temario & IA entero pasan de `requireAdmin` a `requireSuperadmin` (escribían SIEMPRE en el banco global, sin distinguir academia); `disableQuestion`/`updateQuestion`/`discardAllQuestions`/`resolveReport` se quedan en `requireAdmin` pero acotados por `organization_id` dentro de la propia consulta; «Consumo IA» pasa a ser solo del superadmin (para un admin normal de una academia manual salía siempre a 0 €). Ver **regla 75**. Verificado con sesión real de `morato@atenea.com`: sus pestañas bajan de 10 a 8, «Banco Oficial» y «Moderación» siguen funcionando sin fugas. `npm run check` (1019 tests) y `npm run build` en verde |
| — | **El panel de «Alumnos» dice si el motor adaptativo está funcionando** | ✅ **cerrada** (15 sep). `progresoSemanalAcademia` (`app/lib/academy.ts`) corre el mismo cálculo por alumno (hoy vs hace 7 días) y suma: *"Esta semana el sistema ha llevado N preguntas más a dominadas, entre M alumnos"*, sin consulta nueva (reutiliza los `intentos` que `getAcademyOverview` ya trae). Se oculta si la suma es 0. Ver **regla 76** |
| **P13** | **«Mi Evolución» sustituye a Estadísticas: una sola pantalla, no datos sueltos** | ✅ **cerrada** (15 sep). El dueño lo pidió directo: *"quiero que explotemos la aplicación... que quien la vea diga la aplicación lo sabe todo de mí"*. Consolida Inicio/Fallos/Estadísticas/Mi Perfil en una historia: fecha de inicio, mapa del temario, desglose con contexto (dominadas / en camino / se resisten —con el tema que más resiste— / evitas), ¿Aprobaría?, curva diaria de dominadas (SVG a mano) y racha en calendario. `dominadasHasta` (`question-scheduler.ts`) es la pieza nueva: un día YA PASADO da siempre el mismo número, así que la curva se cachea de verdad —nunca en `localStorage`, decisión explícita del dueño, tiene que servir entre dispositivos—. Ver **regla 77**. `npm run check` (1047 tests) y `npm run build` en verde. Verificado en el preview con datos reales de `alumno@atenea.com`, incluido un fallo real de fecha encontrado y corregido contra la BD real (la curva empezaba un día tarde) |
| — | **El banco crece donde pesa el examen real, no a cifra plana** | ✅ **cerrada y sembrada de verdad** (15-16 sep), a preguntas del dueño comparando con la competencia. Tres franjas por `PESO_EXAMEN_REAL`: "paja" sin tocar, "normal" a 55, "importante" con un SUELO POR ARTÍCULO (no por tema) — medido contra la BD real, un tema con 149 artículos y uno con 20 no pueden pedir la misma cifra plana. Los 5 exámenes oficiales indexados quedan vetados como FUENTE de preguntas nuevas (un artículo citado hace años puede haber cambiado), y el prompt incorpora su ESTILO real sin su contenido. **2.822 preguntas nuevas, banco global activo en 4.617.** Ver **regla 78**. `npm run check` (1047 tests) en verde |
| — | **Prep. física probada de punta a punta, y la carrera de 1.000 m en vez del Cooper** | ✅ **hecho** (11-12 oct), en la rama `claude/instagram-content-opositores-academias-qj5k0q`. Probado con cuentas temporales de la academia casa contra la BD real (borradas después). Ver **regla 79** |
| — | **La plataforma pasa a ser de Alphapol** | ✅ **en producción** (6 nov, rama `claude/alfapol-platform-requirements-3kt6w6` fusionada en `main`, comprobado en https://atenea-eight.vercel.app): marca, logo e iconos de alphapol.es, azul marino en vez del índigo, fuera todo lo propio de Atenea, el registro por `/` entra en Alphapol. **La base de datos ya está limpia** (6 nov, `npm run limpiar` contra la real): solo el superadmin, solo la academia Alphapol, banco y temario intactos; creadas `prueba.admin@alphapol.es` y `prueba.alumno@alphapol.es` para los dueños; el disparador de altas ya apunta a Alphapol. **Falta**: el subdominio, el correo desde `@alphapol.es` y las plantillas de correo de Supabase Auth, que siguen diciendo «Atenea Policial». Ver **regla 81** |
| — | **Asistencia: el alumno avisa de que falta, la academia ve los huecos** | ✅ **hecho** (6 nov), a petición de Alphapol. Horario estructurado por grupo (días, horas, plazas), «Mis clases» en «Mi perfil» y pestaña **«Asistencia»** en el panel. `docs/sql/asistencia.sql` **ejecutado**. Verificado de punta a punta contra la BD real con un grupo temporal (borrado después). Ver **regla 82** |
| — | **Alta de alumnos en bloque y cambiar la contraseña** | ✅ **hecho** (6 nov). Pegar la lista de correos en «Alumnos»; las cuentas nacen con contraseña provisional (sin correo: Supabase solo deja 30 por hora) y el alumno la cambia en «Mi perfil». Verificado contra la BD real. Ver **regla 83** |
| — | **Las dudosas: tasa de acierto en lo que se contesta dudando** | ✅ **hecho** (6 nov), en la rama `claude/alfapol-platform-requirements-3kt6w6`, a petición de Alphapol. Marca «Dudosa» opcional en simulacro y entrenamiento, guardada en `question_attempts.confidence` (**sin SQL**), con su resumen en resultados, «Mi Evolución» y la ficha del alumno. Verificado en el banco de pruebas, no con la BD real. Ver **regla 80** |
| — | **La preparación física sin herramienta externa** | ✅ **hecho** (6 nov), a petición de Alphapol, que mandaba la física con otra aplicación. El alumno marca cada día del plan de su grupo como hecho, con esfuerzo (1-10) y comentario; el preparador ve «Quién ha entrenado» por grupo y semana; cada ejercicio admite un enlace de vídeo. `docs/sql/registro-fisico.sql` **ejecutado**. Verificado de punta a punta contra la BD real con un grupo temporal (borrado después). Ver **regla 84** |
| — | **Pasada de tono: la app habla como Alphapol** | ✅ **en producción** (6 nov). Fuera el reloj «ZULU» (enseñaba la hora de Greenwich), «Sistema online», «Centro de Mando», «Operaciones», «Drills», «Sistema Táctico»; los módulos se llaman Inicio, Test, Repasar fallos, Fichas, Preparación física, Mi evolución, Mi perfil; el logo de Alphapol en el menú y en el panel; menos texto en «Mi evolución». Ver **regla 85** |
| — | **La física como en TrainingMonkeys** | ✅ **en producción** (6 nov), con un plan de ejemplo de noviembre cargado. El modelo pasa a ser el de la herramienta que usaba Alphapol: SESIONES sueltas en el calendario (tipo, título, descripción libre, duración, distancia, vídeo), de un grupo o de un alumno; el alumno las apunta (hecha o no, esfuerzo, sensaciones, tiempo y distancia reales) y el preparador contesta. Planificador de semana / 2 semanas / mes con arrastrar y soltar, biblioteca de plantillas, copiar semana, nota de la semana; histórico de marcas con el baremo del BOE. `docs/sql/fisica-sesiones.sql` **ejecutado**. Verificado de punta a punta contra la BD real (datos de prueba borrados después). Sustituye a la regla 84. Ver **regla 86** |
| — | **Pantalla de carga nueva** | ✅ **en producción** (6 nov). De siete propuestas en un lienzo de diseño, el dueño eligió la «G · Monumental»: la «A» del logo enorme saliéndose por la derecha y el logotipo abajo, en marino. Se guardaron la A (Emblema) y la E (Claro) en `docs/disenos/pantalla-de-carga/`. Vista en el banco de pruebas a 390, 360 y 1440 px. Ver **regla 87** |
| — | **Icono de la app nuevo** | ✅ **en producción** (6 nov). De seis propuestas en el mismo lienzo, el dueño eligió la «E · Con nombre» con la «A» y el nombre lo más grandes posible: dos versiones, una para iPhone y navegador y otra (la «maskable») para Android, que tiene que caber en el círculo central. Ver **regla 88** |
| — | **Logo nítido, pantalla de carga y puerta de entrada, segunda vuelta** | ✅ **en producción** (6 nov), a petición del dueño («las mismas versiones pero mejor»). La «A», el logotipo y el nombre pasan a SVG con el contorno vectorial (eran el JPG de 400 px ampliado y se veían borrosos), los iconos se rehacen encima y el de Android ya no deja un recuadro en la pantalla de arranque; la pantalla de carga deja de pasar la «A» por detrás del logotipo; y las cinco pantallas de entrada (entrar, crear cuenta, poner contraseña, elegir academia, acceso no activo) comparten un marco nuevo que sigue a la de carga. Verificado en el banco de pruebas a 375, 390 y 1440 px, con contraste. Ver **reglas 87, 88 y 90** |
| — | **1RM y cargas en % en las sesiones** | ✅ **en producción** (6 nov). El preparador escribe «4 × 6 al 75 %» y cada alumno lo ve en kilos con su 1RM. Verificado de punta a punta contra la BD real. Ver **regla 89** |
| — | **El panel «Alumnos» hace las cuentas en la base de datos** | ✅ **en producción** (7 nov). Antes traía a memoria TODAS las respuestas de la academia con un tope de 20.000 (con 100 alumnos se pasa en semanas y contaba en silencio sobre una parte). Ahora tres funciones SQL devuelven los totales. Comparadas contra la lógica de antes en un Postgres de verdad con 1.680 respuestas inventadas: iguales. Ver **regla 91** |
| — | **Gemini: de `gemini-2.5-flash` a `gemini-3.5-flash-lite`** | ✅ **en producción** (7 nov). Google apaga el modelo viejo el 1 dic; el nuevo cuesta lo mismo. Ver **regla 92** |

## Producción

**https://atenea-eight.vercel.app** — proyecto `atenea` en Vercel, conectado a
`gaepmalaga/atenea`. Cada push a `main` despliega solo.

El 30 ago se corrigió lo que impedía entrar: **Supabase tenía la Site URL apuntando a
`http://localhost:3000` y ninguna Redirect URL**. Ahora la Site URL es la de producción
y hay dos Redirect URLs (producción y localhost, para que el desarrollo local siga
funcionando).

> El proyecto duplicado `atenea-jw3h` **ya no existe** (borrado el 31 ago 2026;
> confirmado el 5 sep: en Vercel solo quedan `atenea` y el no relacionado
> `brand-os`). El dominio de producción cuelga del proyecto `atenea`.

### Lo que solo puedes hacer tú

Los guiones de Supabase que estaban pendientes en fases anteriores (RLS, cuota de IA,
`question_attempts`, `ai_usage` de la regla 41 y el historial del chat de la regla 44)
**ya están ejecutados**. Lo que queda necesita algo que no se puede hacer desde aquí:

1. **Ejecutar SQL. No queda ningún guion pendiente** (16 sep 2026 — verificado
   contra la base de datos real, no solo contra lo que decía este documento:
   `curva_progreso`, `memberships.exempt` y `membership_exemptions` existen
   los tres). El guion de la regla 77 se sumó al volcado el mismo día
   (`node scripts/schema-snapshot.mjs`, ya son **40 tablas**), y de paso se
   corrigió aquí un error de documentación de antes de esta sesión: este
   apartado llevaba tiempo diciendo que `P12-solicitudes-y-exentos.sql`
   seguía sin ejecutar cuando llevaba ejecutado desde el 12 sep (regla 70 y
   «Estado actual» ya lo decían bien; solo esta lista se había quedado
   atrás).
   - **`P11j-asignar-academia-en-registro.sql`** (12 sep 2026, **ejecutado y
     verificado con dos altas reales el mismo día**) — un
     disparador de Postgres (`on_auth_user_created_academia`) que da de alta
     la membresía en `academy_members` en cuanto se registra una cuenta. Hace
     falta porque ningún camino de código lo hacía: `supabase.auth.signUp()`
     (`AppShell.tsx`) no decía de qué academia era, así que un alta nueva
     confirmaba su correo, entraba, y se encontraba con «No hemos encontrado
     tu academia» sin ninguna forma de salir de ahí. El disparador lee el
     slug que `AppShell.tsx` ya manda como metadata del registro
     (`options.data.academia_slug`) cuando se registra desde `/<slug>`; sin
     slug (registro por `/`, la URL pelada), entra en **`atenea`** — la
     academia «casa», ya creada (decidido con el dueño el mismo día: sin
     grupos ni cobro en persona, donde caen los registros genéricos y
     estudian con el banco común). Es un destino FIJO, no "si solo hay una
     academia" — eso se habría roto en cuanto naciera una segunda academia
     real. El `superadmin` no la administra como excepción: si algún día
     hace falta ver uno a uno a sus alumnos, se crea un `admin` normal para
     ella, igual que para cualquier otra. No toca el disparador que ya crea
     `profiles` —vive solo en Supabase, no en este repo—: es un
     `AFTER INSERT` independiente sobre `auth.users`, y Postgres permite
     varios. **Verificado end-to-end el mismo día**: un alta real por
     `/alphapol` (desde el navegador, con el correo mandado de verdad) quedó
     en `academy_members` apuntando a Alphapol; el límite de envío de
     correos del plan Free de Supabase impidió repetirlo por `/` desde la
     UI, así que ese segundo camino se comprobó contra la API de
     administración (mismo disparador, sin metadata de academia) y quedó en
     `atenea`. Las dos cuentas de prueba se borraron después.

   Ejecutados y verificados (12 sep 2026, `node scripts/schema-snapshot.mjs`
   — **38 tablas**):
   - **`P11-multi-academia.sql`** (pegado 11 sep, **verificado con acceso real
     el 12 sep**) — los cimientos de servir la plataforma a varias academias
     (`docs/PLAN-PRODUCTO.md`, fase P11): `academies`, `academy_members`, y
     `organization_id` en cascada por `question_bank` (nulable: NULL es el
     banco global), `class_groups`, `group_kinds`, `academy_staff`,
     `admin_audit_log` (nulable), `memberships` y `monthly_payments`.
     `academy_settings`, `membership_settings` y `academy_convocatoria` dejan
     de ser una fila única y pasan a una por academia, con `organization_id`
     como clave (perdieron la columna `id`). Verificado con las consultas del
     PASO 9 del propio guion: una academia `principal`/«Alphapol», 7
     `academy_members` (tantos como perfiles), `question_bank` intacto en
     `organization_id = NULL` (1000 filas), los tres singleton sin `id`, y
     RLS con la clave anónima devolviendo 0 filas en `academies` /
     `academy_members` / `academy_convocatoria`. El temario sigue compartido
     (decidido), así que `subjects`/`documents`/`document_chunks` no llevan
     `organization_id`. Sigue el código: rol `superadmin`, resolución de
     `/alphapol` en las rutas y el login, y el filtro de `organization_id` en
     el panel de administración — es grande, ver `docs/PLAN-PRODUCTO.md` §P11.

   Guiones de fases anteriores, todos ejecutados (8 sep 2026, `node
   scripts/schema-snapshot.mjs` — **36 tablas**):
   - **`convocatoria.sql`** (8 sep) — `academy_convocatoria` (fila única id=1:
     escala, `fecha_examen`, nota). Política de SELECT abierta para autenticados
     (el alumno lee la cuenta atrás en «Mi perfil»); escritura solo con la clave
     de servicio detrás de `requireAdmin`. `getConvocatoria` degrada con gracia
     si la tabla falta (era la excepción documentada, ya cerrada).

   Guiones de fases anteriores ejecutados (7 sep 2026, eran **35 tablas**):
   - **`retirar-tablas-en-desuso.sql`** (7 sep) — `DROP` de `test_results`,
     `exams`, `exam_questions`, `content_documents` (vacías, sin usar; `count(*)`
     comprobado a 0 antes del DROP). Un test estático (`schema-drift`,
     `RETIRADAS`) impide que el código vuelva a nombrarlas.
   - **`persistir-entrevista.sql`** (7 sep) — `interview_reports` (informe +
     transcripción de cada simulacro). RLS de propietario. `evaluateInterview`
     la escribe best-effort, `getInterviewReports` la lista.
   - **`P10b-marca-de-confianza.sql`** (6 sep) — `question_attempts.confidence`.
     La marca de confianza EXPLÍCITA se retiró después (regla 60); la columna se
     queda, siempre `null` en filas nuevas.
   - **`tiempo-primer-toque.sql`** (7 sep) — `question_attempts.first_touch_ms`
     (`integer`, nullable, CHECK ≥ 0). Separa recordar de deliberar (regla 60).
     `null` en el histórico y en el simulacro.

   Guiones de fases anteriores ejecutados (eran 38 tablas el 6 sep; 35 ahora tras
   retirar las 4 y añadir `interview_reports`):
   - P3.7 / P3.8 (`legal_reference`, `question_notes`) — 31 ago.
   - `admin-audit-log.sql`, `academia-ajustes.sql`, `gasto-ia.sql`,
     `historial-chat.sql` — la tanda de la revisión de `/admin` y las reglas
     41/44/49/50.
   - `P6-acceso-y-pagos.sql` (`membership_settings` con su fila id=1,
     `memberships`) — 5 sep, comprobados contra la BD real.
   - `1.2-attempts-update.sql` — la política de UPDATE de `question_attempts`
     (regla 34). 5 sep. Ya tiene las tres políticas (insert/select/update).
   - `P7-grupos-y-fisica.sql` (`class_groups`, `class_members`,
     `group_training_plans`; retira `profiles.class_group`) — 6 sep.
   - `P8-panel-alumno.sql` (`group_kinds`, `class_group_staff` —retira
     `class_groups.staff_id`—, `monthly_payments`; retira `academy_payments`,
     que tenía 0 filas) — 6 sep, con `node scripts/schema-snapshot.mjs` detrás.
   - `P9-plan-grupo-semanal.sql` — la PK de `group_training_plans` pasa a
     `(class_id, week_start)` para el plan de grupo semana a semana con histórico
     (regla 54). No añade columnas. 6 sep, verificado end-to-end en el preview.

   `question_attempts` ya se movió a la sesión (6 sep, regla 34), verificado en
   pantalla end-to-end: una pregunta de entrenamiento fallada y diagnosticada
   guarda su `error_type`.

   La regla no cambia para el próximo: **no se escribe el código antes** de que
   exista la columna — PostgREST rechaza la escritura *entera* si falta una
   sola. La única excepción, documentada, es construir una funcionalidad nueva
   a la espera de su propio guion (audit-log, academia, P6), con el código
   degradando con gracia hasta que se ejecute.
2. **SMTP propio en Supabase — CONFIGURADO Y VERIFICADO (12 sep 2026).** El
   servicio compartido de Supabase (pensado solo para desarrollo, un puñado
   de correos por hora) se agotó probando DOS altas seguidas el mismo día
   (P11j), y con alumnos reales el segundo o tercer registro en la misma hora
   habría fallado con "límite de correos alcanzado" — lo mismo bloquea
   `addAcademyAdmin` al invitar a un admin nuevo (regla 65). El dueño dio de
   alta una cuenta de Gmail dedicada (`atenea.alumnos@gmail.com`, con
   verificación en 2 pasos y contraseña de aplicación) y la conectó en
   *Authentication → Emails → SMTP Settings* (`smtp.gmail.com`, puerto
   **587**). Un primer intento falló con Gmail bloqueando el envío por
   seguridad (error `534 5.7.14`, cuenta nueva + IP de servidor
   desconocida para Google) — se resolvió entrando en esa cuenta desde un
   navegador normal y visitando `https://accounts.google.com/DisplayUnlockCaptcha`.
   **Verificado end-to-end**: registro real por `/alphapol`, correo recibido y
   confirmado, cuenta creada con el disparador de P11j asignándola a Alphapol
   correctamente. Cuenta de prueba borrada después.

   **Fragilidad conocida, no resuelta del todo:** Gmail personal no es un
   proveedor transaccional — si vuelve a detectar el envío como sospechoso
   (un pico de registros, unos días sin actividad), puede volver a bloquear
   con el mismo error 534, y el mismo desbloqueo de `DisplayUnlockCaptcha`
   debería arreglarlo. El límite de envío de Gmail (~500/día) es de sobra
   para el piloto, pero si esto da problemas de nuevo o el piloto crece,
   migrar a un proveedor transaccional (Resend, Postmark, SendGrid — planes
   gratuitos de miles de correos al mes, sin este riesgo) es la solución
   definitiva.
3. **`SMTP_PASS` para el correo que manda la propia app — FALTA, bloquea P12
   (regla 70).** Es una variable de entorno DISTINTA de la configuración de
   Supabase de arriba: los avisos de solicitud de alta y su resolución no
   salen por Supabase Auth (que solo manda sus propios correos), sino
   directamente desde la app con `nodemailer` (`app/lib/mailer.ts`). Reusa la
   MISMA cuenta Gmail (`atenea.alumnos@gmail.com`) y la MISMA contraseña de
   aplicación que ya se generó para el punto 2 — no hace falta generar una
   nueva, solo copiarla también aquí. Cuatro variables en `.env.local` y en
   Vercel (ver `.env.example`): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
   `SMTP_USER=atenea.alumnos@gmail.com`, `SMTP_PASS=`. Sin `SMTP_PASS`, `sendMail`
   se lo salta y lo registra en el log del servidor — no rompe nada, pero
   ningún aviso llega.
4. **Login con Google**, si se quiere. Hoy el proveedor Google está *Disabled* y el
   código solo tiene email + contraseña. Hacen falta credenciales OAuth de Google Cloud
   pegadas en Supabase, y un botón `signInWithOAuth` en `app/page.tsx`.
5. **Entrar como alumno y probar la pantalla del test.** Lo de P3 (blanco explícito,
   cuenta atrás, pantalla de revisión) y el repaso de fallos están cubiertos por tests y
   el build pasa, pero **no se han visto funcionando en pantalla**: hace falta una
   sesión, y una sesión pide contraseña.

> **Cuidado con `Confirm email`:** está activado. Quien se registre no podrá entrar hasta
> pulsar el enlace del correo. Desde el 12 sep 2026 el envío va por el SMTP propio
> (Gmail dedicado, ver punto 2 de arriba), no por el límite de desarrollo de Supabase.

**Verificado contra el Supabase real (26 ago 2026):** RLS cierra el acceso anónimo a las
21 tablas (comprobado con `curl` y la clave pública); `consume_ai_quota` corta a la
tercera llamada con límite 2; e `question_attempts` acepta el insert, resuelve el join
con `question_bank` y admite el update de `error_type`.

**Sin verificar:** el flujo completo desde la interfaz con una sesión de alumno. El punto
de más riesgo es el login, porque la sesión pasó de `localStorage` a cookies.

---

## Cómo continuar

1. **El simulacro ya se ha probado entero desde la interfaz** (27 ago 2026, con sesión
   de alumno). `question_attempts` recibe la fila con `response_time_ms` y
   `option_changes` **distintos de 0** —2 cambios y 25.808 ms en una pregunta revisada
   dos veces—, y la nota con penalización sale bien.

   **Lo que sigue sin probarse encadenado:** el modo entrenamiento (que fallar una
   pregunta y etiquetar el error deje **una** sola fila con su `error_type`), que Inicio
   y Estadísticas cargan con datos, y todo lo de la 2.7: rellenar el perfil físico y
   comprobar que `profiles_physical` guarda `height` y `weight` como **números** y no
   como cadenas; dejar un campo en blanco debe dejar `null`, no `0`. Generar un plan y
   mirar que las tarjetas del panel tienen título.

   > Para verlo hace falta una sesión de alumno. La forma sin fricción es cambiar
   > `profiles.role` a `student` un momento con la clave de servicio y devolverlo a
   > `admin` al terminar.

   **Y lo de P3 tampoco se ha visto en pantalla** (30 ago): blanco explícito y tecla
   `0`, cuenta atrás con entrega automática, pantalla de revisión antes de entregar, y
   la pestaña nueva de **Repasar fallos**. Todo con tests y con el build en verde, pero
   verde no es lo mismo que visto. La consulta del repaso sí está comprobada contra la
   base de datos real: el join resuelve las 17 filas falladas con sus opciones.

2. **El chat se reescribió por dentro el 31 ago** (reglas 30, 32 y 33), y lo que
   queda de él son decisiones, no trabajo: si la búsqueda semántica sobra ahora que
   hay selector de tema, y si el coste por pregunta (~35.000 tokens con el documento
   entero) pide activar caché de contexto. Antes de tocar nada ahí, ejecuta
   `npm run chat:probar`: enseña lo que responde de verdad, que es lo único que
   destapó todos los fallos anteriores — los tests estaban en verde con el chat
   contestando disparates.

3. **P2 y P3 están hechas** (30–31 ago). De P2: botón *Nueva* en Banco Maestro,
   formulario de alta e importación desde CSV con vista previa y el detalle de lo
   rechazado. De P3, los dos puntos que faltaban: la referencia legal de la pregunta
   y las notas privadas del alumno. Lo que queda ahí es **verlo funcionando con una
   sesión**, y decidir si interesa que un mismo CSV traiga preguntas de varios temas
   (hoy el tema se elige una vez y vale para todo el fichero).

4. **Fase 1.2 cerrada del todo** (6 sep): TODAS las tablas del alumno van con el
   cliente de su sesión, incluida `question_attempts` (`exams.ts`). RLS por fin
   protege de verdad (regla 34). Verificado en pantalla end-to-end el 6 sep.

5. **`test_results` retirada** (7 sep): junto con `exams`, `exam_questions` y
   `content_documents` — vacías y sin una sola referencia en `app/`.
   `docs/sql/retirar-tablas-en-desuso.sql` **ejecutado**; snapshot y migración
   regenerados (35 tablas). Un test estático (`schema-drift`, `RETIRADAS`) impide
   que el código vuelva a nombrarlas.

6. **P8 está hecha y desplegada** (6 sep): una sola pestaña «Alumnos», tipos de
   grupo editables, varios profesores por grupo, grupos desde el alumno y pagos
   mes a mes. `npm run check` en verde, `npm run build` en verde, y verificado
   en el preview con sesión de admin (Alumnos / Grupos / Pagos pintan sin
   errores de consola). Todos los caminos de escritura pasaron `smoke` contra la
   BD real. **Lo que queda es que el dueño lo use en producción**: dar de alta
   un alumno, marcarle grupos, activar el interruptor de acceso, y marcar un
   pago de septiembre. Ver **regla 53**.

**Antes de tocar cualquier tabla, mira `supabase/schema.json`.** Es el esquema real,
volcado del proyecto. Casi todos los fallos graves de este repo han sido el código
escribiendo columnas que no existen, y PostgREST rechaza la escritura **entera** cuando
eso pasa. Para refrescarlo: `node scripts/schema-snapshot.mjs`.
Al cerrar una fase: actualiza la tabla de estado de este fichero, marca la fase
en `docs/PLAN-DE-TRABAJO.md` y el hallazgo en `docs/AUDITORIA.md`.

---

# Comandos, mapa y trampas, en su versión larga

Lo que tenía `CLAUDE.md` antes de resumirlo (7 nov 2026).

## Comandos

```bash
npm ci
cp .env.example .env.local     # las 4 variables son obligatorias: la app no arranca sin ellas
npm run dev

npm run check                  # typecheck + tests — pásalo ANTES de cada commit
npm run build                  # necesita las variables de entorno definidas
npm run lint                   # ~13 errores, todos el mismo falso positivo (ver abajo)

npm run sembrar -- --comprobar-pdfs # lee los 51 PDF y los trocea, SIN red ni gasto
npm run reset                      # ensayo: qué se borraría. `-- --hazlo` borra
npm run limpiar                    # ensayo: qué cuentas y academias de prueba se borrarían (regla 81). `-- --hazlo` borra
npm run cuenta -- correo 'clave' student   # una cuenta con el correo ya confirmado
npm run sembrar                    # indexa los 51 PDF y llena el banco (de pago)
npm run sembrar -- --solo-fichas --fichas=15   # el BANCO DE FICHAS (de pago)
npm run sembrar:peso -- --ensayo   # qué generaría por franja de peso real, SIN gastar (regla 78)
npm run sembrar:peso               # siembra el banco según el peso real del examen (de pago)

node scripts/schema-snapshot.mjs   # refresca supabase/schema.json desde el proyecto real
node scripts/dump-migration.mjs    # regenera supabase/migrations/0001_esquema_actual.sql

cd .banco-pruebas && node todas-las-pantallas.cjs   # LAS 19 PANTALLAS en un navegador de verdad

npm run chat:probar                # QUE RESPONDE el chat, preguntándole de verdad (de pago)
npm run chat:probar -- --tema=39   # lo mismo con el desplegable de tema puesto
node scripts/medir-contexto.mjs    # cuánto ocupa el temario y si cabe entero en el modelo (de pago)

npm run sesion:adaptativa -- correo@x.com 20   # QUÉ SESIÓN le montaría P10 a ese alumno (gratis, solo lee)
```

Los errores de `lint` (hoy 18) son **todos** el mismo falso positivo de
`react-hooks/set-state-in-effect`: en cada panel que carga datos, un
`useEffect(() => cargar(), [])` donde `cargar` hace `setState` **después** de un
`await`. La regla lo ve como un `setState` síncrono dentro del efecto y no lo
es. Está en casi todos los paneles de administración (`AdminActivity`,
`AdminCost`, `AdminStudents`, `AdminPayments`, `AdminGroups`, `AdminPhysical`,
`AdminView`, `AdminModules`, `AdminModeration`, `AdminContent`,
`PlanEntrenadorEditor`) y del alumno (`DashboardHome`, `FailedQuestions`,
`StatsPanel`, `QuestionNote`, `IntelChat`). Retorcer el código para callarla sería peor que el
aviso, y el número solo crece al añadir paneles. El de `IntelChat` es además a
propósito: recupera del `sessionStorage` la conversación al montar (regla 37).

**`npm run dev` usa webpack, no Turbopack.** Turbopack infiere mal la raíz del proyecto
en modo desarrollo y se va al directorio padre, desde donde no resuelve el
`@import "tailwindcss"` de `app/globals.css`; la página no compila. `next build` no lo
sufre. Queda `npm run dev:turbo` para reintentarlo cuando lo arreglen aguas arriba.

Los dos guiones de esquema se apoyan en `public.__esquema_json()`, instalada en el
proyecto ([`docs/sql/2.6-funcion-volcado.sql`](sql/2.6-funcion-volcado.sql)). Solo
lee catálogos y solo la alcanza la clave de servicio; así no hace falta la contraseña de
la base de datos que pediría `supabase db pull`.

---

## Mapa del código

```
app/
  actions/          Server Actions. Una por dominio + core.ts (clientes) e index.ts (barril).
                    core.ts NO se reexporta al cliente: rompería la serialización.
  lib/              Lógica pura y testeable + auth.ts + supabase/{server,client}.ts
  components/
    Admin/          Panel de administración (usuarios, temario, banco, moderación, logs)
    student/        Dashboard del alumno: 7 módulos en modules/
docs/               Auditoría y plan de trabajo
tests/              Vitest
```

**El esquema de la base de datos NO está en el repositorio.** Vive solo dentro
del proyecto de Supabase. Sacarlo con `supabase db pull` a `supabase/migrations/`
sigue siendo la tarea pendiente con más riesgo de pérdida y coste cero.

---

## Trampas conocidas

- **`npm run build` necesita las 4 variables de entorno.** `core.ts` lanza en
  tiempo de importación si falta alguna, y `page.tsx` crea el cliente en el
  módulo, así que el prerender falla.
- **Ya no quedan `any` en `app/`, y hay un test que lo vigila.** Eran la razón por
  la que los desajustes de nombres de campo llegaban a producción sin que nadie se
  enterara, y no era teoría: al ponerles un tipo de verdad salieron solos tres
  campos que llevaban meses pintándose y no existen — `u.total_tests` y
  `u.win_rate` (siempre "0" y "0%" en el panel de usuarios), `q.difficulty` (la
  columna es `difficulty_level`) y `q.topic` sobre `question_bank` (la tabla
  guarda `subject_id`).
- **El orden de la fase 1 está invertido respecto al plan.** La 1.3 (activar RLS)
  fue antes que la 1.2 (acotar la clave de servicio), por lo explicado arriba.
- **Un error de escritura de Supabase no se ve en pantalla.** Se registra en consola y
  la acción devuelve `success: false`, pero si la UI no lo cuenta, el alumno cree que
  guardó. Así estuvieron rotos meses el guardado de tests y el de repasos. Cuando algo
  "no se guarda", mira el log del servidor antes que el navegador.
- **Los ficheros de `docs/sql/` se escribieron deduciendo el esquema del código.** Los
  ejecutados ya están corregidos contra la base de datos real, pero si escribes uno
  nuevo, contrástalo con `supabase/schema.json` antes. Los tres primeros nombraban
  columnas y tablas que no existían.
- **`getUserStats` hace un join que necesita la FK declarada.** PostgREST no resuelve
  un join sin ella. `question_attempts.question_id -> question_bank.id` se declaró en la
  fase 2.8. El respaldo que degrada a consulta plana sigue ahí como red.
- **El esquema es el cuello de botella, no el código.** Varias cosas del plan están
  paradas porque necesitan una columna o una tabla, y el DDL solo lo puedes ejecutar
  tú desde el editor SQL de Supabase. Cuando algo se quede bloqueado por eso: deja el
  guion escrito en `docs/sql/` con el *por qué* dentro, y sigue por otra parte. Lo que
  **no** vale es escribir el código antes — PostgREST rechaza la escritura entera y
  rompe el guardado en producción.
- **Los comentarios del código mienten a veces.** El del seed decía "asumimos
  activas" justo encima de `status: 'candidate'`. Fíate del código, no del
  comentario, y corrige el comentario cuando lo veas.

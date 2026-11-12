# Traspaso — estado a 11 de noviembre de 2026

Qué hay hecho, qué falta y cómo seguir. Las normas de trabajo están en
[`CLAUDE.md`](../CLAUDE.md), y el porqué de cada regla en
[`REGLAS.md`](REGLAS.md). El traspaso anterior (septiembre) está en
[`TRASPASO-SEPTIEMBRE.md`](TRASPASO-SEPTIEMBRE.md), y la tabla de estado de
fase en fase, en [`HISTORIAL.md`](HISTORIAL.md).

---

## 1 · Dónde estamos

- **La plataforma es de Alphapol** (academia de Málaga, https://alphapol.es)
  desde el 6 nov. El repo se sigue llamando `atenea`.
- **Producción:** https://atenea-eight.vercel.app. Cada push a `main` despliega
  solo en Vercel.
- **Ramas:** cada sesión trabaja en su rama (`ccr-…`) y llega a `main` por un
  pull request cuando el dueño pide desplegar. `npm run check` (typecheck +
  tests) y `npm run build` en verde.
- **La base de datos (Supabase, `ecupmlqimmpybbrlrmpx`) está limpia:**
  - **4 cuentas.** `gaepmalaga@gmail.com` es el superadmin (el dueño).
    `prueba.admin@alphapol.es`, `prueba.alumno@alphapol.es` (en Alpha, sin
    entrenos: el destino para probar «Copiar a varios») y
    `prueba.entreno@alphapol.es` (en Kappa, con el entreno de ejemplo de
    noviembre, regla 98) son de prueba; sus contraseñas las tiene el dueño y
    **no se escriben en el repo**.
  - **1 academia**, `alphapol`.
  - **El banco:** 4.617 preguntas activas sobre 45 temas y 56 documentos.
  - **Datos de ejemplo de física:** las 31 sesiones de noviembre son el
    entreno individual de `prueba.entreno` (regla 98). El grupo de ejemplo
    «Promo 43 · Físicas» se retiró.
  - **La semana del 9 al 15 de noviembre está publicada** (regla 98) y tiene
    escrito el cuadrante que se mandó por WhatsApp (16 celdas, regla 100); las
    demás semanas, no: de ellas los alumnos ven solo el horario de su grupo.
  - **Profesores habituales de física** (regla 100): Boxeo → Juan, Jiujitsu →
    Lucas, F.M + RDL → Lucio y luego José, FLK → José y luego Olivares. Los
    temas de teoría de cada profesor, aún sin poner.
  - **Los grupos reales de física (9 nov, regla 96):** «Promo 44 · Kappa, Alpha,
    Zetta, Omega, Sigma, Betta, Delta» y «Promo 44 · Multi», con su horario
    (lunes y miércoles / martes y jueves; 08:00 o 20:00), aforo 30, y los
    profesores como nombres en `academy_staff` (José Morato, Lucas, Olivares,
    Lucio, Juan, Sofía). Sin alumnos dentro todavía: se asignan desde la ficha
    de cada alumno (regla 53).
- **Gemini funciona.** El modelo es `gemini-3.5-flash-lite`, probado en
  producción el 7 nov (regla 92). Se paga por **prepago**: si se acaba el
  saldo, toda la IA falla con un `402`.
- **Dossier para los dueños de Alphapol:**
  https://claude.ai/artifact/K1914obJCiygaLSJAH9nRb. Es privado; lo comparte el
  dueño.

### Qué puede hacer cada uno

| Quién | Pestañas / módulos |
|---|---|
| **Alumno** | Inicio · Test (entrenamiento adaptativo / simulacro con nota del BOE) · Repasar fallos · Fichas · Preparación física (un calendario con sus clases de grupo —hora, profesor, «sin clase», «no voy»— y sus entrenos; apuntar lo hecho, marcas con baremo, 1RM; los multis eligen con qué grupo van) · Mi evolución · Mi perfil (convocatoria, clases que no son de física y avisos de falta, acceso y pago, cambiar contraseña) |
| **Admin de la academia** | Alumnos (lista por urgencia, ficha, alta en bloque, solicitudes) · Grupos (crear, cambiar y borrar; días, horas, plazas, profesores, Multi) · Profesores (el equipo, sus grupos, sus clases de física de la semana, el profesor habitual de cada clase y los temas de cada uno con cómo van sus alumnos) · Asistencia · Prep. física (cuadrante semanal con días sin clase y multis; Planificar el entreno de cada alumno, con copiar a varios; plantillas, feedback, marcas) · Pagos (rejilla mensual) · Banco Oficial · Moderación · Ajustes · Logs & Auditoría |
| **Superadmin** | Temario & IA (generar preguntas) · Banco Oficial · Moderación · Consumo IA · Academias |

El chat («Pregunta al temario») y la entrevista están **fuera del MVP** (regla
58): el código existe entero y no se ofrecen.

---

## 2 · Lo último que se hizo (6-9 nov)

Todo en producción y apuntado en `REGLAS.md`:

| Qué | Regla |
|---|---|
| Marca Alphapol, limpieza de la BD, plantillas de correo de Supabase | 81 |
| Asistencia (horario, plazas, avisos de falta) | 82 |
| Alta de alumnos en bloque con contraseña provisional | 83 |
| Tono: fuera la jerga militar y el reloj «ZULU» | 85 |
| Física como TrainingMonkeys (sesiones sueltas, plantillas, feedback, baremo) | 86 |
| Pantalla de carga e icono, en vector | 87, 88 |
| 1RM y cargas en % que el alumno ve en kilos | 89 |
| Pantallas de entrada nuevas (entrar, crear cuenta, contraseña…) | 90 |
| Panel «Alumnos»: las cuentas las hace la BD (sin tope de 20.000) | 91 |
| El banco paginado (antes solo se veían 1.000 de 4.617) | 74 |
| Gemini al modelo nuevo, y el panel dice por qué falla una generación | 92 |
| Las dudosas (marcar «dudo» y si compensa contestar) | 80 |
| Imagen al compartir el enlace (WhatsApp) | 93 |
| Identidad de marca (marino y oro), Inicio «Tu día», Test, Fallos, Evolución, Perfil, Física y Fichas rediseñados | 94, 95 |
| Cuadrante semanal de física: rejilla grupo × día con profesor por sesión, copiar semana, imagen y texto para WhatsApp; los multis se apuntan a las clases | 96 |
| Clases de grupo y entreno individual, separados: el cuadrante solo con grupos con horario, días «sin clase» (`class_days_off`), editor de celda sin «Tipo» y con sugerencias, copiar celda, multis desde el preparador; «Planificar» por alumno con copiar a varios; el calendario del alumno con clases (profesor, sin clase) y entrenos; profesor con cuenta | 97 |
| Publicar el cuadrante por semanas; el ejemplo de física, entreno de `prueba.entreno`; fuera el grupo de ejemplo, «Jdjd» y las dos tablas del plan viejo | 98 |
| Pestaña «Profesores»; «Grupos» con Multi, horas escritas y borrar con confirmación; el cuadrante añade cualquier día (un sábado), quita un solo grupo y enlaza a «Grupos» | 99 |
| El profesor habitual de cada clase se pone solo en el cuadrante (y salta al siguiente si está ocupado); los temas de cada profesor y cómo van sus alumnos en ellos | 100 |

---

## 2b · El panel nuevo y las cuotas (9-10 nov, YA EN `main`)

El rediseño del panel y las cuotas están fusionados en `main` (pull requests
22 a 26) y por tanto desplegados. Reglas 101 a 104 y 107.

- **Rediseñado** (esquinas pequeñas, barra lateral, tablas que pasan a tarjetas
  en móvil, todo a 44 px): Alumnos, Grupos, Profesores, Asistencia, **Prep.
  física**, Pagos, Temario & IA, Banco oficial, Moderación, Ajustes, Consumo IA
  y Logs. Sin tocar: «Academias» (superadmin) y el compositor de preguntas.
- **Pagos** (regla 104): la cuota sale de los grupos (precios por tipo y packs
  en «Grupos»), cada cobro es un recibo del libro con su método, y la caja sale
  del libro. El de la otra sesión (`pagos-contabilidad.sql`, método y recibo
  por mes) se retiró sin ejecutarse.
- **Lo que queda:**
  1. **[`docs/sql/pagos-cuotas.sql`](sql/pagos-cuotas.sql) está ejecutado.**
     El código que lo necesita ya está en producción: SIN ÉL, «Pagos» y
     «Grupos» fallan (piden columnas y tablas que no existen). El commit
     `ecfb153` dice «comprobado contra la base de datos real», pero desde la
     **Confirmado el 11 nov contra la base de datos real: está aplicado.**
  2. Poner los precios en «Grupos» → «Tipos de grupo y precios».
  3. Mirar el panel en el móvil de verdad, sobre todo Pagos, Grupos y Prep.
     física.
- **Lo que se quitó y puede echarse de menos:** reordenar las pestañas, y la
  «evolución del acierto» de la ficha del alumno (no hay serie semanal en la
  base de datos de donde sacarla).
- **Cambios de comportamiento a propósito:** «Descartar del banco» solo dentro
  del editor de la pregunta; apagar un módulo, suspender a un alumno o borrar
  un tipo de grupo piden confirmación; la barra del móvil lleva Alumnos,
  Asistencia, Prep. física y Pagos.

## 2c · El calendario de la academia (9 nov, regla 105)

Pestaña «Calendario» del panel (la primera): todo lo programado en día, semana
y mes, con filtros por qué, grupo y profesor. No tiene tabla propia: sale del
horario de los grupos, el cuadrante de física, los entrenos, los días sin
clase y el examen.

## 2d · Datos de demostración (10 nov, regla 106, YA EN `main`)

Tarjeta «Datos de demostración» en Ajustes: carga ~45 alumnos inventados con
grupos, cuadrante, entrenos, marcas, asistencia y 6 meses de cobros, y los borra
quitando exactamente lo que creó. **Antes de usarla:** ejecutar
[`docs/sql/demo-registro.sql`](sql/demo-registro.sql) (una tabla nueva, con el
visto bueno del dueño; `schema.json` ya la trae escrita a mano: regenerarlo
después con `node scripts/schema-snapshot.mjs`). El código está desplegado y
el guion, ejecutado (confirmado el 11 nov). La primera carga de verdad la hace el
dueño con el botón. Detalles y límites en la regla 106.

## 2e · Afianzar antes del piloto (11 nov, reglas 108 a 113, en la rama `claude/trusting-archimedes-air2im`, sin desplegar)

Revisión entera del proyecto antes de meter alumnos de verdad. El plan
acordado: **nada nuevo hasta afianzar lo que hay**; después, piloto con los
alumnos veteranos y solo el test; luego física con ese grupo; luego toda la
academia.

| Qué | Regla |
|---|---|
| Next.js 16.1.6 → 16.4.6 (tenía avisos de seguridad, uno crítico); `npm audit` a cero | — |
| Los errores de la BD ya no viajan al navegador; quedan en «Logs» → «Fallos» | 108 |
| Los módulos se apagan por academia; `getGroups` y «Alumnos» acotados y paginados; fuera dos acciones sin uso que leían todas las academias | 109 |
| El acierto lo calcula el servidor; guion del disparador para la BD | 110 |
| La clave provisional del alta en bloque obliga a cambiarse; mínimo único de 8 | 111 |
| Cabeceras de seguridad (política de contenido, sin marcos) | 112 |
| Cada panel en su trozo: el JavaScript mayor baja de 1,09 MB a 359 KB | 113 |
| Fuera `reseed-demo.yml`: se lanzaba cada noche contra un guion que ya no existe | — |

**Probado:** `npm run check` (1.471 tests), `npm run build`, la entrada en un
navegador con las cabeceras puestas (sin avisos en la consola), «Logs» y la
pantalla de clave en el banco de pruebas, y el disparador en un Postgres local.

**Hecho en la base de datos real el 11 nov** (con el visto bueno del dueño):

- Ejecutado [`docs/sql/acierto-lo-decide-el-servidor.sql`](sql/acierto-lo-decide-el-servidor.sql).
  El disparador `corrige_respuesta` está activo, y se probó como alumno dentro
  de una transacción que se deshizo entera: quien falla y manda «acierto»
  queda como fallo, quien acierta queda como acierto, y un UPDATE no lo cambia.
- El mínimo de la contraseña en Supabase Auth está en 8 (estaba en 6).
- Confirmado que `pagos-cuotas.sql` y `demo-registro.sql` SÍ están aplicados:
  existen `payment_entries`, `fee_packs`, `receipt_counters`, `demo_registro`,
  `group_kinds.price_eur` y las tres funciones de cobro.

**Probado el 11 nov en la app local contra la base de datos real**, con dos
cuentas temporales que se borraron al terminar (no quedó nada):

- «Alumnos» y «Grupos» cargan con la consulta nueva (45 alumnos de
  demostración con sus grupos).
- Un fallo provocado (una columna inventada, solo en local) enseña el mensaje
  corto, no el de Postgres, y sale en «Logs» → «Fallos» con quién, dónde y el
  código. Repetido, se guardó una sola vez.
- El alta en bloque crea la cuenta con la marca; al entrar con la clave
  provisional solo se ve «Elige tu contraseña»; repetir la provisional se
  rechaza (aviso traducido); con una nueva se entra y ya no la vuelve a pedir.
- «Ajustes» lee bien los interruptores (Fichas apagado, como en la BD).

**Lo único sin probar:** APAGAR un módulo desde «Ajustes» y ver que el alumno
lo nota. No se hizo porque apaga el módulo en producción mientras dura la
prueba; la lógica está cubierta por tests (`afianzar.test.ts`, regla 109).
Conviene hacerlo una vez a mano al preparar el piloto.

**La rama está lista para desplegar** cuando el dueño lo pida.

**El entorno de la nube `atenea-lectura-web`** tiene desde el 11 nov el token
de gestión de Supabase como secreto de red: `scripts/nube/sql.sh` funciona
desde él, y tiene permitido el host del proyecto
(`ecupmlqimmpybbrlrmpx.supabase.co`), así que `arrancar-local.sh` también.
`ejecutar-sql.mjs` necesita además
`NEXT_PUBLIC_SUPABASE_URL=https://ecupmlqimmpybbrlrmpx.supabase.co` delante.

## 2f · Cuatro funciones nuevas (11 nov, reglas 114 a 117, desplegadas)

Tras desplegar lo de afianzar (PR 27, ya en `main`), se construyó, por este
orden: perfil del alumno, exámenes en papel, informe semanal y psicotécnicos.

| Qué | Regla | Dónde | Guion de esquema |
|---|---|---|---|
| Nombre, teléfono y foto del alumno | 114 | «Mi perfil» → Mis datos; ficha de «Alumnos» | `perfil-alumno.sql` |
| Cuestionario, hoja de respuestas y plantilla en PDF con la marca de Alphapol | 115 | Panel → «Exámenes en papel» | ninguno |
| Informe semanal con señales de abandono, copiar a WhatsApp y PDF | 116 | Panel → «Informe semanal» | `informe-semanal.sql` |
| Psicotécnicos generados por código (6 tipos, contra el reloj) | 117 | Alumno → «Psicotécnicos» (módulo `psico`) | `psicotecnicos.sql` |

**Los tres guiones están EJECUTADOS en producción (11 nov)** y comprobados:
las tres columnas de `profiles`, el cubo `avatars`, la función
`panel_actividad_semanal` (el alumno no puede llamarla) y `psico_sessions`
(RLS activa, cero políticas). `supabase/schema.json` está refrescado.

**Probado en la app local contra la base de datos real**, con un admin y un
alumno temporales que se borraron al terminar (también la foto del
almacenamiento; no quedó nada):

- Foto: se sube, queda un JPEG de 1 KB en el cubo y su dirección pública
  responde. Nombre y teléfono se guardan limpios (`600 12 34 56` →
  `600123456`) y un teléfono inválido se rechaza con su mensaje.
- «Alumnos»: se busca por NOMBRE, sale la foto en la lista y el teléfono es un
  enlace `tel:` en la ficha.
- Psicotécnicos: una sesión de 15 con los seis tipos; 10 contestadas y 5 en
  blanco; el servidor guardó semilla, versión, respuestas (`-1` los blancos),
  nota y duración, y la corrigió él.
- Informe semanal: 48 alumnos reales (de demostración), 5 para llamar y 3 para
  vigilar, con su motivo; el PDF se descarga.
- Exámenes en papel: salen los tres PDF con 100 preguntas del banco real.

**Sin probar de ninguna manera:**
- **Los PDF impresos.** Se han mirado en pantalla; antes de fotocopiar cien,
  imprimir UNA hoja de respuestas y comprobar que cabe y se lee.
- **Que la hoja de respuestas la lea una lectora óptica.** Es una réplica de la
  forma, no del formato exacto (marcas de tiempo, tolerancias): sirve para que
  el alumno practique, no para corregir con máquina.
- **El nivel de los psicotécnicos** (regla 117).

**Ideas que quedan:** mandar el informe semanal cada lunes (a quién); más
tipos de psicotécnico (dominós, rotaciones); que el profesor vea el informe
solo de sus grupos.

## 2g · Exámenes en clase (12 nov, regla 118)

Lo que pidió el dueño: generar un examen con filtros, guardarlo, ponerlo a un
turno (martes y jueves por la mañana), y llevar un registro por alumno de sus
exámenes presenciales, su nota y su evolución. El profesor NO teclea las
respuestas: las mete cada alumno, en clase o en casa.

- **Academia** (Exámenes en papel → 3 pestañas): *Preparar* (bloques, temas
  sueltos, dificultad, no repetir), *Guardados* (reimprimir, ponerlo a un
  turno) y *En clase* (quién ha entregado, notas, preguntas más falladas, nota
  oficial, «no se presentó», «que repita», plazo).
- **Alumno** (módulo `presencial`, «Exámenes»): lista, meter las respuestas
  (tocando o escribiéndolas de seguido), revisión con la solución, evolución.
- **Informe semanal:** no presentarse a un examen en clase y suspenderlo son
  señales de abandono.

**El guion [`docs/sql/examenes-clase.sql`](sql/examenes-clase.sql) está EJECUTADO
en producción (12 nov)** (tres tablas, RLS activa y cero políticas) y
`supabase/schema.json` está refrescado.

**Probado en la app local contra la base de datos real** con un admin y dos
alumnos temporales, que se borraron al terminar (también el examen, la
aplicación y los resultados; no quedó nada):

- Preparar 25 preguntas del temario, guardarlo (queda con sus 25 preguntas
  COPIADAS y sus ids) y ponerlo a un turno (toda la academia: 49 participantes).
- El alumno mete sus respuestas escritas de seguido (15 bien, 5 mal, 5 en
  blanco): el servidor corrige **5,00**, lo guarda una vez, y tras entregar ya
  no deja volver a meterlas y enseña «Ver la solución».
- La nota oficial del profesor (7,5) manda sobre la calculada y el alumno la ve
  como «nota oficial»; una nota de 11 se rechaza con su mensaje y el campo
  vuelve a lo guardado.
- Marcar «no se presentó»: el alumno ve «No te presentaste» y el informe
  semanal lo marca «Vigilar: No se presentó al examen en clase».

**Hoja de respuestas y plantilla rehechas (12 nov):** la primera versión se
veía mal (círculos tan grandes que se tocaban, relleno encima del vecino, todo
el fondo rosa, datos desvaídos y 28 marcas de agua). Se midieron las
proporciones sobre la hoja original a 200 ppp: círculos pequeños con aire,
relleno en pastilla, fila de respuesta blanca y solo la de «anular» teñida,
columna del número blanca (zona 1) o naranja (zona 2), datos en azul marino y
pocas marcas de agua. Para ver un PDF: `pdftoppm -r 200 -png fichero.pdf salida`
y mirar la imagen (un PDF que solo se lee como texto no enseña esto).

**Sin probar contra la base de datos real:** «Que repita», el plazo cerrado,
y poner el examen solo a ciertos grupos (se probó a toda la academia).

**Siguiente (acordado con el dueño):** la dificultad. Primero una estimación
inicial: yo clasifico a mano una muestra de ~150 preguntas con una rúbrica,
Gemini clasifica la misma muestra, se compara y se ajusta el prompt; luego
Gemini clasifica las 4.617 (ensayo gratis antes de pagar) y las que lleguen.
Después se sustituye por la dificultad MEDIDA con estos exámenes y con los
alumnos, y el preparador puede corregirla a mano en «Banco oficial».

## 3 · Lo que falta

### 3a · Necesita al dueño o a Alphapol (no es código)

1. **Subdominio propio** (p. ej. `campus.alphapol.es`). Hay que:
   - añadirlo en Vercel (proyecto `atenea`);
   - crear el CNAME en Hostinger, donde está el DNS de alphapol.es;
   - poner la URL nueva en Supabase (*Authentication → URL Configuration*: Site
     URL y Redirect URLs, sin borrar la de localhost);
   - definir `NEXT_PUBLIC_SITE_URL` en Vercel.
2. **Correo desde `@alphapol.es`.** Hay que verificar `alphapol.es` en Resend
   (sus registros van en el subdominio `send.` y no chocan con el correo de
   Hostinger) y definir `MAIL_FROM` en Vercel. Hoy sale de
   `ateneapolicial.com` con «Alphapol» como nombre.
3. **Logo en vector de Alphapol.** Si lo mandan, se sustituyen
   `public/marca/alphapol-{isotipo,logotipo,nombre}.svg` y se regeneran los
   iconos con `node scripts/marca/iconos.mjs` (regla 88).
4. **Decisiones aplazadas por el dueño:**
   - **Planes de pago y cuentas propias de Alphapol.** Vercel Pro: el plan
     Hobby no admite uso comercial. Supabase Pro: el Free no hace copias de
     seguridad (un grupo borrado sin querer el 6 nov no se pudo recuperar) y
     limita a 30 correos por hora. **No hay que migrar nada a mano:** los dos
     servicios dejan TRANSFERIR el proyecto a otra organización o equipo
     (Supabase: *Project Settings → General → Transfer project*; Vercel:
     *Settings → General → Transfer*). El proyecto conserva su URL, sus claves
     y sus datos. Orden: Alphapol crea su organización y su equipo con el plan
     Pro, invita al dueño actual, y se transfiere. Leer la página de ayuda de
     cada uno ese día: las condiciones cambian.
   - Las cuentas reales de los alumnos (con «Alta en bloque»).
   - Las preguntas propias de Alphapol.
   - Precios, contrato y RGPD.
5. **Revocar el token de gestión de Supabase** cuando ya no haga falta trabajar
   desde la nube (está como secreto de red del entorno).
6. **Vigilar el saldo de prepago de Gemini.**

### 3b · Código, cuando se pida

- **Identidad de Alphapol en el panel de administración** (regla 94): hereda las
  etiquetas, los números y las superficies de marca, pero su maquetación es la
  anterior. Todas las pantallas del alumno ya están.

- **Strava / Garmin** (aplazado por el dueño, «más adelante»). La API es
  gratis y son 2-3 días de trabajo. Strava deja conectar un solo atleta hasta
  que revisa la aplicación, y sus términos ponen condiciones a enseñar los
  datos a un entrenador.
- **«Ver huecos» de las clases para el alumno** (aplazado: de momento solo los
  ve la academia, regla 82).
- **Física, si Alphapol lo pide al usarlo:** una vista «mis clases» para el
  profesor que tenga cuenta enlazada (regla 97); avisar a los alumnos cuando
  se publica la semana (hoy se avisa por WhatsApp, regla 98).
- **`prueba.entreno` se creó con SQL** (regla 98): desde la nube no se pudo
  probar a entrar con ella. Si no entra, `npm run cuenta -- prueba.entreno@alphapol.es 'clave' student`
  desde un ordenador le pone la contraseña.
- **Regla 79, abierto:** pulsar «Generar» dos veces deja dos planes de IA
  activos. Hoy no afecta: la IA de física está apagada para Alphapol.
- **P11h** (elegir academia si una cuenta está en varias): no hace falta con
  una sola academia.

- **Ideas habladas con el dueño (11 nov), para DESPUÉS del piloto:** perfil
  del alumno editable (nombre, teléfono, foto), informes semanales, señales de
  abandono más finas, exámenes a PDF, y psicotécnicos (los verbales y
  numéricos caben como un bloque más del banco con reloj por pregunta; los de
  figuras piden preguntas con imagen generada por código). Antes, ver la
  plataforma que usa hoy la academia.
- **Preguntas del temario propio de Alphapol:** generarlas fuera de la
  aplicación y meterlas por la importación que ya valida
  (`importManualQuestions`, regla 27) hacia moderación.
- **RGPD:** contrato de encargado de tratamiento antes de cargar los correos
  de los alumnos.
- **`ActiveTest.tsx` (1.293 líneas)** sin partir, a propósito (regla 113).

### 3c · Sin probar con uso real

- **El panel «Alumnos» con ~100 alumnos de verdad.** Las cuentas las hace la
  BD (regla 91) y está probado con 1.680 respuestas inventadas, pero no con
  carga real.
- **Lo que solo se ve con alumnos reales:** solicitudes de alta con correo
  (regla 70), y la asistencia y la física usadas a diario.

---

## 4 · Cómo trabajar en este repo (receta corta)

```bash
npm ci
npm run check          # SIEMPRE antes de cada commit
npm run build          # con las 4 variables definidas (sirven inventadas)
cd .banco-pruebas && node compilar-css.mjs && node construir.mjs   # banco de pruebas (regla 38)
```

**Desde una sesión en la nube** (sin `.env.local`), con el secreto de red de
`api.supabase.com`:

```bash
scripts/nube/sql.sh "select count(*) from profiles"              # SQL contra la BD real
scripts/nube/arrancar-local.sh > /tmp/dev.log 2>&1 &             # app en :3100 contra la BD real
NODE_USE_ENV_PROXY=1 SUPABASE_ACCESS_TOKEN=proxy-injected node scripts/operacion/ejecutar-sql.mjs docs/sql/X.sql
```

**Probar en una pantalla:** levanta la app local, entra con las cuentas de
prueba (con Playwright, `require('playwright')`, sin instalar nada) y **deshaz
lo que crees**. La BD es la de producción.

**Probar la IA** (no funciona en local, la clave de Gemini es falsa). Se hace en
producción:

1. Sube `prueba.admin` a superadmin:
   `update profiles set role='superadmin' where email='prueba.admin@alphapol.es'`.
2. En «Temario & IA», genera 1 pregunta con el modo «A moderación primero».
3. **Devuélvelo a `admin`.**
4. Borra la candidata: la fila de `question_bank` con `status='candidate'` de
   los últimos minutos.

**Un cambio de esquema:**

1. Escribe el guion en `docs/sql/` con el porqué dentro.
2. Ejecútalo con `ejecutar-sql.mjs` o pídeselo al dueño.
3. `node scripts/schema-snapshot.mjs` para refrescar `supabase/schema.json`.
4. Solo entonces escribe el código: PostgREST rechaza la escritura entera si
   falta una columna.

**Desplegar:** se trabaja en la rama de la sesión. Para producción, y **solo si
el dueño lo pide**, se abre un pull request de esa rama a `main` con las
herramientas de GitHub y se fusiona (el `git push` directo a `main` está
bloqueado). Para saber si Vercel ya lo ha desplegado, mira si cambia la lista
de `/_next/static/chunks/*.js` del HTML de producción.

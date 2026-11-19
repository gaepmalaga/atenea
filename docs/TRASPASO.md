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

**Siguiente (acordado con el dueño): la dificultad** — detalle, rúbrica y
método en [`DIFICULTAD.md`](DIFICULTAD.md). **Ya hecho:** una muestra de 150
preguntas (3 por tema, reproducible) clasificada a mano con la rúbrica:
10 % fáciles, 41 % medias, 49 % difíciles (el bloque jurídico es mucho más
duro). **Falta:** que Gemini clasifique esa misma muestra y medir el acuerdo
(solo funciona en producción: va por el flujo «Operación»); luego clasificar las
4.617 (con ensayo gratis antes de pagar), una columna `difficulty_source` para
que la estimación y la mano del preparador no se pisen, y la dificultad medida
con los exámenes en clase. **De paso salió** que el banco tiene muchas
preguntas casi repetidas (hasta cuatro variantes del mismo concepto): conviene
una pasada de similitud antes de que un examen lleve dos de la misma familia.

## 2h · Preguntas repetidas (12 nov, regla 119, en la rama, sin desplegar)

El banco tiene un 34 % de preguntas que son otra con distintas palabras (1.562
de 4.617; 3.055 hechos distintos; el mayor, 26 veces). Se agrupan en familias
(`question_bank.family_id`, `npm run familias`) y los exámenes (simulacro del
alumno y examen en papel) no meten dos de la misma familia mientras haya
bastantes. **No se ha borrado ni desactivado nada.**

- **Hecho en producción:** guion `familias-preguntas.sql` ejecutado (una columna)
  y familias guardadas: 2.290 preguntas en 728 familias, 2.327 sueltas, la mayor
  de 26. Una segunda pasada no cambia nada.
- **Probado:** 20 tests nuevos (la detección, las tres salvaguardas contra falsos
  positivos, el planificador) y una simulación de exámenes sobre el banco real.
  SIN probar en la pantalla de la app contra la base de datos (no hubo cuenta
  de prueba): al generar un examen de un tema flojo debe salir el aviso «no hay
  bastantes preguntas distintas».
- **Lo que hay que mirar:** los temas con pocos hechos distintos
  (`docs/dificultad/hechos-por-tema.json`): 31, 45, 39, 32, 33, 28, 29, 30, 24.
  Ahí es donde meter preguntas nuevas del temario de Alphapol.
- **Pendiente:** una pantalla en «Moderación» para ver cada familia y desactivar
  a mano las sobrantes (hoy solo se agrupan); repetir `npm run familias --
  --hazlo` cuando entren preguntas.


## 2i · Revisión de la plataforma actual y dos arreglos (12 nov, regla 120, en la rama, sin desplegar)

Con capturas de OpositandoPN (la plataforma que usa la academia hoy) se
comparó su test con el nuestro. Su motor no hace nada que no hagamos; la
diferencia está en el contenido (una «retroalimentación» propia por pregunta)
y el acabado. De ahí salieron dos cambios:

- **Arreglo:** el aviso de error de una pregunta decía «enviado» aunque la base
  de datos lo rechazase. Ya se mira el resultado.
- **Nuevo:** el resultado del simulacro enseña el rendimiento por tema.
  Visto en el banco de pruebas a tamaño móvil. SIN probar contra la base de
  datos real.

**Pendiente de esa comparación:** capturas de lo que no se vio (ranking, análisis
con IA). Un ranking por turno queda aparcado hasta que lo decida el dueño. Los
guiones `examen-completo.cjs` del banco de pruebas están desfasados («Iniciar
operación» ya no existe) y piden Edge, que no está instalado en la nube.


## 2j · Dificultad: clasificada, visible y corregible (12 nov, reglas 121 y 122)

Las 4.617 preguntas están clasificadas por la IA **en producción** (472 fáciles,
2.012 medias, 2.133 difíciles; columna `difficulty_source` creada; 5 céntimos).
La muestra contra tu clasificación a mano dio 73,3 % de acuerdo y ningún error
de dos niveles (`docs/DIFICULTAD.md`).

**En la rama, sin desplegar y sin probar contra la base de datos real** (solo en
el banco de pruebas, a tamaño móvil y escritorio):
- Etiqueta «Fácil / Media / Difícil» en la corrección del alumno.
- «Banco oficial»: columna y filtro de dificultad, y selector para que el
  preparador la corrija (queda como `preparador` y nada la pisa).
- «Banco oficial» → «Preguntas repetidas» (solo superadmin): quedarse con una de
  cada familia. **Descarta de verdad en producción** cuando se despliegue: pide
  confirmación y no borra, pero este panel no las recupera.
- `npm run dificultad:medida`, acciones `dificultad-medida-ensayo` y
  `dificultad-medida`. Ninguna pregunta llega aún a 30 respuestas reales, así que
  de momento no hay nada que medir.

Antes de desplegar conviene probar con la base de datos real, con una cuenta
de prueba: que la etiqueta salga, que guardar una dificultad en «Banco oficial»
la deje como `preparador`, y que «Preguntas repetidas» liste las 728 familias.


## 2k · Una sola academia: el admin toca el banco global; «Reactivar»; medición semanal (12 nov, regla 123)

- **Quién es quién hoy:** `prueba.admin@alphapol.es` es el único admin (una cuenta
  de PRUEBA, de la academia Alphapol) y `gaepmalaga@gmail.com` el superadmin. **El
  dueño y los preparadores aún no tienen cuenta.** Las crea el superadmin desde
  «Academias» → «Añadir admin» (invita por correo).
- **Admin:** lleva la academia (Calendario, Alumnos, Grupos, Profesores, Asistencia,
  Prep. física, Pagos, Informe, Banco oficial, Moderación, Exámenes en papel, Ajustes,
  Logs). **Superadmin:** el técnico (Temario & IA, Banco oficial, Moderación,
  Consumo IA, Academias); no ve ninguna pantalla de gestión de la academia.
- **Cambio:** con `UNA_SOLA_ACADEMIA = true` el admin edita, descarta y reactiva el
  banco global, ve «Preguntas repetidas» y recibe los reportes de los alumnos.
  Sin tocar: IA, consumo, crear academias y admins, «Vaciar banco».
- **«Reactivar»** en el editor de «Banco oficial» para las descartadas.
- **Medición semanal** de la dificultad: `.github/workflows/medicion-semanal.yml`,
  los lunes 05:17 UTC. Solo corre si está en `main`.
- **Sin probar contra la base de datos real:** que un admin de verdad vea y edite el
  banco global, y que le lleguen los reportes. Probarlo con `prueba.admin@alphapol.es`.
- **Pendiente de decidir con el dueño:** si los preparadores deben ver «Pagos». Hoy
  no existe un rol intermedio (regla 123).


## 2l · Comparativa con OpositandoPN (12 nov, solo documentación)

`docs/COMPARATIVA-OPOSITANDOPN.md`: dos rondas de lectura de la plataforma que usa la
academia hoy, con la sesión real de Alphapol y sin tocar nada. Conclusiones:
- **Puntuación idéntica a la nuestra** (regla 22). No hay nada que corregir.
- **Su motor no hace nada que no hagamos;** lo suyo es contenido: 671 esquemas
  visuales por subtema, normativa enlazada al BOE y 13 exámenes oficiales
  (nosotros tenemos 5, y decidimos dejarlo).
- **No se copia:** ranking (aparece en todos sus simulacros), gemas y duelos,
  análisis con IA agregado, planes de físicas genéricos.
- **Ellos solo gestionan licencias** (activo/inactivo): no hay panel pedagógico. La
  lista de alumnos activos que espera el dueño sale de ahí, con su visto bueno.
- **Pendiente del dueño:** Inglés (B1), si entra en la convocatoria; y si quiere
  esquemas visuales (trabajo de diseño).


## 2m · Exámenes en clase más cómodos (13 nov, regla 124, en la rama, sin desplegar)

Salió de probar la pantalla con la academia:
- **Sin «Cómo lo llamas»:** el nombre se pone solo (grupo y día), y es opcional.
- **Aviso de duplicados:** poner el mismo examen al mismo grupo dos veces pide
  confirmación (antes duplicaba a los alumnos sin avisar).
- **«En clase» en cuatro pestañas**, con una tabla compacta de alumnos, y
  **«Pegar notas»** para meter una columna del Excel de una vez.
- **Calculadora de nota** para el alumno, en «Exámenes».
- «Aplicación» desaparece de las pantallas: ahora «Exámenes puestos a un turno».

**Visto en el banco de pruebas, a tamaño móvil. Sin probar contra la base de datos
real.** Antes de dar nada por cerrado: ponerle un examen a un grupo con alumnos
reales, pegar unas notas, y comprobar que el aviso de repetir sale.
**Ojo:** el grupo «Promo 44» (28 alumnos) son 27 cuentas de demostración, que no
pueden entregar nada.

## 3 · Lo que falta

### 3a · Necesita al dueño o a Alphapol (no es código)

1. **Subdominio propio** (p. ej. `campus.alphapol.es`). **Paso a paso en `docs/DOMINIO-Y-CORREO.md`.** Hay que:
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
- **Ideas para CONSULTAR con el dueño y con los alumnos antes de decidir** (no se
  construye nada sin su opinión; en `docs/COMPARATIVA-OPOSITANDOPN.md` hay lo que
  hace la plataforma que usan hoy):
  - **Ranking.** Por turno o por grupo, nunca nacional, y quizá solo con el
    puesto de cada uno y no la lista completa, para no dejar en evidencia a quien
    tiene nota baja. Saldría de los exámenes en clase (regla 118).
  - **Duelos 1 contra 1** de unas 10 preguntas.
  - **Esquemas visuales** por subtema (trabajo de diseño; empezar por un piloto
    de 5-10 de los temas con más peso).
  - **Inglés (B1):** solo si la convocatoria lo exige.
  - **Un rol de «preparador»** con menos permisos que el admin (hoy no existe).
- **Estado de las ideas del 11 nov (12 nov):** *exámenes a PDF*, hecho (regla 115 y
  118); *perfil editable*, hecho (114); *informe semanal*, hecho (116, sin envío
  automático); *señales de abandono*, hecho en su versión principal (116);
  *ficha en PDF por alumno*, NO; *preguntas aportadas por los alumnos*, NO;
  *audio y vídeo en las preguntas*, NO.
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

## 2n · Prep. física, tema del panel, Inicio y psicotécnicos (13 nov, regla 125, en la rama, sin desplegar)

- «Planificar» (semáforo compacto, con nombres) y «Marcas» (tabla por pruebas, «Eliminado»).
- Selector Sistema/Claro/Oscuro en la barra del panel de administración.
- «Todos los alumnos (N)» en la pestaña Alumnos.
- El Inicio no enseña enlaces a módulos apagados (fichas, evolución, entrenar…).
- Psicotécnicos: cada sesión del historial se puede abrir y repasar.
- Pendiente de decidir con el dueño: ranking de clase en «Exámenes» y nota en el entrenamiento del test.

## 2o · Psicotécnicos: ejercicios del examen, tipos visuales y en clase (13 nov, regla 127)

- Ya desplegado: ejercicios 1, 2 y 3 «como en el examen» y los tipos de texto (PR 36).
- En la rama: ficha del alumno con sus psicotécnicos; cubos, desarrollos, plegados, giros y parentescos; y los **psicotécnicos en clase** (pestaña «Psicotécnicos» de «Exámenes en papel»).
- `docs/sql/psico-clase.sql` **ya ejecutado en la BD real** (13 nov): `psico_examenes`, `psico_clase` y `psico_clase_resultados`, con RLS y sin políticas.
- «Exámenes en papel»: se elige Teoría o Psicotécnicos y los dos siguen Preparar → Guardados → En clase.

## 2p · El equipo real de Alphapol (17 nov, regla 130, en la rama, sin desplegar)

- **Grupos de teoría reales** (en la BD, 17 nov): se borró el inventado «Promo 44» y se crearon los tres de la hoja de control: **L-X MAÑANAS** (lunes y miércoles 10-14), **M-J MAÑANAS** (martes y jueves 10-14) y **M-J TARDE** (martes y jueves 16-20). Horario PROVISIONAL a petición del dueño, aforo 35 los tres. Sin alumnos todavía: los 147 de `Control_Alumnos_Noviembre_2026.xlsx` no están cargados (faltan correos).
- **Profesorado de teoría** en los tres grupos: Sofía, Dorado, Sergio, Lucio y Enrique (todos rotan por todos). Alexys, de comisión en la ENP, está dado de alta como inactivo. Sofía y José Morato son los DUEÑOS (ella da teoría, él físicas) y los únicos que entrarán con cuenta de admin por ahora.
- **No hay selector de «quién da clase cada día» para teoría** (solo existe en el cuadrante de físicas). Lo que hay: profesores asignados al grupo y temas por profesor (regla 100).
- **Gabinete y secretaría** (Mariana y Sara) pasan a contar como equipo sin salir como profesoras: ver la regla 130. Sus altas en la BD se hacen DESPUÉS de desplegar (con el código viejo saldrían como opción de profesor).
- Los grupos de físicas de la hoja (Físicas 43 Clinic, Físicas 44 y Atletas) NO coinciden con los 8 de la plataforma (Alpha, Betta, Delta, Kappa, Omega, Sigma, Zetta y Multi): pendiente de que el dueño diga cómo encajan.

## 2q · La teoría y la física de grupo se programan desde el Calendario (18 nov, reglas 131 y 132)

Las clases de cada grupo de teoría salen en «Calendario»; al abrir una se
asigna UN profesor y los temas (con antelación o después, editable) y se ve
cómo lleva el temario ese grupo. Sin pestaña aparte.

- Tabla `theory_sessions` (`docs/sql/teoria-cuadrante.sql`, ejecutada el 18
  nov). Código: `app/lib/teoria.ts`, `app/actions/teoria.ts`
  (`saveClaseTeoria`, `getAvanceTeoria`, `copiarSemanaTeoria`),
  `ProgramaTeoria.tsx` (la ficha) y `armaCalendario` (parámetro `teoria`).
- «Profesores» cuenta CLASES dadas de teoría y de física por mes (se paga por
  clase, cada una suma 1), no horas.
- Regla 132: la física de grupo también se programa desde el Calendario (el
  editor del cuadrante, la barra de la semana, publicar y WhatsApp). «Prep.
  física» se queda con Planificar y Marcas.
- Regla 133: el último acceso (Logs y Alumnos) sale de la sesión renovada, no solo del último inicio de sesión. Función `ultimo_acceso_usuarios` creada en la BD real el 18 nov (`docs/sql/ultimo-acceso.sql`).
- Pendiente de mejora: aviso de «clases sin rellenar» en el Inicio del admin.

## 2r · Esquemas visuales del temario (19 nov)

Una página A4 apaisada por tema, con la marca de Alphapol, para regalar a cambio
de los datos del interesado. Lo que los distingue: un **radar del examen** (qué
cae del tema en los 5 exámenes oficiales 2021-2025, contado a mano: de las 20
preguntas que el documento etiqueta como Tema 1, 11 lo eran de verdad), la
pregunta real con su año junto a cada concepto, trucos de memoria y un QR al
Campus. El primero:
`temario/esquemas/tema-01.{pdf,png,html}`. Se genera con
`node scripts/resumenes/esquema-tema-01.mjs` (Chromium de Playwright; iconos de
Lucide a dos tonos, tipografía Barlow Condensed incluida en
`temario/esquemas/fuentes/`). Cada dato lleva su artículo, sacado del texto
consolidado del BOE (`temario/md/tema-01.md`). Para otro tema se copia el guion y
se cambia el contenido.

### Tema completo en PDF y DOCX (19 nov)

`node scripts/resumenes/tema-completo.mjs 01` genera `temario/completo/tema-01.{pdf,docx,html}`
(portada, índice con páginas, 11 apartados, las 11 preguntas reales 2021-2025,
test de 16 preguntas con soluciones y QR al Campus; papel con marca de agua y logo dorado de Sofía, `public/marca/oficiales/`). Todo sale de UNA fuente:
`temario/completo/tema-01.contenido.mjs`; el PDF, con Chromium
(`scripts/resumenes/tema-completo.css`), y el DOCX, con
`scripts/resumenes/tema_completo_docx.py`. Para otro tema se crea su
`tema-NN.contenido.mjs`. El esquema (`temario/esquemas/tema-01.pdf`) ya tiene 2
páginas: el esquema general y «La nacionalidad paso a paso». El DOCX
(`temario/esquemas/tema-01.docx`) es EDITABLE (tablas y texto de Word) y lo hace
`scripts/resumenes/esquema_docx.py`, que repite el contenido del esquema: si se
cambia un texto en `esquema-tema-01.mjs`, hay que cambiarlo también allí.

## 2s · Documentos compartidos de los admin (19 nov, regla 134)

Pestaña «Documentos» (Sistema): carpetas y archivos privados, solo para los
admin; cualquier admin sube y borra. Código: `app/lib/documentos.ts`,
`app/actions/documentos.ts`, `AdminDocumentos.tsx`, `tests/documentos.test.ts`.
**Ejecutado el 19 nov** `docs/sql/documentos.sql` en la BD real (dos tablas, el
depósito privado `documentos` y 5 carpetas iniciales), y desplegado. `supabase/schema.json` ya incluye las dos tablas.

## 2t · Revisar el examen en papel antes de imprimir (19 nov, regla 135)

- **Hecho:** «Exámenes en papel» tiene un paso nuevo, «Revisar las preguntas»,
  entre preparar y descargar: editar (sobrescribe el banco, con historial y
  «Volver a como estaba»), quitar del examen y añadir preguntas nuevas, que
  entran al banco privado como **pendientes**. «Banco oficial» no publica una
  pregunta sin explicación o sin dificultad, y la aprueba el admin (ya no solo
  el superadmin).
- **Falta, antes de desplegar:** ejecutar `docs/sql/historial-preguntas.sql`
  (la tabla `question_edit_history`). Hay que autorizarlo; sin ella no se puede
  editar ninguna pregunta.
- **Después:** las preguntas que se redacten desde el temario de Alphapol
  (Tomo I) entran por este mismo camino: banco privado, pendientes, y se
  aprueban desde «Banco oficial» cuando estén completas. La dificultad se pone
  con el clasificador de «Operación».

## 2u · Preguntas desde el Tomo I de Alphapol (19 nov, regla 136)

- **Hecho:** 985 preguntas nuevas en el **banco privado de Alphapol como
  pendientes** (`candidate`, `origin='manual'`), redactadas desde el temario de
  la academia (Tomo I, temas 4-12) con la ley como apoyo: tema 4 · 66, tema 5 ·
  69 (incluye las 20 de prueba), tema 6 · 103, tema 7 · 120, tema 8 · 272,
  tema 9 · 52, tema 10 · 181, tema 11 · 2 y tema 12 · 120. Cada una lleva
  explicación redactada (≥ 70 caracteres, no solo «lo dice el art. X»),
  referencia legal (la ley, nunca «Tomo I») y su página del Tomo en el registro
  de la sesión. Los temas 6, 10 y 12 quedan por debajo del tope porque el texto
  se agota antes; con lo que ya había superan el objetivo de cobertura del plan.
- **Dificultad:** puesta el 19 nov por el clasificador de «Operación» (acción
  `dificultad-nuevas`, regla 121, lanzada desde la rama) a las 985 pendientes y
  a las 725 activas de la batería que estaban sin clasificar: 1.710 escritas,
  ningún fallo, 0,15 $. Pendientes: 68 fáciles, 356 medias y 561 difíciles (el
  modelo las ve duras porque preguntan órganos, plazos y cifras concretas; el
  tutor puede corregirla, regla 122). Ya están **completas** para aprobarse.
- **Antes de aprobarlas en bloque hay que desplegar la rama:** en `main`,
  «Publicar las N completas» manda todos los id en una sola consulta y con
  cientos de preguntas la URL se pasa de largo; el arreglo (tandas de 100,
  commit `bae9bad`) está en la rama sin desplegar.
- **Repetidas:** ensayo de familias (regla 119) con activas + pendientes: 67 de
  las 985 repiten un hecho que ya estaba activo y 29 se repiten entre sí. No se
  borran: `npm run familias -- --hazlo` las agrupa cuando se aprueben (solo
  mira las activas).
- **Dudas apartadas para el tutor (no se subieron):** cifras que el autor anota
  «en la actualidad» (UCOP, número de comisarías y puestos fronterizos, Junta de
  Gobierno, países de Schengen), la duración de la residencia no lucrativa con
  el RD 1155/2024 y la prórroga de Ucrania. **La importante:** el Pacto Europeo
  de Migración y Asilo se aplica desde el 12-6-2026; las 26 preguntas de
  procedimiento de la Ley 12/2009 (tema 12, plazos de solicitud, frontera y
  resolución) pueden estar desplazadas por el Reglamento (UE) 2024/1348. Hay
  que contrastarlas con la Instrucción de la Subsecretaría de 11-6-2026 antes de
  aprobarlas.
- **Falta:** desplegar la rama, que el tutor revise y apruebe desde «Banco
  oficial», y después `npm run familias -- --hazlo`.
- **Corregida (19 nov):** una pregunta ACTIVA del tema 7 sobre el CEISE tenía
  una respuesta «correcta» sin sentido (id `8bb7c761-d22f-4bbe-be9c-8163046782ce`).
  Se reescribió con su anotación en `question_edit_history` (se puede volver
  atrás desde «Banco oficial»).
- **Revisión una a una:** el tutor tiene una hoja con las 985 (página del Tomo,
  opciones, correcta, explicación, referencia, dificultad y avisos: 26 del Pacto
  Europeo y 68 que repiten un hecho activo). La hoja NO está en el repositorio:
  la tiene el dueño.
- **Pendiente de decidir:** 731 preguntas ACTIVAS del banco antiguo dicen en el
  enunciado «según el texto proporcionado» (o «adjunto», «propuesto»), que no
  tiene sentido para un alumno; 153 lo dicen en la explicación.
- El PDF del Tomo y los lotes **no viven en el repositorio** (es público): solo
  en la sesión y en la base de datos.

## 2v · Vigilancia de la normativa (19 nov, regla 137, en la rama, sin desplegar)

- **Hecho:** `npm run normativa` (`scripts/operacion/vigilar-normativa.mjs`,
  lógica en `app/lib/normativa.ts`). Para cada pregunta activa o pendiente lee
  la norma y el artículo que cita, baja del BOE el texto consolidado con todas
  sus versiones (API de datos abiertos, sin clave) y pregunta a Cellar (UE) qué
  actos modifican los reglamentos y directivas citados. Si el artículo cambia
  DESPUÉS de la fecha de la pregunta —o va a cambiar: la reforma ya publicada
  también cuenta—, deja un aviso «Cambio en la ley» en «Moderación → Requieren
  atención» con el enlace al artículo. No toca ninguna pregunta.
- **Cobertura (ensayo del 19 nov):** de 6.327 preguntas, 4.721 quedan
  vigiladas; 63 normas del BOE (todas las citadas por número se encontraron) y
  12 actos de la UE. Sin vigilar: 1.195 sin referencia legal, 89 que solo citan
  Tratados o Schengen, y 323 sin localizar: en 228 dos normas del mismo tema
  tienen ese artículo y la explicación no dice cuál (temas 8, 26, 21, 23, 25 y
  5), 69 referencias sin precepto («disposición final» a secas) y 46 en que el
  tema no deja clara la ley. El lector entiende cómo rotula el BOE cada norma:
  «Artículo 18.bis» (LO 4/2000) y en letra, «Artículo sesenta y cuatro bis»
  (LOPJ).
- **Hoy:** 5 avisos, los cinco del art. 69 del Reglamento General de
  Circulación (vehículos prioritarios): nueva redacción en vigor desde el
  1-10-2026 por el BOE-A-2026-13889, posterior al temario del que salieron
  esas preguntas. No se han escrito: quedan para la primera ejecución después
  de desplegar.
- **Barrido desde el 1-1-2026 (ensayo, NO escrito):** 136 avisos posibles, casi
  todos de pendientes del Tomo, cuya fecha es la de subida (19 nov) y no la de
  la edición del Tomo: RD 207/2024 arts. 1, 4 y 9 (los cambia el RD 353/2025,
  que el Tomo ya recoge), RD 1155/2024 arts. 126, 130, 132 y 172 (arraigo,
  circunstancias excepcionales y menores no acompañados, cambiados en 2026),
  TREBEP art. 49 (permisos) y el Reglamento (UE) 2024/1348 (dos actos que lo
  modifican). Si el Tomo se escribió antes de esos cambios, esas preguntas
  pueden estar desfasadas: el tutor debe contrastarlas con el BOE al revisarlas.
  Para meterlas en «Moderación»: `npm run normativa -- --desde=20260101 --hazlo`
  (o pedirlo).
- **Funcionamiento:** «Vigilancia de la normativa», lunes y jueves, escribe sola
  (tope de 400 avisos de una vez; no repite un aviso ya dado). «Operación →
  normativa-ensayo» cuenta sin escribir, y con `desde` (AAAAMMDD) barre hacia
  atrás. El informe queda en el resumen de cada ejecución en Actions.
- **Para que funcione hace falta desplegar:** GitHub solo programa los flujos de
  la rama principal. Hasta entonces se puede lanzar el ensayo desde la rama.
- **Para el correo a los admin:** añadir el secret `RESEND_API_KEY` en GitHub
  (Settings → Secrets and variables → Actions), el mismo valor que en Vercel.
  Sin él, los avisos llegan igual a «Moderación», sin correo.
- **Visto:** la tarjeta y el editor de «Moderación» en el banco de pruebas, a
  tamaño de móvil. El ensayo, contra la base de datos y el BOE reales. **Sin
  probar:** una ejecución que escriba (`--hazlo`) y el correo.
- **Corregida de paso:** la pendiente del Tomo sobre la adscripción de las
  Delegaciones del Gobierno (id `63fb4ad4-…`) daba por buena «Política
  Territorial» y ponía «Hacienda» como falsa; el art. 69.3 de la Ley 40/2015
  dice literalmente «Ministerio de Hacienda y Administraciones Públicas». Se
  reescribió con su anotación en el historial. **Por revisar:** la pendiente del
  informe anual del Delegado (art. 73.1, «a través del Ministro de Política
  Territorial», id `d0aa3fbc-…`) tiene casi seguro el mismo problema; no se tocó
  porque no se pudo leer el art. 73 desde aquí.

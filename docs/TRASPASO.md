# Traspaso — estado a 9 de noviembre de 2026

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
  - **La semana del 9 al 15 de noviembre está publicada** (regla 98); las
    demás, no: de ellas los alumnos ven solo el horario de su grupo.
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
| **Admin de la academia** | Alumnos (lista por urgencia, ficha, alta en bloque, solicitudes) · Grupos (crear, cambiar y borrar; días, horas, plazas, profesores, Multi) · Profesores (el equipo, sus grupos y sus clases de física) · Asistencia · Prep. física (cuadrante semanal con días sin clase y multis; Planificar el entreno de cada alumno, con copiar a varios; plantillas, feedback, marcas) · Pagos (rejilla mensual) · Banco Oficial · Moderación · Ajustes · Logs & Auditoría |
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

---

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
   - **Planes de pago.** Vercel Pro: el plan Hobby no admite uso comercial.
     Supabase Pro: el Free no hace copias de seguridad (un grupo borrado sin
     querer el 6 nov no se pudo recuperar) y limita a 30 correos por hora.
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
- **`getGroups` lee `class_members` y `class_group_staff` de TODAS las
  academias** (sin `organization_id` en la consulta, regla 65) y sin paginar:
  hoy hay una sola academia y pocos alumnos; con ~100 alumnos en varios grupos
  conviene acotarlo y paginarlo.
- **Regla 79, abierto:** pulsar «Generar» dos veces deja dos planes de IA
  activos. Hoy no afecta: la IA de física está apagada para Alphapol.
- **P11h** (elegir academia si una cuenta está en varias): no hace falta con
  una sola academia.

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

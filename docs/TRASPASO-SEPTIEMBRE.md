# Traspaso — 13 y 14 de septiembre de 2026

Punto de partida para la siguiente conversación. Lo que hay que leer antes de
tocar nada sigue siendo [`CLAUDE.md`](../CLAUDE.md); esto es solo el estado de
esta sesión — cerrada en la nube, se retoma en local — y por qué está donde
está. El plan de producto nuevo (P13, P14, P15) vive en
[`PLAN-PRODUCTO.md`](PLAN-PRODUCTO.md), no aquí: esto es la crónica, aquello
es la referencia que hay que consultar antes de escribir código.

---

## De qué iba esta sesión

Empezó como una conversación de negocio — *¿academia propia o vender la
plataforma a otras?* — y acabó tocando código real: landing comercial, una
demo, el dominio propio en producción, y la investigación de tres huecos de
producto contra el BOE de verdad. Nada de esto estaba en ningún plan previo.

---

## 1 · Landing y demo — en producción, pero la demo está mal planteada

**`/academias`** (dossier comercial: comparativa, diferenciadores, tarifas) y
**`/academias/demo`** se construyeron, se probaron (`npm run check`,
`npm run build`, capturas en móvil y escritorio) y se fusionaron a `main`
(PR #16). Están en producción ahora mismo.

**Pero la demo es la pieza equivocada, y el dueño lo dijo con razón al
verla:** `/academias/demo/academia` es una página suelta con datos de
fixtures (`app/academias/demo/fixtures.ts`) que **imita** el aspecto del
panel real — mismo sistema de diseño, colores, `Card`/`StatTile` — pero no es
el panel real. Le faltan las 10 pestañas de verdad, la barra oscura
"Centro de Mando", el interruptor de control de acceso, "Invitar por correo",
"Correos exentos", el filtro por grupo, las filas desplegables... Es un
resumen genérico de "panel de academia", no la pantalla "Alumnos" tal cual
existe.

**Lo que el dueño quiere de verdad, y es mejor idea que la que se construyó:**
no una réplica — una **academia real** en la base de datos, llamada algo
como "Demo", con un admin real (`demoacademia@atenea.com` o el correo que se
decida, con contraseña) y alumnos "demo" con datos inventados pero reales:
filas de verdad en `profiles`, `question_attempts`, `class_groups`,
`monthly_payments`, etc. Quien entre con ese correo ve el `AdminView`
**real**, sin ninguna pieza aparte, porque es el producto de verdad operando
sobre datos de mentira.

Encaja de maravilla con P11 (multi-academia): esa academia queda aislada por
`organization_id`, así que dar acceso de escritura completo ahí es
inofensivo — no hace falta ningún modo "solo lectura", que era la
complicación que se había planteado al principio y que ya no hace falta.

### Qué hace falta para construirlo

1. Un guion de siembra (mismo patrón que `npm run sembrar` / `npm run
   cuenta`, que ya existen) que cree la academia, el admin con su
   contraseña, y 8-10 alumnos con nombres, intentos de preguntas, pagos y
   grupos inventados. **No hace falta SQL nuevo** — todas las tablas que
   usa ya existen desde P11/P8/P7.
2. Escribirlo contra la base de datos **real** — requiere
   `SUPABASE_SERVICE_ROLE_KEY` real, que esta sesión (en la nube) no tenía
   más que una de mentira para poder compilar. La sesión local, con su
   `.env.local` real, sí puede.
3. Decidir qué pasa con `/academias/demo` (las páginas de fixtures): lo
   sensato es borrarlas una vez exista la academia real — mantener las dos
   sería confuso y una mentiría sobre la otra.

**Esto es lo primero que hay que hacer en la sesión local.**

---

## 2 · El dominio propio — `ateneapolicial.com`, en producción

El dominio estaba comprado (Cloudflare) y verificado para correo (Resend),
pero **no tenía ni un registro apuntando a ningún sitio web** — de ahí la
pregunta inicial de por qué no cargaba.

Se resolvió en esta sesión con dos tokens temporales que el dueño dio en el
chat (uno de Cloudflare con permiso de editar DNS de esta zona, uno de
Vercel) — **los dos han caducado con la sesión**, no hace falta revocar
nada ni queda ningún secreto vivo en el repo.

Lo que se hizo, comprobado contra las propias API en vez de adivinado:

- Se añadió `ateneapolicial.com` y `www.ateneapolicial.com` (redirige a la
  raíz) al proyecto `atenea` en Vercel.
- Vercel dio el registro exacto — dos IPs para la raíz
  (`216.198.79.1` y `64.29.17.1`) y un CNAME único del proyecto para `www`
  (`59926b72f44b8bcb.vercel-dns-017.com`) — y se escribió en Cloudflare tal
  cual, sin tocar los registros de correo de Resend (viven en
  `send.ateneapolicial.com`, aparte, y siguen intactos).
- Se añadió `NEXT_PUBLIC_SITE_URL=https://ateneapolicial.com` a las
  variables de entorno de Vercel (antes no existía; el código caía al
  valor por defecto `atenea-eight.vercel.app` en
  `app/lib/registration-requests.ts`) y se redesplegó para que surta
  efecto.

**Verificado con peticiones reales**, no solo con la consola de Vercel:
`https://ateneapolicial.com/academias` responde 200 con el contenido
correcto, `https://www.ateneapolicial.com` redirige bien, certificado válido.

### Lo que queda pendiente del dominio, y no se pudo hacer en esta sesión

1. **Supabase Auth — Site URL / Redirect URLs siguen en
   `atenea-eight.vercel.app`.** Hace falta añadir
   `https://ateneapolicial.com/**` ahí (Authentication → URL Configuration)
   para que los enlaces de los correos de Supabase (confirmar cuenta,
   recuperar contraseña, invitación) manden al dominio nuevo. Es un panel
   al que esta sesión no tuvo acceso.
2. **`RESEND_API_KEY` no está en las variables de entorno de Vercel.**
   Sin ella, `sendMail` (`app/lib/mailer.ts`) se lo salta y lo registra en
   el log — así que ahora mismo **los correos de la app (P12: solicitud de
   alta, aceptado, rechazado) no están saliendo**, aunque el resto de la
   plataforma funciona con normalidad. La clave está en el propio panel de
   Resend, cuenta `ateneapolicial.com`.

---

## 3 · El plan de producto — tres huecos, investigados contra el BOE real

Preguntados directamente: *biodata floja, sin inglés, sin psicotécnicos, y
qué más falta*. Se investigó cada uno contra `BOE-A-2026-15055` (la
convocatoria vigente) en vez de fiarse de lo que dice la competencia — y en
un caso la competencia llevaba a error. Todo por extenso en
[`PLAN-PRODUCTO.md`](PLAN-PRODUCTO.md) §P13-P15; resumen:

| | Qué es | Estado |
|---|---|---|
| **P13** | Psicotécnicos de **aptitud** (series, matrices, razonamiento) — distinto del test de personalidad que ya existe en Biodata | Documentado, **sin bloqueos**: BOE confirma 60 min totales y la misma fórmula de corrección que el examen de conocimientos. Lista para construirse. |
| **P14** | Inglés | **Aparcado por decisión del dueño.** La premisa inicial (examen B1 tipo test) era falsa: desde esta convocatoria es un requisito de **admisión** (A2, no B1) acreditado con certificado externo antes de la instancia — no hay nada que construir con banco de preguntas. Si se retoma algún día, es solo un seguimiento administrativo de quién tiene el certificado, no contenido. |
| **P15** | Biodata con diagnóstico real | Documentado. El test de 30 ítems ya existe y ya alimenta al entrevistador simulado — lo que falta es que el alumno vea una interpretación de su propio perfil, no solo cuatro barras. No hace falta SQL. |

**Orden recomendado si se retoma esto en vez de la demo:** P13 primero (con
Opus 5, hay decisiones de arquitectura de por medio), P15 después (con
Sonnet 5, no hay esquema nuevo y es sobre todo redactar interpretación).

---

## 4 · El dossier comercial

Publicado como Artifact (no vive en el repo): comparativa frente a bancos de
test genéricos y plataformas "socias" del sector, sin nombrar marcas de la
competencia por prudencia, con el modelo de precio propuesto (piloto a
99 €/mes plano, luego por tramos de alumnos activos desde 129 €/mes). Está
en la conversación de esta sesión, no en `docs/`.

---

## Por dónde seguir (sesión local)

1. ~~**La academia demo real**~~ → **hecha, 14 sep 2026.** Ver el apartado
   siguiente.
2. ~~**Supabase Auth: Redirect URLs · `RESEND_API_KEY`**~~ → **hechas, 14
   sep 2026.** Ver «Lo que se cerró después» más abajo — con acceso real a
   Cloudflare y Supabase desde el propio Chrome de la sesión, resultó que sí
   se podía.
3. **P13 (psicotécnicos)**, si hay hueco para una sesión larga — es la pieza
   de producto más grande de las tres y ya no tiene ningún dato pendiente.
   Recomendado con Opus 5: hay decisiones de arquitectura de por medio.

---

## 14 de septiembre · Lo que se cerró después (con acceso real a los paneles)

Con Cloudflare y Supabase logueados en el propio Chrome de la sesión (algo
que la sesión en la nube no tenía), se pudo cerrar todo lo que antes
quedaba «pendiente del dueño»:

- **Bug real encontrado y arreglado**: los dos correos de P12 (aviso de
  solicitud al admin, resolución al alumno) nunca llegaban a intentarse.
  `avisarAdmins(...).catch(...)` se lanzaba sin `await` justo antes de que
  la Server Action devolviera su respuesta — el runtime serverless de
  Vercel corta la función en cuanto sale la respuesta, así que ese envío en
  segundo plano se quedaba a medias. Confirmado con los logs de Vercel
  (Logs → External APIs): la petición hacía las lecturas de Supabase pero
  **cero** llamadas salientes a `api.resend.com`. Arreglado con `after()`
  de `next/server` en `app/lib/registration-requests.ts` y
  `app/actions/membership.ts`. Verificado end-to-end con una cuenta de
  prueba real: el correo de confirmación de Supabase llegó, y tras el
  arreglo el aviso al admin también (visible en Resend → Emails).
- **`RESEND_API_KEY` creada y activa** en Vercel (Production + Preview) —
  clave dedicada, `Sending access`, restringida al dominio
  `ateneapolicial.com`.
- **Email Routing de `ateneapolicial.com`** configurado en Cloudflare:
  `contacto@` y `alumnos@` reenviando al Gmail del dueño. Verificado con un
  correo real recibido desde otra cuenta.
- **Typo corregido**: `profiles.email` de la admin de `atenea` tenía
  `atanea.alumnos@gmail.com` (con «a»); el correo de login real en
  `auth.users` siempre fue `atenea.alumnos@gmail.com`. Ya coinciden — sin
  esto, el aviso de P12 rebotaba (`Recipient not found`) aunque el código
  ya funcionara.
- **Supabase Auth → Redirect URLs**: añadida `https://ateneapolicial.com/**`
  (el Site URL se dejó tal cual, en `atenea-eight.vercel.app` — no se pidió
  cambiarlo).

Todo verificado en producción, no solo en el preview.

---

## 14 de septiembre · La academia "Demo" real, y fuera los fixtures

Lo del §1 de arriba, hecho: `scripts/operacion/sembrar-demo.mjs`
(`npm run sembrar:demo`) crea una academia **real** (`academies`, slug
`demo`) contra el Supabase de producción — nada de fixtures. Reanudable:
cuentas, grupos, ajustes, pagos y membresías van con upsert; la actividad
(`question_attempts`, fichas) se salta si el alumno ya tiene datos, salvo
`--borrar`.

Qué crea, todo con filas de verdad:

- **1 admin** (`admin@academia-demo.es` / `AteneaDemo26`) y **8 alumnos**
  (misma clave), con nombres reconocibles (Laura, Marcos, Nerea, Iván,
  Sara, Pablo, Cristina, Álvaro).
- **2 profesores** (`academy_staff`), **3 tipos de grupo** (`group_kinds`:
  físicas con plan, repaso e inglés sin plan) y **3 grupos**
  (`class_groups` + `class_members`).
- **Control de acceso ENCENDIDO** (`membership_settings.required = true`,
  al revés que el resto de academias) para que el panel de Alumnos se vea
  haciendo algo: Iván **suspendido** (dejó de pagar), Sara **exenta**, y
  **Pablo sin fila en `memberships`** — pendiente de activar.
- **~1.780 `question_attempts`** repartidos en 7 alumnos, con simulacros
  (nota BOE con penalización), preguntas atascadas (P10, distractor fijo) y
  el acierto subiendo semana a semana — del banco GLOBAL real
  (`organization_id is null`, 1.795 preguntas activas), no preguntas
  inventadas.
- **Pagos** de los dos últimos meses (`monthly_payments`) y un **plan de
  físicas de grupo** de 2 semanas (`group_training_plans`).
- **Login REAL** (`signInWithPassword` con la clave anónima) para el admin
  y 7 de los 8 alumnos, para que `last_sign_in_at` no sea inventado —
  Pablo se deja sin loguear a propósito, así «nunca ha entrado» (regla 46)
  también es un dato real y no una etiqueta puesta a mano. **Limitación
  técnica, no descuido:** `last_sign_in_at` no se puede escribir por API
  (lo pone Supabase Auth al autenticar, no PostgREST), así que solo se
  pueden producir dos estados reales del eje «¿viene?» — activo (logueado
  hoy) o nunca ha entrado —, no los intermedios («en riesgo», «abandonado»).
  El eje «¿estudia?» (que sale de `question_attempts.created_at`, una
  columna que sí se controla) tiene toda la variedad.

**Verificado en el preview, con la sesión de admin real** (no solo
`npm run check`, que también pasa: 957 tests, typecheck limpio): la
pestaña **Alumnos** pinta los 8 con sus estados reales calculados en vivo
(Pablo con «Nunca ha entrado · Sin activar · Llamar» a la vez, Laura al
73 % de acierto en 363, Iván «Suspendido»); **Grupos** con los 3 grupos y
sus profesores; **Pagos**, vista histórico, con la rejilla de dos meses,
Sara marcada «Exenta» y **el roster excluyendo a Iván** (suspendido —
regla 53: solo entran los alumnos con acceso `active`).

Las páginas de fixtures (`app/academias/demo/{page,fixtures,DemoBanner}.tsx`
y `academia/`, `alumno/`) **se borraron**: mentían siendo una maqueta que
decía «no es una maqueta». Los dos «Ver la demo» de `app/academias/page.tsx`
apuntan ahora a `/demo` — la academia real, así que entrar de verdad pide
la contraseña de arriba. **A propósito no se han publicado las credenciales
en la página pública**: un admin de cualquier academia puede generar
contenido con Gemini (gasto real), así que antes de enseñarlas a un
prospecto conviene decidir cómo se entregan (de viva voz, en el dossier
comercial…), no dejarlas en una URL indexable.

---

## Pendiente del dueño

- ~~Confirmar el correo y la contraseña del admin de la academia demo~~ →
  resuelto sin esperar (no bloqueaba nada): `admin@academia-demo.es` /
  `AteneaDemo26`. Cambiar la contraseña es un `npm run sembrar:demo` con
  otra clave en el guion, o `npm run cuenta -- admin@academia-demo.es
  'otraClave' admin`.
- ~~Añadir `https://ateneapolicial.com/**` a las Redirect URLs de Supabase
  Auth~~ → hecho, 14 sep 2026.
- ~~Decidir si `RESEND_API_KEY` se activa~~ → activada, 14 sep 2026.
  Pendiente solo cómo se entregan las credenciales de la demo a un
  prospecto (a propósito no están en la página pública — ver arriba).
- P13 y P15 se pueden empezar sin esperar respuesta de nadie.

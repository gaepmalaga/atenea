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

1. **La academia demo real** — es lo que el dueño pidió último y con más
   claridad. Ver §1. Necesita `SUPABASE_SERVICE_ROLE_KEY` real, que la
   sesión local ya tiene en su `.env.local`.
2. **Supabase Auth: añadir `https://ateneapolicial.com/\*\*` a las Redirect
   URLs**, y confirmar si `RESEND_API_KEY` se añade ahora o se deja para
   más adelante — son dos cosas que solo se resuelven con acceso a paneles
   que esta sesión no tenía.
3. **P13 (psicotécnicos)**, si hay hueco para una sesión larga — es la pieza
   de producto más grande de las tres y ya no tiene ningún dato pendiente.

---

## Pendiente del dueño

- Confirmar el correo y la contraseña que quiere para el admin de la
  academia demo (`demoacademia@atenea.com` fue el ejemplo, no
  necesariamente el definitivo).
- Decidir si `RESEND_API_KEY` se activa ya o se deja apagado un poco más.
- Nada más está bloqueado — P13 y P15 se pueden empezar sin esperar
  respuesta de nadie.

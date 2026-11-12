# Dominio propio y correo de Alphapol — qué hace falta, paso a paso

Para poner el campus en **campus.alphapol.es** y que los correos salgan de
**@alphapol.es**. Está escrito para quien tenga el acceso al DNS (Hostinger) y
las cuentas (Vercel, Resend, Supabase). **No hay que programar nada.**

*Estado de hoy:* el campus vive en `atenea-eight.vercel.app`; todo el correo (el
de la aplicación y el de Supabase: confirmar cuenta, invitar admin, recuperar
contraseña) sale ya por Resend, pero desde `ateneapolicial.com`, un dominio que no
es de Alphapol. Las plantillas de Supabase ya están en castellano y con la marca.

## Quién hace qué

| Quién | Qué |
|---|---|
| **Dueño (o quien tenga el DNS en Hostinger)** | Crear 2 grupos de registros DNS: uno para la web y otro para el correo |
| **Quien administre Vercel y Resend** | Añadir el dominio, crear la clave de correo, cambiar 2 variables |
| **Claude** | Cambiar las URLs de Supabase cuando el dominio ya cargue, y probar los correos |

---

## PARTE A · Que el campus cargue en campus.alphapol.es

1. **Vercel** → proyecto `atenea` → *Settings* → *Domains* → *Add* →
   escribir `campus.alphapol.es`. Vercel enseña un registro a crear (un **CNAME**).
   Copiar tal cual lo que enseñe.
2. **Hostinger** → *Dominios* → `alphapol.es` → *DNS / Zona DNS* → añadir registro:
   - Tipo: **CNAME**
   - Nombre: **`campus`** (solo eso: Hostinger añade `.alphapol.es`)
   - Destino: el valor que enseñó Vercel
   - TTL: el que venga por defecto
   - **No tocar ningún otro registro** (los de la web y el correo de Alphapol).
   - Si Hostinger no deja editar la zona, mirar en *Servidores DNS* quién gestiona
     el dominio: el registro hay que crearlo ahí.
3. Esperar de unos minutos a unas horas. En Vercel el dominio pasa a **Valid**
   y se pone el candado HTTPS solo.
4. Avisar a Claude cuando `https://campus.alphapol.es` cargue. Entonces:
   - **Supabase → Authentication → URL Configuration:** se añade
     `https://campus.alphapol.es/**` a las *Redirect URLs* (sin borrar las
     actuales) y después se cambia la *Site URL*. **Si se olvida este paso, los
     enlaces de los correos (confirmar, recuperar contraseña) fallan.**
   - **Vercel → Settings → Environment Variables:** `NEXT_PUBLIC_SITE_URL` =
     `https://campus.alphapol.es` (Production) y *Redeploy* (la variable se
     incorpora al construir, así que hace falta desplegar de nuevo).

**Después:** quien ya tenía sesión iniciada en la dirección antigua tendrá que
volver a entrar en la nueva. La antigua sigue funcionando. Conviene avisar a los
alumnos de la dirección nueva.

---

## PARTE B · Que el correo salga de @alphapol.es (Resend)

**Decisión previa:** conviene que la cuenta de Resend sea **de Alphapol** (igual
que Vercel y Supabase). La cuenta actual tiene ya `ateneapolicial.com` y el plan
gratuito solo admite un dominio.

1. **Resend** → *Domains* → *Add Domain* → `alphapol.es`. Si ofrece región,
   elegir **Europa (Irlanda)** por la protección de datos.
2. Resend muestra una tabla de **registros DNS** (normalmente 3: una clave DKIM
   `resend._domainkey`, y dos en el subdominio `send` —un MX y un SPF—). Copiarlos
   en la zona DNS de Hostinger, igual que en la parte A:
   - **Nombre:** solo la parte de la izquierda (`send`, `resend._domainkey`).
   - **Valor:** pegarlo entero, sin comillas de más ni espacios.
   - Van en el subdominio `send`, así que **no chocan con el correo normal de
     Alphapol** (el de Hostinger, en la raíz). No borrar ni cambiar el MX o el
     SPF que ya existan en la raíz.
   - Si Resend propone un registro `_dmarc` y la zona ya tiene uno, no duplicarlo.
3. En Resend, pulsar **Verify DNS Records**. Tarda entre minutos y unas horas hasta
   que el dominio salga como **Verified**.
4. **Crear la dirección remitente real:** en Hostinger, un buzón o alias
   `campus@alphapol.es` que alguien lea. Cuando un alumno conteste a un correo
   del campus, tiene que llegar a una persona.
5. **Resend → API Keys → Create API Key:** permiso *Sending access*, limitada al
   dominio `alphapol.es`. **Se enseña una sola vez: copiarla ya.** No se manda por
   chat ni por correo: se pega directamente en los dos sitios siguientes.
6. **Vercel → Environment Variables** (Production):
   - `RESEND_API_KEY` = la clave nueva
   - `MAIL_FROM` = `Alphapol <campus@alphapol.es>`
   - *Redeploy*.
7. **Supabase → Authentication → Emails → SMTP Settings:**
   - Sender email: `campus@alphapol.es` · Sender name: `Alphapol`
   - Host `smtp.resend.com` · Puerto `587` · Usuario `resend`
   - Contraseña: **la misma clave nueva de Resend**
8. **Comprobar:** mandar una recuperación de contraseña a un correo propio. En
   Gmail → *Mostrar original* deben salir **SPF: PASS, DKIM: PASS** y el remitente
   `campus@alphapol.es`. Si sale en *spam* o como `ateneapolicial.com`, falta algo
   de los pasos 3 o 7.

## Límites que conviene conocer
- **Resend gratuito:** unos 100 correos al día y 3.000 al mes. Para 100 alumnos
  y los avisos de la plataforma basta; una invitación masiva por correo a todos
  el mismo día **no cabría**. Por eso el alta en bloque se hace sin correos
  (regla 83). Si se quiere enviar más, el plan de pago cuesta unos 20 $/mes
  (comprobar el precio vigente).
- **Supabase:** hoy limita a 30 correos por hora, en *Authentication → Rate
  Limits*. Subirlo si se prevén muchos registros a la vez.

## Orden recomendado
A1 → A2 → A3 (campus carga) → A4 (URLs y variable) y, en paralelo, B1 → B3 (dominio
de correo verificado) → B5 → B6 → B7 → B8.

## Lo que NO cambia
Los datos, las cuentas de los alumnos ni la dirección antigua. No hay que migrar
nada y el cambio se puede deshacer volviendo a la `Site URL` anterior.

# Instagram — estrategia y contenido del primer mes

Doce carruseles listos para subir (`png/`), sus textos y pies de foto
(`POSTS.md`), tres guiones de reel y las stories de cada semana
(`REELS-Y-STORIES.md`). Todo sale de `generador/contenido.mjs`: se cambia ahí y
se regenera (ver «Cómo regenerar» abajo).

---

## 1 · En qué nos diferenciamos

Casi todas las plataformas de test para Policía Nacional venden lo mismo:
**cuántas preguntas tienen**. Un banco enorme, preguntas al azar y un porcentaje
de acierto. Competir en «tenemos más preguntas» es perder: siempre habrá alguien
con más.

Nuestra frase:

> **Estudiar más horas no es el problema. Estudiar lo que no toca, sí.**

Lo que decimos que nadie más dice, y que el producto hace de verdad:

| Lo que decimos | En qué se apoya (no es marketing: está en el código) |
|---|---|
| Lo que cae de verdad | `app/lib/exam-weight-data.ts`: 497 preguntas de los 5 exámenes oficiales 2021-2025 contadas por tema |
| Sabe qué se te va a olvidar antes que tú | `question-scheduler.ts`: un reloj por pregunta y alumno, curva de olvido personal, y la frase de por qué te toca cada pregunta |
| Hoy te toca esto, y te decimos por qué | `smart-session.ts` + `razonRepaso`: cajones por pregunta, recaídas primero, ~85 % de acierto |
| Acertar dudando no es saberlo | `answer-signals.ts`: firmeza deducida de tiempo, cambios y primer toque |
| Si fallas siempre igual, te sabes algo mal | `distractorFijo` y «Se te resisten» |
| Simulacros comparables | `exam-blueprint.ts`: tamaños fijos, reparto por tema y artículo, dificultad fija |
| A quién llamar hoy (academias) | Panel «Alumnos»: urgencia, «viene» ≠ «estudia», sin datos ≠ 0 |
| Preguntas que falla toda la clase (academias) | Mismo panel + `question-confusion.ts` |
| Gestión sin pasarela (academias) | Grupos, rejilla de pagos, exentos, solicitudes de alta, físicas por grupo |

## 2 · Dos públicos, una cuenta

Una sola cuenta, porque la academia compra lo que el opositor valora: si un
opositor comparte el post de la nota, el director de su academia lo ve.

|  | Opositor individual | Academia |
|---|---|---|
| Qué le duele | Estudia mucho y no sabe si va bien | Pierde alumnos sin verlo venir; lleva todo en Excel y WhatsApp |
| Qué le prometemos | Qué estudiar hoy, y que no se le olvide lo que ya sabe | A quién llamar, qué explicar y la gestión en un sitio |
| Formato | Carrusel educativo que se guarda y se comparte | Carrusel con un dolor concreto y el panel como respuesta |
| Llamada a la acción | **Hazte fundador**: sin coste, en ateneapolicial.com o a alumnos@ateneapolicial.com | Demo: DM o contacto@ateneapolicial.com |
| Color del post | **Hueso** (fondo claro, rojo) | **Noche** (fondo oscuro, amarillo) |

El color no es decoración: en la cuadrícula del perfil un director de academia
ve de un vistazo qué posts son para él. Reparto: **8 para opositores, 4 para
academias** (el manifiesto habla a los dos). Proporción 2:1 porque el opositor
es quien comparte, y quien comparte es quien trae a la academia.

## 3 · Voz

- **Precisa, no motivacional.** Nada de «¡tú puedes!», «aprueba seguro» ni
  cuentas atrás con fuegos artificiales. El opositor está saturado de eso; lo
  que no tiene son datos.
- **Cada post enseña algo aunque no te registres.** El peso real de cada tema o
  por qué se olvida lo estudiado hace tres semanas sirven igual sin la app. Eso es lo que hace que se guarde y
  se comparta, y lo que da autoridad para vender después.
- **Frases cortas. Tuteo.** Se habla al opositor de tú, y a la academia también.
- **La fórmula del BOE no es el mensaje.** Ya la dice la página de entrada y
  la conoce cualquier opositor. Lo que nadie más tiene es el motor: sabe qué
  se te va a olvidar y decide por ti.
- **El producto aparece al final**, como la consecuencia de lo que se ha
  explicado, no al principio.

## 4 · Reglas de honestidad (no negociables)

> **Antes de publicar un post, se comprueba contra el código de `main` y la base
> de datos**, no contra `CLAUDE.md`: la app cambia rápido. El 27 sep se
> encontraron así dos pantallas anunciadas que ya se habían retirado
> («¿Aprobaría?» y «Lo que te toca», 16 sep) y una explicación que solo tenía
> la mitad del banco.

En una plataforma de oposiciones la confianza es el producto. Un dato inflado en
Instagram se descubre en el primer simulacro.

1. **Todo número sale del producto o de un documento oficial.** Nada de «miles
   de aprobados», porcentajes de éxito ni testimonios que no existan.
2. **Lo inventado lleva la etiqueta «Ejemplo»** en la propia imagen (la curva de
   «Mi Evolución», el panel de alumnos, el aviso semanal) y se aclara en el pie.
3. **No se anuncia lo que está fuera del MVP**: ni el chat ni el simulador de
   entrevista (reglas 58 y 64 de `CLAUDE.md`). El plan físico con IA tampoco se
   vende a opositores: hoy solo existe en la academia «casa».
4. **«Más de 4.600 preguntas»** es el banco global activo al 16 sep 2026. Si se
   reutiliza más adelante, se comprueba antes contra la base de datos.
5. **Si una cifra cambia, se regenera el post**, no se deja la antigua.

## 5 · Calendario del primer mes

Lunes, miércoles y viernes, a las **20:30** (el opositor estudia de día y mira
el móvil al terminar; el director de academia, al cerrar). Los tres primeros van
**fijados** en el perfil: presentación, el mejor gancho para opositores y el
mejor para academias.

| Semana | Lunes | Miércoles | Viernes |
|---|---|---|---|
| 1 | 📌 01 · Buscamos opositores fundadores (ambos) | 📌 02 · Sabe qué se te va a olvidar | 📌 03 · ¿Quién lo va a dejar? (academia) |
| 2 | 04 · No todos los temas valen igual | 05 · Hoy te toca esto | 06 · Excel, WhatsApp y una libreta (academia) |
| 3 | 07 · Acertar dudando | 08 · Simulacros comparables | 09 · Lo que falla toda la clase (academia) |
| 4 | 10 · La misma opción falsa | 11 · Mi Evolución | 12 · Más de 4.600 preguntas (academia) |

Los martes y jueves, un **reel** (guiones en `REELS-Y-STORIES.md`); todos los
días, stories con encuesta sobre el post de la víspera.

## 6 · Perfil

La cuenta (`@ateneapolicial`), la bio («Oposita a Policía Nacional como nunca
antes.») y el enlace a `ateneapolicial.com` ya están. Las imágenes llevan el
usuario y el dominio en la última diapositiva.

Destacados sugeridos: **Cómo funciona** · **Mi Evolución** · **Academias** ·
**Pregunta del día**.

## 7 · Qué medir

No los «me gusta». Cada semana:

- **Guardados y compartidos** por post: son la señal de que el contenido sirve.
  Los carruseles 02 y 04 deberían liderar.
- **Clics en el enlace de la bio** y **solicitudes de alta** en la app (llegan
  por correo, regla 70).
- **DMs de academias**. Uno de calidad vale más que mil seguidores.

Si tras el mes un tipo de post dobla en guardados al resto, el segundo mes se
hace más de ese.

## 8 · Opositores fundadores

Hoy no hay precio para opositores: se buscan **fundadores** que la usen, digan
qué falla y la abanderen. Eso es la llamada a la acción de todos los posts para
opositores, y el post que abre la cuenta.

- **Qué se promete:** entrar sin pagar y que lo que digan se tenga en cuenta.
  **Nada más.** Ni «gratis para siempre», ni plazas limitadas, ni ventajas
  futuras que no estén decididas.
- **Cómo entra un fundador:** se registra en `ateneapolicial.com` y se le
  acepta desde el panel (le llega el correo de solicitud, regla 70). O escribe
  a `alumnos@ateneapolicial.com` o por DM.
- **Correos:** `alumnos@` para opositores, `contacto@` para academias. Los DMs
  y los correos los contesta el dueño.

Pendiente de revisar: **el peso por tema (post 04)** sale de la clasificación
por tema de los cuadernillos resueltos. Si la convocatoria 2026 renumera algún
tema, revisar los cinco títulos.

## Cómo regenerar

```bash
cd marketing/instagram/generador
npm install          # la primera vez: playwright-core y las fuentes, aparte de la app
node render.mjs      # regenera png/ y POSTS.md
node render.mjs 04   # solo un post
```

Usa el Chromium del sistema (`CHROMIUM_PATH` si no está en `/opt/pw-browsers`).
El guion avisa si el texto de alguna diapositiva no cabe.

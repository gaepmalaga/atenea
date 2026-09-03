# Generar el temario completo (45 temas)

Plan para tener el temario oficial de la Escala Básica del CNP dentro de la
plataforma: descargado de su fuente, versionado en git y subible al panel.

Estado: **plan aprobado, sin ejecutar**. Bloqueado por una cosa que solo puedes
hacer tú (ver «Lo que necesito de ti»).

---

## De qué se compone el temario

45 temas en tres bloques, según el Anexo I de la convocatoria vigente
(Resolución de 7 de julio de 2026, **BOE-A-2026-15055**). El programa no cambió
respecto a 2025.

| Bloque | Qué es | Se puede descargar |
|---|---|---|
| I · Ciencias Jurídicas | 26 temas, casi todos texto legal | **Sí**, del BOE |
| II · Ciencias Sociales | doctrina, con algunas normas detrás | En parte |
| III · Materias Técnico-Científicas | doctrina y técnica | En parte |

**El reparto exacto de temas entre el bloque II y el III no se copia de ninguna
web.** Las academias no coinciden entre ellas (unas dicen 9+10, otras 11+8) y
un título mal copiado es un alumno estudiando el tema equivocado. Sale del
Anexo I del BOE, y lo extrae el guion.

---

## El camino, en cinco piezas

### 1 · El manifiesto — `temario/temario.json`

La única fuente de verdad, **generada** desde el Anexo I, no escrita a mano.
Por tema: número, bloque, título literal, tipo (`norma` · `mixto` · `apuntes`) y
sus fuentes. Cada fuente lleva el id del BOE y su **ámbito**: la norma entera,
o unos artículos, o unos títulos.

El ámbito es la pieza que hace que esto funcione (ver punto 3).

### 2 · La descarga — `scripts/temario/descargar-boe.mjs`

API de datos abiertos del BOE, legislación consolidada:

```
https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{ID}/texto
```

Devuelve el texto **ya partido en bloques, con el artículo identificado**. Eso
importa más de lo que parece aquí: hoy la referencia de cada fragmento se deduce
con expresiones regulares sobre el texto (`numeroDeArticulo`, regla 30), y esa
deducción ya costó una tanda entera de referencias falsas — el artículo 37
citado como el 30 (P1f). Si la referencia viene dada por la fuente, ese fallo
desaparece de raíz.

Se descarga **por norma, no por tema** (la Constitución alimenta varios temas) y
se cachea en `temario/fuentes/BOE-A-1978-31229.json` con la fecha de
consolidación. Idempotente: si la norma no ha cambiado, no se vuelve a bajar.

### 3 · La composición — `scripts/temario/componer-tema.mjs`

Produce `temario/md/tema-01.md`: **un documento por tema, con solo los artículos
de su ámbito**. No la ley entera repetida en tres temas. Tres razones, y las
tres tienen precedente en este repo:

- **Las preguntas saldrían del tema equivocado.** `generateTestQuestion` toma una
  ventana al azar del documento (regla 28). Si el documento del tema 1 contiene
  la Constitución entera, generará preguntas del artículo 149 etiquetadas como
  tema 1. Es exactamente lo que pasó con las 15 preguntas de Inteligencia que
  vivían dentro de Constitución (P5).
- **El coste.** El chat manda el documento **entero** al modelo (regla 33), con
  un tope de 150.000 caracteres. La Constitución completa son 124.764: cabe,
  pero se pagan ~35.000 tokens por pregunta aunque el alumno pregunte por el
  Título Preliminar. Por temas son entre 3.000 y 15.000.
- **El diff.** Cuando se reforme un artículo, `git diff` enseña qué temas
  cambian y, por tanto, qué preguntas del banco hay que revisar.

Cada documento lleva cabecera: norma, id del BOE, **fecha de consolidación**,
ámbito y enlace. Es la cita que exige la reutilización de los textos del BOE, y
además le dice al alumno qué redacción está estudiando.

### 4 · El PDF — `scripts/temario/generar-pdf.mjs`

`temario/pdf/tema-01.pdf`, que es lo que se sube hoy por el panel.

**Advertencia sobre el viaje de ida y vuelta:** la plataforma ingiere
PDF → `pdf2json` → `cleanLegalText` → `chunkDocument`. Generar un PDF desde
texto limpio para volver a extraer el texto degrada justo lo que se acaba de
ganar en el punto 2. Por eso:

- el **`.md` es la fuente de verdad** y va en git (diffable);
- el **PDF se genera y también va en git** (es lo pedido, y es lo que acepta el
  panel);
- y en cuanto esté rodado, conviene una entrada que acepte `.md`/`.txt`
  directamente. `indexarFragmentos` ya está separada de `uploadTopicPDF`
  (`app/actions/admin.ts`), así que es poco trabajo y se salta el round-trip
  entero.

Tamaño: PDFs de solo texto, decenas de KB. `.git` pesa hoy 1,2 MB; los 45 temas
no lo llevarán más allá de unas pocas decenas. No hace falta Git LFS.

### 5 · Subir y comprobar

Por tema, y sin darlo por bueno hasta verlo:

- `withReference` en la respuesta de la subida: cuántos fragmentos saben de qué
  artículo salen. En un texto legal deben ser casi todos; en apuntes, cero.
- `npm run chat:probar -- --tema=N "¿qué dice el artículo X?"`.

Verde no es lo mismo que visto (CLAUDE.md).

---

## Bloques II y III: lo que no está en el BOE

Política acordada: **fuente oficial donde exista, redacción revisada donde no.**

Más temas de los que parece tienen norma detrás y van por el camino de arriba
cambiando de repositorio: protección de datos (RGPD en EUR-Lex + LOPDGDD),
Unión Europea (los tratados), igualdad y violencia de género (LO 3/2007,
LO 1/2004), derechos humanos (Declaración Universal, CEDH).

Los doctrinales de verdad —globalización, desarrollo sostenible, informática
básica, deep web— se redactan desde fuentes citadas, se marcan como apuntes y
quedan **pendientes de tu revisión** antes de servirse. La plataforma ya los
distingue sola: un documento de apuntes produce fragmentos sin referencia.

**Lo que no se hace: copiar el temario de una academia.** Es contenido protegido
y esta plataforma cobra. Lo que no está protegido son las leyes: el artículo 13
de la Ley de Propiedad Intelectual deja fuera las disposiciones legales y
reglamentarias, y por eso el bloque I es descargable sin más trámite que citar
la fuente.

---

## Orden de trabajo

1. Bloque I completo (26 temas). Es automatizable al 100 % y ya cubre más de la
   mitad del examen.
2. Bloques II y III con fuente oficial.
3. Bloques II y III redactados, uno a uno y con revisión.

---

## Lo que necesito de ti

**Abrir el acceso de red a `www.boe.es` y `boe.es`** en la configuración del
entorno remoto (Claude Code en web → configuración del entorno → acceso a red).
Ahora mismo el proxy los rechaza con un 403 y no se puede descargar nada desde
aquí. Para el bloque II hará falta además `eur-lex.europa.eu`.

Mientras tanto **no se escribe el parser de la API**. Deducir el esquema de una
respuesta que no se ha visto y descubrir después que no era así es exactamente
cómo se escribieron los tres primeros ficheros de `docs/sql/`, nombrando
columnas que no existían.

# Reset y siembra

Tres guiones para dejar la plataforma en un estado limpio y conocido: sin
contenido viejo, con el temario entero indexado y con el banco de preguntas
lleno.

**Los ejecutas tú.** Necesitan `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY`
en tu `.env.local`, que no salen del repositorio.

```bash
npm run sembrar -- --comprobar-pdfs   # 1. mirar, sin tocar nada ni gastar nada
npm run reset                         # 2. ensayo: qué se borraría
npm run reset -- --hazlo              # 3. borrar de verdad (pide escribir RESET)
npm run cuenta -- alumno@ejemplo.com 'unaContraseña' student
npm run sembrar                       # 4. indexar los 51 PDF y sembrar el banco
```

---

## 1 · `npm run sembrar -- --comprobar-pdfs`

Lee los 51 PDF de `temario/pdf/` y los trocea con `chunkDocument`, **la misma
función que usa la aplicación** cuando subes uno por el panel. No habla con
Supabase ni con Gemini, así que no cuesta nada y se puede lanzar tantas veces
como haga falta.

Es lo primero porque contesta la pregunta que importa antes de gastar: ¿va a
entrar algún documento vacío? Ese fallo dejó el **tema 9 con 108.233 caracteres
y CERO fragmentos** durante meses, apareciendo en el panel como cualquier otro
mientras el chat no encontraba nada de ese tema.

Medido el 4 sep sobre los 51:

| | |
|---|---|
| Fragmentos | **4.970** |
| Con referencia de artículo | 4.540 |
| Documentos sin ni un artículo | 18 (los de apuntes: es lo esperado) |
| Documentos que entrarían vacíos | **0** |

---

## 2 · `npm run reset`

Vacía **contenido y actividad**. Sin argumentos es un ensayo: enseña tabla por
tabla lo que hay y no borra nada. Con `--hazlo` pide escribir `RESET` y luego
borra, y al terminar **relee las tablas** para decir si algo ha quedado — no se
fía de sus propios contadores.

### Lo que NO toca, y por qué

| | |
|---|---|
| `auth.users` y `profiles` | Borrar cuentas es el único paso irreversible que puede dejarte **fuera de tu propia plataforma**: si el guion muere entre el DELETE y la creación del admin, la única salida es el panel de Supabase. Y no hace falta: lo que ensucia las estadísticas es `question_attempts`, no la fila de la cuenta. |
| `subjects` y `blocks` | Son la estructura oficial del programa del BOE y sus ids son la clave ajena de todo lo demás. Recrearlos **renumera los temas** y deja huérfano lo que sobreviva. |
| `module_settings` | Sin fila = módulo activo (regla 31). Borrarla no apaga nada, así que no hay motivo. |

### La trampa que tiene dentro

`DELETE` en PostgREST exige un filtro —sin él devuelve error en vez de vaciar la
tabla, que es una protección sensata—. La columna que se usa **no siempre es
`id`**: seis de estas tablas no la tienen (`question_votes` va por
`question_id`, los tres perfiles por `user_id`, `ai_quota` por `user_id`,
`exam_questions` por `exam_id`). Está comprobado contra `supabase/schema.json`,
porque escribir una columna que no existe es el fallo más caro de este repo.

---

## 3 · `npm run cuenta`

Crea una cuenta **con el correo ya confirmado**. Hace falta porque el proyecto
tiene `Confirm email` activado: quien se registra por la vía normal no puede
entrar hasta pulsar el enlace, y en el plan Free el envío es limitado.

```bash
npm run cuenta -- alumno.prueba@ejemplo.com 'loQueQuieras' student
npm run cuenta -- gaepmalaga@gmail.com      'loQueQuieras' admin
```

Va **en su propio guion, no dentro del reset**, a propósito: crear cuentas no
puede ir pegado a un borrado. Si el reset falla a mitad y aborta, no quiero que
se lleve por delante el paso que te devuelve el acceso.

Si la cuenta ya existe, le pone esa contraseña y confirma el correo en vez de
fallar: volver a lanzarlo deja el mismo estado, no un error. Y escribe el rol
en `profiles`, que es donde vive — `auth.users` no lo sabe.

---

## 4 · `npm run sembrar`

Dos fases, y se pueden separar:

```bash
npm run sembrar -- --ensayo           # qué haría, sin escribir
npm run sembrar -- --solo-indexar     # solo los documentos
npm run sembrar -- --solo-preguntas   # solo las preguntas
npm run sembrar -- --preguntas=20     # cuántas por tema (por defecto 20)
npm run sembrar -- --tema=4           # un tema suelto
```

**Fase A · indexar.** Por cada PDF: extraer el texto con `pdf2json`, limpiarlo
con `cleanLegalText`, trocearlo con `chunkDocument`, calcular los embeddings por
lotes de cinco e insertarlos en orden. Si un documento no produce ni un
fragmento, **su fila se borra**: un documento huérfano se ve en el panel igual
que uno sano y el chat no encuentra nada de ese tema.

**Fase B · generar.** Por cada tema, N preguntas. El contexto de cada una sale
de un **fragmento** (un artículo, con su referencia) y solo si el tema no tiene
artículos se cae a una ventana del documento entero — que es el caso de los 18
de apuntes. Cada pregunta se valida con `validateGeneratedQuestion` **antes** de
guardarse: un `correctIndex` fuera de rango se colapsaba en «c» en silencio y el
alumno estudiaba un dato falso.

### Es reanudable, y eso no es un extra

Con 4.970 embeddings y 900 llamadas de generación, **se va a cortar**. Un
documento ya indexado se salta; un tema que ya tiene sus N preguntas se salta; y
las preguntas van con `ignoreDuplicates`, así que relanzarlo no reescribe nada
ya aprobado ni resucita lo descartado (regla 3). Se vuelve a lanzar y sigue.

### Lo que cuesta

En dinero, poco: del orden de un par de euros entre embeddings y generación. En
**tiempo** no: entre los límites de tasa y las pausas, cuenta con una hora
larga. Déjalo corriendo.

### No duplica la lógica de la aplicación

El troceado, la limpieza, la huella (`questionHash`), la validación, el prompt y
el esquema del modelo se importan de `app/lib/`. Para que eso fuera posible hubo
que **sacar el prompt de generación de dentro de la Server Action**: un fichero
`'use server'` no se puede importar desde un guion ni desde un test, así que el
prompt que de verdad escribe las preguntas del banco solo corría en producción,
donde nadie lo lee. Es la regla 32 aplicada al generador. Ahora vive en
`app/lib/question-prompt.ts` junto al esquema JSON del modelo —los dos tienen
que cambiar a la vez— y lo vigila una guarda en `tests/question-lifecycle.test.ts`.

---

## Después

Lo único que estos guiones no pueden hacer por ti: **entrar como alumno y hacer
un test entero**. Es lo que comprueba que lo que se guarda es lo que se lee.

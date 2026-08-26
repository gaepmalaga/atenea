# Atenea Policial

Plataforma de preparación de oposiciones a **Policía Nacional (CNP)**: banco de
preguntas generado y moderado, exámenes cronometrados con analítica de
comportamiento, chat sobre el temario con recuperación, flashcards con repetición
espaciada, entrevista personal por voz y un entrenador físico con plan semanal.

Next.js 16 (App Router) · React 19 · Supabase · Google Gemini · Tailwind 4.

> **Si vas a tocar el código, empieza por [`CLAUDE.md`](CLAUDE.md).** Ahí está en
> qué fase va el proyecto, las 18 reglas que salieron de fallos reales que
> llegaron a producción, y qué tests vigilan cada una. El detalle vive en
> [`docs/AUDITORIA.md`](docs/AUDITORIA.md) (34 hallazgos con fichero y línea) y
> [`docs/PLAN-DE-TRABAJO.md`](docs/PLAN-DE-TRABAJO.md) (6 fases).

---

## Arrancar

```bash
npm ci
cp .env.example .env.local     # las 4 variables son obligatorias
npm run dev                    # http://localhost:3000
```

**La aplicación no arranca sin las cuatro variables.** `app/actions/core.ts`
construye los clientes de Supabase y Gemini en tiempo de importación, así que
falta una y falla el arranque *y* el build. Están descritas en
[`.env.example`](.env.example).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run check` | `typecheck` + tests. **Pásalo antes de cada commit** |
| `npm run test` | Solo los tests (Vitest) |
| `npm run build` | Build de producción. Necesita las variables definidas |
| `npm run lint` | ESLint. Quedan errores heredados: todavía no es puerta de calidad |

`npm run check` no necesita credenciales: todo lo que prueba es lógica pura o
lectura estática del código fuente. Corre solo en cada push
([`.github/workflows/check.yml`](.github/workflows/check.yml)).

---

## Cómo está organizado

```
app/
  actions/     Server Actions, una por dominio. `core.ts` (clientes) NO se
               reexporta al cliente: rompería la serialización.
  lib/         Lógica pura y testeable: texto, SRS, estadísticas, salida de la
               IA, perfil físico, plan de entrenamiento, cronómetro… + auth.ts
  components/
    Admin/     Usuarios, temario, banco de preguntas, moderación, logs
    student/   Dashboard del alumno: 7 módulos en `modules/`
docs/          Auditoría, plan de trabajo y los guiones SQL pendientes
tests/         Vitest — 260 tests, sin Supabase
```

**La lógica que se pueda probar vive en `app/lib/`, no dentro de las acciones.**
`core.ts` construye clientes al importarse, así que nada de lo que esté ahí se
puede testear.

---

## Dos clases de test

1. **Tests de lógica.** Aritmética de estadísticas, troceado de PDFs, repetición
   espaciada, normalización de lo que devuelve el modelo, progresión del plan
   físico.
2. **Guardas estáticas.** Leen el código fuente y fallan si vuelve un patrón que
   ya causó un fallo: una Server Action que acepta un `userId` por parámetro, un
   `upsert` que expande el objeto del cliente sobre la fila, una conversión con
   `Number()` sobre un campo que puede venir vacío, un `.replace()` sobre una
   columna sin proteger.

Cuando toques algo cubierto por una guarda, **compruébalo rompiéndolo a
propósito** y mirando que el test lo señale. Un guardián que no muerde no sirve.

Al escribir una guarda nueva, quita los comentarios del código antes de
analizarlo (`stripComments`): un comentario que *cita* el patrón para explicarlo
cuenta como si fuera código.

---

## Lo que falta y necesita la consola de Supabase

1. **Activar RLS** — [`docs/sql/1.3-activar-rls.sql`](docs/sql/1.3-activar-rls.sql).
   Hoy cualquiera con la clave pública puede volcar `question_bank` **con las
   respuestas correctas** y leer los datos personales de los alumnos. Es seguro
   ejecutarlo ya: todas las consultas van con la clave de servicio, que salta RLS.
2. **Reparar duplicados históricos** —
   [`docs/sql/2.4-duplicados-test-results.sql`](docs/sql/2.4-duplicados-test-results.sql).
   Hunden el porcentaje de acierto de los alumnos.
3. **Cuota de IA duradera** (opcional, cuando quieras) —
   [`docs/sql/1.4-cuota-ia.sql`](docs/sql/1.4-cuota-ia.sql). La cuota ya funciona, pero el
   contador vive en memoria del proceso: con varias instancias el límite real se multiplica
   por el número de instancias vivas. Va **después** de la 1.3.
4. **`supabase db pull`.** El esquema de la base de datos **no está en el
   repositorio**: vive solo dentro del proyecto de Supabase. Es la tarea
   pendiente con más riesgo de pérdida y coste cero.

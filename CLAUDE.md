# Atenea Policial — guía para trabajar en este repo

Plataforma de preparación de oposiciones a Policía Nacional (CNP).
Next.js 16 (App Router) · React 19 · Supabase · Google Gemini · Tailwind 4.

> **Empieza leyendo esto.** El proyecto estuvo abandonado un tiempo y se está
> recuperando por fases. Aquí está dónde estamos y qué reglas se aplican.
> El detalle vive en [`docs/AUDITORIA.md`](docs/AUDITORIA.md) (30 hallazgos con
> fichero y línea) y [`docs/PLAN-DE-TRABAJO.md`](docs/PLAN-DE-TRABAJO.md) (6 fases).

---

## Estado actual

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Recuperar el terreno: build, typecheck, tests | ✅ cerrada |
| 1.1 | Sesión verificada en el servidor | ✅ cerrada |
| 1.4 | Asignación masiva en perfiles | ✅ cerrada |
| **2.1** | **Ciclo de vida de las preguntas** | ✅ **cerrada** |
| 1.2 / 1.3 | Acotar la clave de servicio · activar RLS | ⬜ siguiente |
| 1.5 / 1.6 | Cuota por usuario en IA · qué se manda a Gemini | ⬜ parcial |
| 2.2 – 5 | Resto de fallos funcionales, IA, pedagogía, higiene | ⬜ |

**Sin verificar contra el Supabase real:** las fases 1.1 y 2.1 están cerradas en
código y cubiertas por tests estáticos, pero nadie las ha probado todavía con
credenciales de verdad. Si algo falla, lo más probable es el login (la sesión
pasó de `localStorage` a cookies) y el estado de las preguntas sembradas.

---

## Comandos

```bash
npm ci
cp .env.example .env.local     # las 4 variables son obligatorias: la app no arranca sin ellas
npm run dev

npm run check                  # typecheck + tests — pásalo ANTES de cada commit
npm run build                  # necesita las variables de entorno definidas
npm run lint                   # 145 errores heredados, fase 5. No es puerta de calidad todavía.
```

---

## Reglas que salieron de los fallos encontrados

No son preferencias de estilo: cada una corresponde a un fallo real que llegó a
producción en este repo. Los tests de `tests/` las vigilan.

### 1 · Ninguna Server Action acepta un identificador de usuario

Una Server Action es un **endpoint HTTP público**. El `userId` sale siempre de
la cookie de sesión, nunca de un parámetro.

```ts
// MAL — así estaba: cualquiera podía leer los datos de cualquiera
export async function getUserStats(userId: string) { ... }

// BIEN
export async function getUserStats() {
  const auth = await requireUser();       // app/lib/auth.ts
  if (!auth.ok) return { success: false as const, error: auth.error };
  const userId = auth.user.id;
}
```

- `requireUser()` / `requireAdmin()` **devuelven un resultado, no lanzan**: las
  Server Actions redactan las excepciones en producción y el usuario vería un
  error genérico inútil.
- La verificación usa `auth.getUser()`, que valida el token contra Supabase.
  **`getSession()` no sirve**: lee la cookie sin comprobar la firma.
- La sesión vive en **cookies** (`@supabase/ssr`). Si alguien vuelve a meter
  `createClient` de `@supabase/supabase-js` en el navegador, la sesión se irá a
  `localStorage` y el servidor dejará de verla.

### 2 · Nunca expandir un objeto del cliente sobre una fila

```ts
// MAL — un user_id dentro de formData sobrescribe el del servidor
.upsert({ user_id: userId, ...formData })

// BIEN — lista blanca de campos (ver BIODATA_FIELDS, PHYSICAL_FIELDS)
```

### 3 · Los estados de una pregunta salen de una constante

`app/lib/questions.ts` → `QUESTION_STATUS`. Nada de literales `'active'` sueltos.
El fallo original fue exactamente ese: se escribía `'candidate'` en dos ficheros
y se leía `'active'` en otros dos, así que el banco nunca se servía.

| Estado | Significado |
|---|---|
| `candidate` | Generada en vivo. Se sirve a quien la pidió, pero no entra en el banco reutilizable hasta que un admin la revisa. |
| `active` | En el banco: reutilizable en los tests de cualquier alumno. |
| `disabled` | Descartada. No se sirve **ni se resucita al resembrar**. |

Todo `upsert` sobre `question_hash` lleva **`ignoreDuplicates: true`**. Sin eso,
la fila existente se reescribe: una pregunta aprobada volvía a `candidate` y una
descartada resucitaba en moderación.

### 4 · No tragarse los errores de la base de datos

```ts
// MAL — la UI daba por buena una escritura que había fallado
await supabase.from('x').update(...);
return { success: true };

// BIEN
const { error } = await supabase.from('x').update(...);
return { success: !error, error: error?.message };
```

Para uniones discriminadas, marca los literales: `success: true as const`.
Sin el `as const`, TypeScript infiere `boolean` y `if (res.success)` no estrecha
el tipo — así aparecieron 3 de los 7 errores de compilación originales.

### 5 · La lógica pura vive en `app/lib/`, no dentro de las acciones

`core.ts` construye clientes en tiempo de importación, así que nada de lo que
esté ahí se puede testear. Lo puro (texto, SRS, mapeo de preguntas) está en
`app/lib/` y las acciones lo importan.

---

## Los tests

```
tests/text.test.ts              limpieza de respuestas IA, texto legal, troceado de PDF
tests/srs.test.ts               repetición espaciada (Leitner)
tests/questions.test.ts         mapeo BD/IA → UI, puntuación de examen
tests/actions-auth.test.ts      guardas estáticas sobre las 37 Server Actions
tests/question-lifecycle.test.ts ciclo de vida de las preguntas
```

**Dos convenciones importantes:**

1. **Los tests marcados `BUG:` describen el comportamiento *actual*, no el
   deseado.** Al corregir ese fallo, el test **debe** fallar: se invierte la
   aserción y se le quita el prefijo. Es el aviso de que el arreglo surtió efecto.
   Quedan varios pendientes en `text.test.ts` (fase 2.6) y `srs.test.ts` (fase 4).

2. **Los tests estáticos leen el código fuente** y fallan si vuelve un patrón
   peligroso. No necesitan Supabase. Si añades uno, recuerda quitar los
   comentarios antes de analizar (`stripComments`): un comentario que *cita* el
   patrón para explicarlo cuenta como si fuera código — pasó y costó un rato.

Cuando toques algo cubierto por un test estático, compruébalo **rompiéndolo a
propósito** y viendo que el test lo señala. Un guardián que no muerde no sirve.

---

## Mapa del código

```
app/
  actions/          Server Actions. Una por dominio + core.ts (clientes) e index.ts (barril).
                    core.ts NO se reexporta al cliente: rompería la serialización.
  lib/              Lógica pura y testeable + auth.ts + supabase/{server,client}.ts
  components/
    Admin/          Panel de administración (usuarios, temario, banco, moderación, logs)
    student/        Dashboard del alumno: 7 módulos en modules/
docs/               Auditoría y plan de trabajo
tests/              Vitest
```

**El esquema de la base de datos NO está en el repositorio.** Vive solo dentro
del proyecto de Supabase. Sacarlo con `supabase db pull` a `supabase/migrations/`
sigue siendo la tarea pendiente con más riesgo de pérdida y coste cero.

---

## Trampas conocidas

- **`npm run build` necesita las 4 variables de entorno.** `core.ts` lanza en
  tiempo de importación si falta alguna, y `page.tsx` crea el cliente en el
  módulo, así que el prerender falla.
- **Los 126 `any`** son la razón por la que dos desajustes de nombres de campo
  (`response_time_ms` vs `time`, `baseline_test` vs `baseline_metrics`) llegaron
  a producción sin que nadie se enterara. Al tocar un módulo, tipa lo que toques.
- **No hay Error Boundary.** Una excepción de render deja la app en blanco. Hoy
  `StatsPanel` revienta seguro (lee una columna que no existe) — es la fase 2.2.
- **Los comentarios del código mienten a veces.** El del seed decía "asumimos
  activas" justo encima de `status: 'candidate'`. Fíate del código, no del
  comentario, y corrige el comentario cuando lo veas.

---

## Cómo continuar

1. **Probar 1.1 y 2.1 contra el Supabase real.** Entrar como alumno y como
   admin; sembrar un tema y comprobar que las preguntas aparecen en el banco y
   llegan a un test.
2. **`supabase db pull`** para versionar el esquema.
3. **Fases 1.2 y 1.3** (acotar la clave de servicio, activar RLS) para cerrar
   seguridad, o **2.2** (arreglar el panel de estadísticas) si se prefiere un
   resultado visible: hoy esa pestaña se queda en blanco.

Al cerrar una fase: actualiza la tabla de estado de este fichero, marca la fase
en `docs/PLAN-DE-TRABAJO.md` y el hallazgo en `docs/AUDITORIA.md`.

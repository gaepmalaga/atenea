# Traspaso — 30 de agosto de 2026

Punto de partida para la siguiente conversación. Lo que hay que leer antes de
tocar nada sigue siendo [`CLAUDE.md`](../CLAUDE.md); esto es sólo el estado del
día y por qué está donde está.

---

## Lo primero: ya hay producción

**https://atenea-eight.vercel.app**

Estaba desplegada desde febrero y `CLAUDE.md` decía que no había nada. Lo que
no funcionaba era **entrar**: Supabase tenía la Site URL en
`http://localhost:3000` y ninguna Redirect URL, así que la autenticación no
podía volver a la aplicación. Corregido el 30 ago:

| Ajuste | Valor |
|---|---|
| Site URL | `https://atenea-eight.vercel.app` |
| Redirect URLs | `https://atenea-eight.vercel.app/**` · `http://localhost:3000/**` |

Localhost sigue en la lista a propósito, para que el desarrollo local no se
rompa.

Cada push a `main` despliega solo. Los 12 commits que estaban sin subir ya
están en GitHub.

> **Queda un proyecto duplicado en Vercel**, `atenea-jw3h`, apuntando al mismo
> repositorio. Despliega en paralelo y no molesta, pero son dos URLs vivas de lo
> mismo. Borrarlo es decisión del dueño: no se puede deshacer.

---

## Lo que se hizo en esta tanda

### P3 · La pantalla del test — 6 de 8

```
1. Penalización en la nota      ✅  (27 ago)
2. Volver atrás + marcar        ✅  (27 ago)
3. Mapa de preguntas            ✅
4. Blanco explícito             ✅
5. Tiempo límite + entrega auto ✅
6. Pantalla de revisión final   ✅
7. Referencia legal             ⛔  falta columna en `question_bank`
8. Notas personales             ⛔  falta tabla
```

**El hallazgo que más importa de los cuatro:** el blanco se guardaba como
fallo. La nota ya lo trataba como neutro desde el 27 ago, pero al escribir en
`question_attempts` caía en `is_correct: false`. El mismo examen daba dos
verdades, y el porcentaje de acierto **castigaba no arriesgar** — al revés de
lo que enseña la fórmula del BOE.

Se creía que hacía falta una columna nueva. No hacía falta: `selected_index`
llevaba declarada desde siempre y **nadie la escribía**. Ver la regla 24 de
`CLAUDE.md` para los tres estados y por qué `null` no puede significar «en
blanco».

Lo demás, en las reglas 25 (el reloj) y 26 (entregar no puede estar a un clic
de avanzar).

### Repasar lo fallado — nuevo, no estaba en el plan

Salió de una pregunta directa: *«¿existe algún lugar donde poder ver falladas
etc… para repasar?»*. No existía, y era el agujero más caro: la plataforma
sabía exactamente qué había fallado cada alumno **y por qué** —el diagnóstico
del error es obligatorio, y casi ninguna plataforma del sector lo pide— y ese
dato se recogía y se moría en la tabla.

Pestaña propia, justo después del test. Agregación en
[`app/lib/review.ts`](../app/lib/review.ts), pantalla en
`app/components/student/modules/review/FailedQuestions.tsx`.

### P2 · Escribir preguntas a mano — cerrada

Era lo siguiente con más valor y no necesitaba esquema. Botón **Nueva** en el
Banco Maestro, con dos pestañas:

- **Escribir una**: tema, enunciado, tres opciones marcando la válida,
  justificación y dificultad. Entra directamente como `active` —la escribe un
  administrador sobre su propio temario— y con `origin: 'manual'`, que es lo
  que permitirá comparar después qué rinde mejor, lo escrito a mano o lo
  generado. El tema y la dificultad se conservan al guardar: escribir diez
  seguidas no obliga a elegirlos diez veces.
- **Importar una hoja**: el CSV se lee en el navegador y viaja ya troceado. Se
  ve antes de importar cuántas están listas, cuántas repetidas y **cuáles se
  rechazan, con su línea y el motivo**. Hay plantilla descargable.

Lo que salió sin estar previsto está en el *Estado de P2* de
[`PLAN-PRODUCTO.md`](PLAN-PRODUCTO.md): la huella `question_hash` estaba
copiada dos veces, el tipo `origin` mentía sobre lo que se guarda de verdad, y
la guarda de `ignoreDuplicates` solo miraba un fichero de los dos que ahora
escriben en el banco.

### Los dos guiones de P3 ya están escritos

Siguen sin ejecutar —el DDL es tuyo— pero ya no hay que redactarlos:

| Guion | Qué hace |
|---|---|
| [`P3.7-referencia-legal-de-la-pregunta.sql`](sql/P3.7-referencia-legal-de-la-pregunta.sql) | `legal_reference text` en `question_bank` |
| [`P3.8-notas-personales.sql`](sql/P3.8-notas-personales.sql) | tabla `question_notes` con RLS de propietario |

Los dos son idempotentes y no tocan ni una fila existente. En cuanto estén
ejecutados se puede escribir el código de los dos últimos puntos de P3; antes
no, porque PostgREST rechaza la escritura entera si falta una columna.

---

## Estado de las comprobaciones

| Qué | Cómo está |
|---|---|
| `npm run check` | ✅ 467 tests, typecheck limpio |
| `npm run build` | ✅ |
| Guardas estáticas nuevas | ✅ comprobadas rompiéndolas a propósito |
| Consulta del repaso contra la BD real | ✅ el join resuelve las 17 filas falladas con opciones y respuesta correcta |
| **Las pantallas nuevas, vistas funcionando** | ❌ **no** |

Lo último es la deuda honesta de esta tanda: **verde no es lo mismo que visto**.
Para verlo hace falta una sesión de alumno, y una sesión pide contraseña.

Sin ver quedan: el botón de dejar en blanco y la tecla `0`, la cuenta atrás y
la entrega automática al llegar a cero, la pantalla de revisión antes de
entregar, la pestaña de Repasar fallos, y ahora también **el alta manual y la
importación de preguntas** (P2). El servidor de desarrollo arranca y la portada
carga sin errores en consola; a partir del login hace falta contraseña.

> Para entrar como alumno sin fricción: cambiar `profiles.role` a `student` un
> momento con la clave de servicio y devolverlo a `admin` al terminar.

---

## El cuello de botella real

**No es el código, es el esquema.** El DDL sólo lo puede ejecutar el dueño del
proyecto desde el editor SQL de Supabase, y hay cosas paradas por eso.

Lo que **no** hay que hacer es adelantar el código: PostgREST rechaza la
escritura **entera** si una sola columna no existe, así que escribir contra una
columna que aún no está rompe el guardado en producción. Es el fallo que este
repositorio ya ha pagado tres veces.

Lo que sí: dejar el guion en `docs/sql/` con el *porqué* dentro, y seguir por
otra parte. Así se hizo con
[`P3-blanco-no-es-fallo.sql`](sql/P3-blanco-no-es-fallo.sql), que quedó como
endurecimiento **opcional** — el código funciona igual con o sin él.

---

## Por dónde seguir

1. **Ejecutar los dos guiones** de `docs/sql/` y, con la columna y la tabla ya
   creadas, escribir el código de los dos últimos puntos de P3.
2. **Probar P2 y P3 con una sesión de admin y otra de alumno.** Es lo único que
   separa «pasa los tests» de «funciona».
3. **P4 y P5** (super admin con módulos configurables; panel de academia). P4
   depende de una decisión que sigue abierta: *qué módulos querría apagar la
   academia del piloto*. Sin esa respuesta no se sabe si corre prisa.
4. **P6 (cobros)** sigue aplazado hasta después del piloto, como se decidió.

---

## Pendiente del dueño

- **32 preguntas esperando en Moderación** (26 de Inteligencia, 6 de
  Constitución). Aprobarlas es lo que hace que los tests salgan instantáneos en
  vez de generarse con IA.
- **Probar en producción entrando como alumno**, sobre todo la pantalla del
  test. Es lo único que separa «pasa los tests» de «funciona».
- **Decidir sobre `atenea-jw3h`**, el proyecto duplicado de Vercel.
- **Login con Google**: aplazado por decisión propia. Necesita credenciales
  OAuth de Google Cloud.
- **Qué módulos querría apagar la academia**, cuando se sepa.

> **Ojo con `Confirm email`:** sigue activado en Supabase. Quien se registre no
> podrá entrar hasta pulsar el enlace del correo, y en el plan Free el envío es
> limitado.

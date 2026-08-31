# Traspaso — 30 y 31 de agosto de 2026

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
7. Referencia legal             ✅  (31 ago)
8. Notas personales             ✅  (31 ago)
```

**P3 queda cerrada.** Los dos últimos dejaron de estar bloqueados en cuanto se
ejecutó el DDL: ver más abajo.

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

### Los dos guiones de P3 · escritos, ejecutados y comprobados

| Guion | Qué hace | Estado |
|---|---|---|
| [`P3.7-referencia-legal-de-la-pregunta.sql`](sql/P3.7-referencia-legal-de-la-pregunta.sql) | `legal_reference text` en `question_bank` | ✅ 31 ago |
| [`P3.8-notas-personales.sql`](sql/P3.8-notas-personales.sql) | tabla `question_notes` con RLS de propietario | ✅ 31 ago |

Comprobado **contra la base de datos real**, no contra la pantalla del editor:

- `question_bank` acepta un insert con `legal_reference`, y `question_notes`
  acepta insert y update — los dos caminos nuevos están ahora en
  `npm run smoke`, que inserta una fila de verdad y la borra.
- La clave pública **no** puede escribir en `question_notes`: devuelve
  `42501 new row violates row-level security policy`.
- El join `question_notes → question_bank` resuelve, así que la clave ajena
  está declarada de verdad (sin ella PostgREST no lo resolvería).

### P3.7 y P3.8 · el código

**7 · La referencia legal.** Cambió más de lo previsto, y para bien: no era
rellenar una columna, era cambiar **de dónde sale el contexto**. La generación
tomaba una ventana aleatoria de 12.000 caracteres del documento entero, así que
ni sabía de qué artículo hablaba. Ahora `elegirContexto` elige un fragmento
—que desde P1b es un artículo, con su referencia arreglada en P1f— y guarda de
cuál sale. El alumno la ve en el feedback del entrenamiento y en el repaso de
fallos. Para los apuntes, que no tienen artículos, se mantiene el respaldo sobre
el texto completo.

**8 · Las notas.** Un recuadro suyo en el feedback y en cada tarjeta del repaso,
que vuelve a salir con la pregunta. La miga está en un sitio inesperado: la
aplicación entra con la clave de servicio, que **salta RLS**, así que el filtro
por usuario de cada consulta es la única barrera de verdad. Hay un test estático
que lo vigila.

### El chat sabía contar, pero no lo sabía

Salió de una pregunta de un alumno: *«¿cuántos artículos tiene la
Constitución?»*. El chat respondió **«no consta en el temario oficial
aportado»** — y era verdad, porque **ningún fragmento lo dice**: el texto de una
norma no se cuenta a sí mismo. El buscador devolvía los artículos de reforma,
que es lo más parecido a una pregunta sobre «la Constitución» en abstracto.

Pero el dato sí estaba: desde P1b cada fragmento sabe de qué artículo viene.
Ahora hay dos caminos que no dependen del embedding, y corren en paralelo con él:

- **El índice**, cuando la pregunta es de recuento. Entra como una fuente más,
  etiquetada como *recuento de lo indexado, no texto de la norma*.
- **El artículo exacto**, cuando la pregunta lo nombra. Traerlo por su
  referencia acierta; confiar en que el embedding distinga el 27 del 127 no.

Y apareció un fallo de fondo al hacerlo: **el temario no numera igual en todas
partes.** La Constitución escribe *«Artículo 82»* y la LOFCS *«Artículo cuarenta
y uno»*. Con el lector de cifras a secas, el índice contaba **cero** artículos en
la LOFCS y la describía como «no es un texto legal articulado» — una ley de 54.

Medido contra la base de datos: Constitución **169 (1–169) sin huecos** + 15
disposiciones; LOFCS **54 (1–54) sin huecos** + 18; el tema 40, apuntes, sin
artículos, que es lo correcto.

### P4 · Los módulos, cerrada

La pregunta que llevaba la fase parada desde el 27 de agosto tenía respuesta:
*«que se pueda apagar cualquiera»*. Pestaña **Módulos** en el panel, con los
ocho interruptores.

Lo que importa no es el interruptor: **apagar un módulo lo apaga también en el
servidor**. Filtrar el menú no es una medida de seguridad — una Server Action es
un endpoint público, y las de IA se pagan por llamada.

No se hizo el rol `superadmin`, a propósito: con una academia, el admin eres tú.

---

## Estado de las comprobaciones

| Qué | Cómo está |
|---|---|
| `npm run check` | ✅ 515 tests, typecheck limpio |
| `npm run smoke` | ✅ los 7 caminos de escritura entran contra el proyecto real |
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

1. **Probar P2 y P3 con una sesión de admin y otra de alumno.** Es lo único que
   separa «pasa los tests» de «funciona», y es lo único que queda de estas dos
   tandas.
2. **P4 / P5** (super admin con módulos; panel de academia). P4 sigue esperando
   la respuesta de *qué módulos querría apagar la academia*.
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

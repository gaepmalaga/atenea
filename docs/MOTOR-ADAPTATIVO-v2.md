# El motor de aprendizaje adaptativo, diseñado desde cero

> Diseño de arquitectura de datos y algoritmo. **No es el sistema que hay hoy**
> (Leitner de 6 cajones con intervalos fijos, señales deducidas por respuesta,
> simulacro representativo). Aquí se ignora esa implementación a propósito y se
> vuelve a plantear el problema desde el examen que hay que aprobar.
>
> El *qué* y el *por qué* pedagógico sigue en
> [`METODO-APRENDIZAJE.md`](METODO-APRENDIZAJE.md). Esto es el motor.

---

## 0 · El problema, replanteado

Optimizamos **una nota, un día concreto**:

```
nota = [A − E/(n−1)] × 10/P      n = 3 · P = 100 · 50 minutos · aprobado en 3
```

De ahí salen cuatro consecuencias que el motor tiene que respetar y que un SRS
genérico (Anki, Leitner, incluso FSRS tal cual) **no** respeta:

1. **Hay fecha de caducidad.** No queremos retención indefinida: queremos
   `P(recuerdo) ≥ objetivo` **el día D** y ni un repaso más allá. Un ítem que
   ya aguanta hasta D no se repasa aunque "toque".
2. **El tiempo es parte de la nota.** 30 s por pregunta. Recuperar bien pero
   lento resta puntos igual que fallar, porque se come el presupuesto de otras.
3. **Contestar tiene precio.** Con n=3, acertar vale +1 y fallar −0,5. Merece la
   pena contestar si `p > 1/3`. El caso interesante es el contrario: **un
   distractor que explota una creencia falsa concreta puede llevar `p` por
   DEBAJO del azar**, y ahí dejar en blanco es la jugada correcta. La
   calibración no es un adorno psicológico: es nota.
4. **El temario es cerrado, finito y conocido** (45 temas, ~35 normas del BOE), y
   además tenemos **500 preguntas de exámenes reales** de 5 convocatorias ya
   indexadas (temas 46-50). Eso permite algo que en un dominio abierto no se
   puede: **enumerar el conocimiento examinable y saber su peso empírico**.

Lo que se conserva del sistema actual, porque es correcto: la fórmula del BOE
como única verdad de la nota, **el blanco no es un fallo**, **se deduce, no se
pregunta** (regla 56), y el reparto clave de servicio / sesión de la regla 34.

Lo que se tira: el cajón como unidad de estado, el intervalo fijo por cajón, el
tema como unidad de diagnóstico, y la `explanation` única por pregunta.

---

## 1 · Granularidad del etiquetado

### El error de raíz: la unidad de conocimiento no es la pregunta

Hoy el estado de dominio se lleva **por pregunta**. Eso mide *"¿se sabe esta
pregunta?"*, y lo que hay que medir es *"¿se sabe este dato?"*. Un alumno que ha
visto la misma pregunta seis veces la acierta por la forma del enunciado y falla
la misma norma redactada de otra manera — el examen real la redacta de otra
manera **siempre**.

> **La unidad primaria pasa a ser el `claim`: un hecho atómico comprobable.**
> Una pregunta es un *instrumento de medida* de uno o varios claims. El estado de
> memoria, la programación de repasos y el diagnóstico van sobre el claim.

«El plazo máximo de detención preventiva es 72 horas» es un claim. La pregunta
que lo mide es intercambiable; el claim no.

Esto tiene una consecuencia arquitectónica grande y buena: **se pueden generar
preguntas nuevas a partir del claim** en vez de extraer el claim de preguntas ya
escritas. El banco deja de ser la fuente de verdad y pasa a ser producto derivado.

### Seis ejes, no un árbol más profundo

Bajar de `tema` a `tema → artículo → apartado` no resuelve nada: sigue sin
distinguir *"no se sabe el plazo"* de *"confunde dos órganos"*. Hacen falta ejes
ortogonales.

**Eje 1 · Anclaje normativo (`norm_node`).** Árbol canónico y verificable:
`norma (id del BOE) → título → artículo → apartado → inciso`. Enumerable porque
el temario es cerrado. Se ancla a los `document_chunks` ya indexados, que es lo
que después permite llevar al alumno al texto exacto (§5). Un claim cuelga de un
nodo principal y puede referenciar nodos **de contraste**.

**Eje 2 · Tipo de claim.** Es el eje que convierte el diagnóstico en algo
accionable:

| tipo | ejemplo | qué falla cuando falla |
|---|---|---|
| `plazo` | 72 h, 15 días hábiles | números vecinos entre normas |
| `cuantía` / `umbral` | 400 €, 3 años | idem |
| `órgano_competente` | quién autoriza, quién instruye | confusión entre órganos hermanos |
| `composición` | cuántos vocales, quién los nombra | listas numéricas |
| `requisito` | qué hace falta para X | omisión de un elemento |
| `excepción` | cuándo NO se aplica la regla | se sabe la regla, no la excepción |
| `jerarquía` / `orden` | prelación de fuentes | ordenación |
| `definición` | qué es la flagrancia | discriminación conceptual |
| `procedimiento` | qué va antes de qué | secuencia |
| `ámbito` | a quién se aplica | sobre/infra-generalización |

*«Fallas los plazos en todo el bloque I»* es una frase que cambia lo que el
alumno hace mañana. *«Fallas el tema 9»* no.

**Eje 3 · Operación cognitiva exigida (`skill`).** El mismo claim con otra
operación es otra dificultad y pide otra corrección: `recuerdo_literal`,
`discriminación` (entre semejantes), `aplicación` (a un caso), `cómputo`
(calcular un plazo), `negación` (¿cuál NO es?), `exhaustividad` (todas las de la
lista). La `negación` merece eje propio: se falla por procesamiento, no por
desconocimiento, y confundirla con una laguna manda al alumno a releer un
artículo que ya se sabe.

**Eje 4 · Anatomía del distractor. Es la pieza que falta hoy y donde está el
diagnóstico de verdad.** Cada opción incorrecta lleva su **mecanismo** y, cuando
existe, el **claim señuelo** al que pertenece:

| mecanismo | qué creencia falsa revela |
|---|---|
| `valor_vecino` | tiene el número de al lado (48 en vez de 72) |
| `valor_de_norma_hermana` | tiene el valor correcto **de otra ley** |
| `órgano_hermano` | confunde juez / fiscal / autoridad gubernativa |
| `versión_derogada` | estudió con material viejo |
| `regla_por_excepción` | conoce la regla general y la aplica donde no toca |
| `absoluto_falso` | «siempre», «en todo caso» |
| `plausible_inventado` | no ancla en nada: laguna limpia |

Con esto **fallar deja de ser un evento booleano y pasa a ser un vector**: qué
creencia falsa concreta tiene este alumno. El «distractor fijo» que el sistema de
hoy detecta por posición (regla 60) aquí es semántico y se puede corregir.

**Eje 5 · Peso de examen.** Frecuencia empírica del nodo/claim en los 500
ítems reales ya indexados, suavizada bayesianamente hacia un prior estructural
(peso del bloque y del tema). Alimenta §4.

**Eje 6 · Vigencia.** `vigente_desde` / `vigente_hasta` en el claim, no en la
pregunta. Una reforma no invalida un tema: invalida un hecho. Y obliga a algo que
nadie hace: **marcar para desaprender** a los alumnos que ya consolidaron el
valor viejo. Una reforma convierte una fortaleza en una trampa.

### El grafo de confusión (`claim_edge`)

Aristas entre claims: `valor_vecino`, `órgano_hermano`, `norma_hermana`,
`derogado_por`, `regla/excepción`. Se pueblan de dos formas:

- **Declaradas** al etiquetar (el LLM las propone: tiene el texto delante).
- **Descubiertas** de los datos: si los alumnos que fallan A tienden a marcar el
  señuelo de B, hay una arista aunque nadie la escribiera. Esto es medible con
  los datos de §2 y es el activo que crece solo.

El grafo es lo que permite **corregir por racimos**: deshacer una confusión
arregla seis preguntas, no una. Entra en la función de valor de §4.

### El coste del etiquetado, que es la objeción obvia

1795 preguntas. No se etiqueta a mano.

- El LLM propone los seis ejes **con el artículo delante** (ya está troceado e
  indexado), y devuelve `confianza`.
- Confirmación humana **en lote**, pantalla de triaje: la propuesta ya viene
  rellena, el admin acepta o corrige. Segundos por pregunta, no minutos.
- Las **500 preguntas de exámenes reales** traen enunciado, respuesta oficial
  **y explicación razonada con referencia legal**. Son la semilla de máxima
  calidad del grafo y, a la vez, el prior de peso. Se etiquetan primero.
- De ahí en adelante **las preguntas nacen del claim**, así que el etiquetado
  deja de ser una deuda y pasa a ser gratis.

`etiquetado_por` y `etiquetado_confianza` viajan en la fila: un diagnóstico
preciso construido sobre etiquetas malas es peor que el tema, porque miente con
apariencia de exactitud.

---

## 2 · Telemetría: la secuencia completa de decisión

Hoy se guarda el **agregado** de un proceso (acierto, tiempo, nº de cambios).
Guardemos el proceso.

### La traza

Cada intento lleva una lista de eventos con `t` en milisegundos **relativo al
render de la pregunta**:

| evento | por qué importa |
|---|---|
| `render` | orden en que se pintaron las opciones (se aleatoriza por alumno: sin registrarlo no se puede analizar nada) |
| `visible` | si la opción C entró en pantalla. En móvil puede caer bajo el pliegue: fallar por no verla **no es una laguna** |
| `foco_opcion` | el "casi la marco": pre-selección sin confirmar |
| `seleccion` / `cambio` | con `de → a`, no solo el contador |
| `relectura` | vuelve al enunciado después de haber marcado |
| `blanco_deliberado` | lo deja en blanco habiendo deliberado |
| `revisita` | en simulacro, vuelve a la pregunta y cambia o no |
| `pausa_foco` / `retorno_foco` | pestaña en segundo plano, llamada entrante |
| `entrega` | |
| `feedback_visto` | cuánto tiempo pasa leyendo la corrección |

**`pausa_foco` es el evento más importante de la lista y hoy no existe.** Sin él,
una respuesta de 300 s parece deliberación profunda y es un alumno que atendió
una llamada. Toda señal derivada del tiempo está envenenada mientras no se
descuente el tiempo sin foco. Es el primer arreglo que hay que hacer, antes que
cualquier modelo.

**`feedback_visto` es el segundo.** Es la única medida de si el alumno procesó la
corrección, y predice si el próximo encuentro irá bien. Un fallo cuya corrección
se saltó en 0,4 s no es el mismo evento que uno cuya corrección se leyó 20 s.

### Rasgos derivados (se calculan al escribir, se guardan como columnas)

- `t_recuperacion` (render → primer contacto con una opción) vs `t_deliberacion`
  (primer contacto → entrega). Recordar y decidir son dos cosas.
- `t_activo` = total − huecos sin foco.
- `trayectoria`: `A→B` no es `A→B→A`. La **reversión** es conocimiento correcto
  dudado: frágil pero presente. Merece intervalo corto, no degradación.
- `ritmo_relativo`: `t_activo` normalizado por la mediana **de ese alumno, para
  ese `skill` y esa longitud de enunciado**. Hoy se normaliza solo por alumno, y
  una de «la MÁS correcta» de cinco líneas no se responde como una de tres.
- `certeza_conductual ∈ [0,1]`: derivada de firmeza + ritmo + trayectoria.
  **Nunca preguntada** (regla 56). Es la que alimenta la nota graduada de §3.
- `modo_acierto`: `recuperacion` (directo y firme) vs `descarte` (enfocó dos
  opciones antes de acertar). **Hoy los dos cuentan como acierto pleno y no lo
  son**: el descarte se cae en el examen cuando aprieta el reloj.
- `orden_en_sesion`, `minuto_de_sesion`, `hora_del_dia`, `dispositivo` → fatiga
  y contexto, que se restan al estimar la memoria.

### Los tres blancos

Un blanco no es un dato, son tres, y la traza los separa:

| | firma en la traza | qué es | qué se hace |
|---|---|---|---|
| **por ignorancia** | sin toques, corto | laguna limpia | material nuevo |
| **por calibración** | deliberó, enfocó dos, decidió no arriesgar | decisión | **medir si acertó al abstenerse** |
| **por reloj** | en simulacro, al final, sin ver | gestión del tiempo | entrenar ritmo |

El segundo es oro y hoy se pierde: permite calcular la **calibración** del
alumno — de lo que dejó en blanco, ¿cuánto habría acertado? — y eso es puntos
directos (§4).

### Volumen y retención

~30-60 eventos por intento; un alumno activo hace ~100 intentos/semana. La traza
cruda vive **90 días** en `jsonb`; los rasgos derivados, para siempre. El modelo
no lee la traza cruda en caliente: lee columnas.

---

## 3 · La curva de olvido personal

### El modelo

Por cada par **(alumno, claim)** se mantiene un estado de memoria con dos
variables, no un cajón:

- **`S` (estabilidad)** — cuánto aguanta el recuerdo. Es lo que crece con cada
  repaso bueno.
- **`D` (dificultad)** — cuánto le cuesta a *este* claim ganar estabilidad.

La probabilidad de recuerdo decae con una **ley de potencia**, no exponencial:

```
R(t) = (1 + t / S)^(−d)
```

La exponencial infravalora la retención a largo plazo, y aquí el horizonte son
12-24 meses: con una exponencial, todo lo estudiado hace ocho meses se programa
para repasar aunque el alumno lo recuerde perfectamente.

Tras un repaso, la estabilidad se actualiza con la forma:

```
S' = S · (1 + a · e^(b·(1−R)) · g(nota) · k_alumno[tipo_claim] · 1/D)
```

Lo que importa de esa forma no es la fórmula (es de la familia FSRS), son tres
propiedades:

1. **El término `(1−R)` es el efecto de espaciado.** Se gana mucha más
   estabilidad repasando algo que casi se había olvidado que algo fresco. Es la
   justificación matemática de no repasar lo que ya está seguro — y de que el
   sistema actual, con intervalos fijos, tire tiempo sistemáticamente.
2. **`g(nota)` es graduada, no binaria.** La traza (§2) da cuatro niveles
   deducidos —fallo / acierto por descarte / acierto normal / acierto firme y
   rápido— en vez de un booleano. Un acierto titubeante no debe crecer la
   estabilidad como uno firme. Nunca se pregunta al alumno: se deduce.
3. **`k_alumno[tipo_claim]` es la personalización, y es un vector, no un escalar.**

### Cómo se aprende la curva sin sobreajustar

Tres niveles, con **encogimiento jerárquico** (empirical Bayes):

- **Nivel 0 · población.** Parámetros ajustados sobre todos los alumnos de la
  plataforma. Es lo que se usa el primer día.
- **Nivel 1 · alumno.** Un multiplicador **por tipo de claim** (~10 dimensiones):
  hay gente que es mala con números y normal con competencias, y un único
  parámetro global de "memoria" lo promedia hasta hacerlo inútil. Cada dimensión
  se **encoge hacia la media global en proporción a cuántas observaciones tiene
  el alumno en ella**. Con 20 respuestas, el alumno *es* la población; con 2.000,
  es él mismo. Esto es lo que impide que 20 respuestas produzcan una "curva
  personal" que es ruido con nombre propio.
- **Nivel 2 · ítem.** La dificultad del claim, agrupada entre alumnos, también
  con encogimiento. Así se arregla de paso el `global_success_rate` de hoy, que
  vale 0 con un intento y se lee como "lo falla todo el mundo" (regla 8).

**Ajuste:** trabajo nocturno por alumno sobre su historial (miles de filas: es
barato), con los parámetros **versionados**. Cada repaso es un dato etiquetado:
`(intervalo transcurrido, R predicho, resultado real)`.

**Y se mide si el modelo aprendió algo**, que es la parte que casi nadie hace:
log-loss y **diagrama de fiabilidad** por alumno (de lo que predije al 85 %,
¿acertó el 85 %?), contra una rama de control con intervalos fijos. Sin eso, "la
curva personal" es una afirmación de marketing.

### La fecha del examen lo cambia todo

Un SRS clásico optimiza retención indefinida. Un opositor necesita
`R ≥ objetivo` **el día D** (`academy_convocatoria` ya lo tiene) y nada después.
Consecuencias concretas y todas contraintuitivas respecto a Anki:

- **Lejos de D:** maximizar crecimiento de estabilidad. Espaciar agresivamente y
  **aceptar olvidar** — el olvido parcial es el mecanismo que genera estabilidad.
- **Cerca de D:** el objetivo cambia de "construir" a "asegurar". El último
  repaso de cada claim se programa **hacia atrás desde D**, resolviendo cuándo
  hay que tocarlo para que su curva aterrice en el objetivo justo ese día.
- **Lo que ya aguanta hasta D no se repasa**, esté "vencido" o no. Repasarlo es
  tiempo robado a otro claim. Esta sola regla recupera un porcentaje grande del
  presupuesto diario.
- **Si el presupuesto no llega hasta D, se abandona material a propósito y por
  rendimiento** (§4), en vez de ir acumulando atraso uniforme, que es como todo
  el mundo llega al examen con 900 tarjetas vencidas y ninguna prioridad.

### Tres casos que el modelo tiene que tratar aparte

- **El regreso tras una ausencia.** Tres semanas fuera no son 900 repasos
  vencidos: es un plan de reentrada ordenado por valor × decaimiento, con techo
  diario. Ver una cifra de atraso impagable es la causa número uno de abandono.
- **La claim que no responde (`atascada`).** Si tras 3 repasos la estabilidad no
  crece, **no es un problema de memoria, es de comprensión**. El modelo lo
  detecta solo (S plana) y deja de programarla: se deriva a corrección (§5).
  Repetirla más es exactamente lo que no funciona.
- **La fluidez como objetivo propio.** Un claim que se recupera bien pero lento
  no pide espaciado: pide **series cortas de recuperación rápida**. Es otra
  intervención sobre los mismos datos, y sale de `t_recuperacion`.

---

## 4 · Priorizar por impacto en la nota

### Por qué la tasa de fallo es la métrica equivocada

Ordenar por tasa de fallo prioriza (a) lo raro, (b) lo que apenas sale en el
examen y (c) **las preguntas mal redactadas**, que son las que más se fallan
(esta plataforma ya lo aprendió, regla 35). Optimiza trivia.

### La función de valor

Para cada claim `c`, la ganancia esperada de nota por minuto invertido:

```
valor(c) = [ w(c) × Δp_D(c) × ∂nota/∂p ] / coste(c)
```

**`w(c)` — masa esperada en el examen.** Cuántas de las 100 preguntas dependen de
este claim. Se estima cruzando: (1) el peso estructural del bloque y el tema
según el programa oficial, (2) **la frecuencia empírica en los 5 exámenes reales
ya indexados**, (3) suavizado bayesiano — que un claim no haya salido en 500
preguntas no es peso cero, `n` es pequeño; se encoge hacia el prior estructural.
Esto es lo que convierte los exámenes oficiales de "cinco temas más de estudio"
en **el prior de rendimiento de todo el motor**.

**`Δp_D(c)` — mejora realizable, medida EL DÍA DEL EXAMEN.** No `1 − p_hoy`. Es
`p_objetivo − p_D`, con `p_D` predicho por el modelo de §3. Dos casos que sólo
esta formulación distingue:

- Claim al 0,95 **hoy** pero con estabilidad baja → `p_D = 0,5` → ganancia
  enorme. Invisible para cualquier ranking basado en el rendimiento actual.
- Claim al 0,4 hoy pero genuinamente duro para este alumno → mejora realizable
  pequeña por minuto. **No todo lo que se falla merece arreglarse.**

**`∂nota/∂p` — la derivada de la fórmula del BOE**, que no es `p` sino
`(3p−1)/2` por pregunta contestada: el valor marginal de subir `p` depende de
dónde estés. Y el régimen interesante: **cuando un distractor explota una
creencia falsa concreta, `p` cae por debajo de 1/3 y el valor esperado de
contestar se vuelve negativo**. Esos claims tienen prioridad máxima, porque no
están restando cero: están restando.

**`coste(c)` — minutos previstos hasta consolidarlo**, estimado del propio
historial del alumno para claims del mismo tipo y dificultad similar. Una
atascada cuesta mucho, y eso tiene que competir con todo lo demás.

**Transferencia — el valor se calcula sobre el racimo, no sobre el claim.**
Deshacer una confusión del grafo (§1) arregla todas las preguntas que usan ese
señuelo. El ranking opera sobre componentes del grafo de confusión, y por eso una
sola sesión bien elegida puede mover seis preguntas del examen.

### Los dos objetivos que no son la media

**Varianza.** Dos alumnos con nota esperada 6,0 no son el mismo alumno si uno
tiene σ=0,4 y el otro σ=1,5 y el corte está en 5. Cerca del corte, **reducir
varianza vale más que subir la media**: se prioriza cobertura ancha (matar
huecos) sobre profundizar fortalezas. Lejos y por encima, al revés. El motor
estima `P(aprobar)` y optimiza eso, no la nota media.

**Tiempo de examen.** El presupuesto es 50 minutos. Un claim correcto pero lento
consume presupuesto de otros, así que la simulación de nota incluye la
restricción temporal, y la fluidez entra en la función de valor con signo propio.

**Calibración.** De lo que el alumno dejó en blanco, ¿cuánto habría acertado?
(§2 lo mide). Si deja en blanco cosas que domina al 60 %, está regalando puntos y
la intervención **no es estudiar más temario**: es entrenar la decisión. Es la
mejora de nota más barata que existe y hoy es invisible.

### El montaje de la sesión

El ranking da un orden; la sesión es un problema de mochila con restricciones:

- **Restricción de dificultad:** acierto esperado del conjunto entre 0,80 y 0,90
  (regla del 85 %). Es una **restricción**, no el objetivo.
- **Nunca dos preguntas del mismo claim en la misma sesión** — mide dos veces lo
  mismo y engaña al modelo.
- **Intercalado** entre temas y tipos, con excepción: material nuevo entra en
  bloque corto antes de pasar a la mezcla.
- **Lo más caro, al principio** (fatiga), y cierre con 2-3 de victoria segura.
- **Explicable:** la sesión se guarda con el porqué de cada elección. Un opositor
  que no entiende por qué le preguntan algo desconfía del sistema y lo abandona.

---

## 5 · La corrección vinculada al momento exacto del error

### La unidad de corrección es la creencia falsa, no la pregunta

Hoy: una `explanation` por pregunta, igual para todos, mostrada al terminar.
Diseño nuevo: la corrección se dirige al **par `(claim, mecanismo del distractor
elegido)`** — es decir, a la creencia falsa concreta que el alumno acaba de
demostrar tener.

*«Marcaste 48 h. 48 h es el plazo de X en la norma Y; el de aquí es 72 h y sale
del art. 17.2 CE»* es una corrección. *«La respuesta correcta es la B porque el
artículo dice...»* es un párrafo.

Los textos se **pregeneran una vez por distractor** (son finitos: ~3 por
pregunta), pasan por moderación como el banco y se cachean. **Nunca se generan en
vivo al clic del alumno** (regla 39: el gasto de IA no lo dispara quien no paga).

### El "momento exacto" son tres momentos, y cada uno pide otra cosa

**1 · Al responder (t ≈ 30 s).** Micro-corrección contrastiva de una frase, ≤15 s
de lectura, anclada al `norm_node` con enlace al inciso exacto. Tiene que ser
inmediata para que la opción equivocada no se consolide; tiene que ser corta o no
se lee, y una corrección que no se lee es peor que ninguna porque enseña a
saltársela (la lección de la regla 32).

**2 · Al cerrar la sesión.** Agrupación por mecanismo: *«4 de tus 6 fallos de hoy
fueron plazos que confundes con el plazo de otra norma; aquí están los cuatro
juntos»*, con el **par confundido lado a lado**. Una confusión de discriminación
no se deshace explicando un ítem: se deshace **contrastando los dos**. Una
`explanation` por pregunta es estructuralmente incapaz de hacer esto.

**3 · En el siguiente encuentro (días después). Aquí está el punto más
importante del diseño:**

> **La corrección de verdad no es un texto: es la siguiente medición.**

El planificador debe traer de vuelta **otra pregunta del mismo claim que contenga
el mismo mecanismo de distractor**. Si vuelve con una pregunta cuyos señuelos no
incluyen aquel en el que cayó, no se ha comprobado nada: se ha comprobado que
recuerda la respuesta, no que murió la creencia falsa. Esto es posible **sólo**
porque las opciones están etiquetadas (§1, eje 4), y es la razón principal por la
que ese eje existe.

### El ciclo se cierra: se mide si la corrección funcionó

Cada corrección servida deja un `remediation_event`. Los siguientes 1-2
encuentros con ese par `(claim, mecanismo)` se enganchan a él. Eso da:

- **Tasa de curación por texto de corrección.** Se pueden encontrar y reescribir
  las correcciones que no curan. El contenido mejora con el uso, no sólo el
  calendario.
- **Escalada.** Si la misma creencia sobrevive a 2 correcciones, no es una laguna
  de memoria: es un modelo mental equivocado. Se escala — ficha de contraste
  generada del par confundido, envío al artículo, y **aviso al profesor en el
  panel de la academia**: *«3 alumnos de tu grupo tienen la misma creencia falsa
  sobre el art. X»*. Eso es información que hoy ninguna academia tiene y que
  justifica por sí sola el dato agregado por clase.
- **Retroalimentación al banco.** Si un distractor engaña a alumnos que por lo
  demás dominan el claim, hay dos explicaciones: o la pregunta es ambigua
  (→ moderación), o es una trampa conceptual legítima (→ enseñarla). **El modelo
  de memoria distingue las dos**, porque sabe si el alumno domina el claim o no.
  Es la forma correcta de resolver el problema de la regla 35, que hoy se
  aproxima con un mínimo de intentos.

### El blanco tiene su propia corrección

Un blanco no es un error, es una declaración de no saber, y su corrección es
otra: *«de las 12 que dejaste en blanco, en 9 tu opción rondada era la correcta;
estás regalando ~1,3 puntos»*. Ataca la tercera habilidad (calibración), que es
donde está la nota más barata.

---

## 6 · Arquitectura de datos

Conceptual, en tres capas. Lo que es hoy una tabla (`question_bank`) se convierte
en un grafo de conocimiento + instrumentos de medida.

### Capa de conocimiento (compartida, no por alumno)

| entidad | claves | qué guarda |
|---|---|---|
| `norm_node` | `id`, `padre_id` | árbol norma→título→artículo→apartado; enlaza a `document_chunks` |
| `claim` | `id` | hecho atómico: `tipo`, `valor_canonico`, `norm_node_id`, `vigente_desde/hasta`, `dificultad` (jerárquica), `enunciado_canonico` |
| `claim_edge` | `(a, b, tipo)` | grafo de confusión; `origen`: declarada \| descubierta; `fuerza` |
| `question` | `id` | instrumento: `skill`, `claim_principal`, `claims_contraste[]`, estado, origen |
| `question_option` | `(question_id, idx)` | `es_correcta`, `mecanismo`, `claim_señuelo_id` |
| `correction` | `(claim_id, mecanismo)` | texto contrastivo, ancla a `norm_node`, moderación, **eficacia medida** |
| `exam_weight` | `claim_id` \| `norm_node_id` | frecuencia empírica en exámenes reales + prior estructural + posterior |

### Capa de evidencia (por alumno, append-only)

| entidad | qué guarda |
|---|---|
| `attempt` | una por respuesta: `question_id`, `claim_id`, resultado, **rasgos derivados** de §2 como columnas, `session_id`, `exam_id`, contexto |
| `attempt_trace` | la secuencia de eventos en `jsonb`, retención 90 días |

Append-only es innegociable: el modelo de memoria se reajusta desde el historial,
así que el historial es el activo. Nada se sobrescribe.

### Capa de estado (por alumno, derivada y reconstruible)

| entidad | claves | qué guarda |
|---|---|---|
| `memory_state` | `(user, claim)` | `S`, `D`, `ultimo_repaso`, `R_hoy`, `R_en_D`, `n_repasos`, `fluidez`, `estado` |
| `memory_params` | `(user, version)` | `k[tipo_claim]`, métricas de calibración, `n_obs` |
| `belief` | `(user, claim, mecanismo)` | creencia falsa activa: evidencia, estado (activa/en_tratamiento/curada), última corrección servida |
| `remediation_event` | `id` | corrección servida en `t`, resultado medido después |
| `session_plan` | `id` | qué se eligió y **por qué** (auditable y explicable al alumno) |

**Toda la capa de estado es reconstruible desde la de evidencia.** Es caché, no
verdad. Eso permite cambiar el modelo de memoria —o pasar a otro— reprocesando,
sin migración de datos y sin perder historial. Es la propiedad que hoy no tiene
el sistema de cajones.

### Los tres bucles

- **En caliente (ms, por respuesta):** escribir `attempt` + traza, actualizar
  `memory_state` del claim, decidir la micro-corrección. Nada de modelos.
- **Cada noche (por alumno):** reajustar `memory_params`, recalcular `R_en_D` de
  todo, recalcular el ranking de valor, preparar el plan del día siguiente.
- **Cada semana (plataforma):** reajustar dificultades de claims y priores de
  población, descubrir aristas nuevas del grafo de confusión, evaluar eficacia de
  correcciones, detectar preguntas defectuosas.

---

## 7 · Arranque en frío

- **Alumno nuevo:** priores de población. Los parámetros personales empiezan a
  pesar de verdad hacia las ~200 respuestas; antes, el encogimiento los mantiene
  pegados a la media. El alumno no nota nada, que es lo correcto.
- **Claim nuevo:** dificultad del prior de su tipo y de su nodo normativo.
- **Plataforma nueva:** el orden de construcción importa. **Sin la capa de
  claims, §3 es afinar un calendario sobre la unidad equivocada**, y §4 y §5 no
  se pueden construir en absoluto. El orden por rendimiento sobre esfuerzo:

  1. **`pausa_foco` y `feedback_visto` en la traza** (§2). Días de trabajo,
     arregla todas las señales de tiempo que hoy están contaminadas.
  2. **Etiquetado de opciones (eje 4) + correcciones por mecanismo** (§1 + §5).
     Es el salto de calidad percibida más grande y **no necesita ningún modelo**.
  3. **Claims y grafo**, sembrados desde los exámenes reales (§1).
  4. **Pesos de examen** desde esos mismos exámenes (§4). Barato y de efecto
     inmediato en la priorización.
  5. **Modelo de memoria personal** (§3), con rama de control y medición de
     calibración.

  Cada paso es útil por sí solo. Ninguno obliga a tener el siguiente.

---

## 8 · Cómo se demuestra que esto funciona

Sin esto, todo lo anterior es una opinión elaborada:

- **Calibración del modelo:** diagrama de fiabilidad por alumno. Predicho 85 % →
  observado 85 % ± 3.
- **Contra la rama de control** (intervalos fijos): retención a 30/90 días con el
  mismo número de repasos, o los mismos repasos con menos tiempo.
- **Curación de creencias:** % de pares `(claim, mecanismo)` que no reaparecen
  tras 1 y 2 correcciones, por texto de corrección.
- **El único que importa de verdad:** nota en simulacros completos y
  representativos, y correlación entre la nota **predicha** por el motor y la
  real. Un motor que predice bien la nota es un motor que entiende al alumno.

---

## 9 · Modos de fallo que hay que vigilar

- **Etiquetas malas → diagnóstico falso con apariencia de precisión.** Es peor
  que quedarse en "tema", porque se actúa sobre él. De ahí `etiquetado_confianza`
  y la confirmación humana.
- **Sobreajuste de la curva personal.** 20 respuestas no son una persona. El
  encogimiento jerárquico no es un refinamiento estadístico opcional: es lo que
  impide vender ruido como personalización.
- **Sobreinterpretar la traza.** Una respuesta de 300 s es casi siempre una
  interrupción, no deliberación. Sin los eventos de foco, toda señal derivada del
  tiempo es basura con decimales.
- **Un blanco no es un fallo, un `null` no es un cero, y una tasa sobre 1 intento
  no es una tasa.** Las tres ya han costado dinero en este repo (reglas 8, 16,
  24). El nuevo motor multiplica las oportunidades de repetirlas.
- **Complejidad.** Esto es 3-4× el sistema de hoy. La capa de claims es la única
  pieza innegociable; todo lo demás tiene que degradar con gracia hasta ella.

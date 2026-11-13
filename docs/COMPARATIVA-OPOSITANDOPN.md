# Comparativa con OpositandoPN (12 nov 2026)

Segunda vuelta de la revisión que ya empezó la regla 120 (12 nov, con capturas).
Esta vez se entró de verdad en `app.opositandopn.com` con la sesión real de la
academia, solo lectura, sin completar ni entregar
ningún simulacro, sin tocar ajustes ni extraer su banco de preguntas. Lo que
sigue completa lo que la regla 120 dejó pendiente: ranking, análisis con IA,
progreso, físicas, psicotécnicos, inglés, calculadora de nota, gamificación y
onboarding.

**Premisa que no cambia:** no hacer nada nuevo sin tener afianzado lo que ya
tenemos (docs/TRASPASO.md §2e). Nada de lo de aquí abajo es urgente; es
material para decidir, no una lista de tareas.

---

## Tabla ellos / nosotros / veredicto

| Funcionalidad | OpositandoPN | Campus Alphapol (nosotros) | Veredicto |
|---|---|---|---|
| Ranking de simulacro | Top 5 con nota, tiempo, nota media y nota de corte en **cada** simulacro (también en los "esenciales", no solo el competitivo mensual) | No existe, a propósito (regla 120) | **No copiar.** Expone al alumno con nota baja; lo vieron y lo descartaron ya una vez |
| Análisis con IA por pregunta | "Análisis de tu respuesta" tras cada fallo (ya visto antes de esta revisión) | Feedback que explica también las opciones incorrectas (regla 73), sin coste extra por ser aparte | Empate. Lo nuestro va dentro del mismo feedback, sin una llamada a Gemini de más |
| Análisis de progreso con IA (agregado) | Un botón "Analiza tu progreso" **solo en físicas**, y solo si hay marcas subidas esa semana; para teoría no existe nada agregado | No existe (el chat con IA está fuera del MVP, regla 58) | **No copiar.** Coste de IA por alumno sin medir su valor; mismo problema que ya resolvimos con el chat |
| Progreso / estadísticas | Total simulacros, nota media, velocidad por pregunta, dos gráficas (nota en el tiempo, correctas/erróneas/sin contestar), separado por Teoría/Psicotécnicos/Inglés | "Mi Evolución" (regla 77): mapa de temas, dominadas/en camino/se resisten/evitas con contexto, curva diaria cacheada, racha en calendario | **Lo nuestro es más profundo.** Lo suyo son cuatro números y dos gráficas; lo nuestro sale del motor adaptativo real (regla 73) |
| Pruebas físicas: planes | 3 niveles fijos (Agilidad/Estabilidad/Potencia aeróbica) con un texto genérico idéntico para todos los alumnos | Preparador real que escribe el plan (regla 48), o motor adaptativo por grupo (P9), con baremo en % de 1RM (regla 89) | **Lo nuestro es mejor.** Un texto estático igual para 10.000 alumnos no es personalización |
| Pruebas físicas: registro | 3 categorías oficiales (circuito, suspensión en barra, carrera) con tiempo/segundos y una "nota rápida"; puntos por baremo | Marcas con 1RM y % de carga, ligadas al plan real del preparador | Parecido en el dato que se pide; **lo nuestro ata la marca a un plan de verdad**, lo suyo es un cuaderno suelto |
| Psicotécnicos | Taxonomía rica: numérico, verbal, espacial, abstracto, capacidad administrativa, con subtemas concretos (series de figuras, tangramas, comprensión lectora…) | 6 tipos generados por código, sin banco fijo que se agote (regla 117) | **Ellos tienen más variedad de tipos; nosotros tenemos oferta infinita.** Complementario, no sustituible uno por otro |
| Inglés (B1) | Módulo propio: simulacro de comprensión de texto, tiempos verbales, derivación de palabras, corrección gramatical | No existe como módulo | **Hueco de contenido real**, si la convocatoria de Alphapol lo exige — ver recomendación E |
| Esquemas visuales | Infografía propia por SUBTEMA (no por tema), con diseño de marca, descargable | Solo el PDF del temario y fichas de texto generadas por IA (regla 39) | **Ellos hacen mejor el material de estudio visual.** Es trabajo de diseño, no de ingeniería |
| Normativa | Lista de enlaces externos al BOE, por tema | El temario indexado se usa para preguntas y chat (fuera del MVP), no hay una lista de enlaces a la norma original | Menor: ellos enlazan la fuente oficial, nosotros no la exponemos aparte |
| Exámenes oficiales | 13 exámenes reales completos (2014-2026), se pueden hacer literalmente como simulacro | 5 exámenes (2021-2025), indexados solo para extraer el peso real del examen (regla 73) y **vetados como fuente de generación** (regla 78) | Ellos ofrecen más años y los dejan hacer tal cual; nosotros los usamos solo como dato, con más cautela |
| Preguntas guardadas | Marcador simple, sin prioridad ("guardar para luego") | No existe un marcador genérico; existen las notas privadas (regla 29), que son otra cosa | Hueco pequeño: un "guardar esta pregunta" sin más, aparte de las notas |
| Preguntas falladas | Lista plana agrupada por tema, "crear simulacro" de 15/25/50/100 | "Repasar fallos" por prioridad: atascadas primero, con aviso de releer el artículo (regla 62) | **Lo nuestro es más inteligente.** Lo suyo es una lista; lo nuestro decide qué repasar antes |
| Simulacro a medias | Se pausa y queda guardado en el SERVIDOR, recuperable desde cualquier dispositivo | Se guarda en `localStorage` del navegador (regla 37) | Diferencia real: lo suyo sobrevive a cambiar de móvil a ordenador; lo nuestro no |
| Calculadora de nota | Widget suelto: preguntas, aciertos, errores, nº de alternativas → nota con la fórmula del BOE | La misma fórmula (regla 22) vive dentro del resultado del examen, no como herramienta aparte | Hueco pequeño y barato de cerrar — ver recomendación A |
| Gamificación | Puntos/gemas, "reto personal" (racha con escudo anti-fallo), duelos 1 contra 1 con 10 preguntas | Ninguna, a propósito (regla 85: tono de academia) | **No copiar**, ya decidido |
| Onboarding / Mi cuenta / Ajustes | No se pudo revisar: viven en el dominio de marketing (`www.opositandopn.com`), piden iniciar sesión aparte y no se debía crear cuenta ni usar credenciales ajenas | — | Sin comparar. Si interesa, haría falta que el dueño comparta cómo es ese primer día, no se puede ver sin cuenta |

---

## Lo que ellos hacen mejor, y por qué

1. **Los esquemas visuales por subtema.** No es una infografía por tema (45
   piezas), es una por cada subtema dentro del tema — en "El Derecho" había
   más de 20 solo ahí. Cada una tiene diseño propio, con la marca de
   OpositandoPN, y se puede descargar. Es trabajo de diseño gráfico
   acumulado durante tiempo, no una función que se "activa": por eso no es
   algo que se iguale con una tarde de código.
2. **Los exámenes oficiales completos, y más años.** Trece convocatorias
   (2014 a 2026) que el alumno puede hacer literalmente, con cronómetro y
   nota, no solo cinco usadas como dato interno. Es contenido que ya existe
   en abierto (regla 72: nosotros ya sabemos de dónde sacarlo sin pagar a
   una academia rival), así que ampliar esto es barato si se quiere.
3. **El registro físico sigue las pruebas oficiales tal cual se llaman**
   (circuito de agilidad, suspensión en barra, carrera), con una pantalla
   de progreso dedicada (mejor marca de cada una, puntuación media por
   baremo). Es simple pero claro.

## Lo que nosotros hacemos y ellos no

- **El motor adaptativo** (P10-P10v2, reglas 55-56-60-73): cajones por
  alumno, curva de olvido personal, programación visible («te toca porque…»),
  distractor fijo detectado. Su "Progreso" son cuatro números; el nuestro es
  un sistema que decide qué preguntar.
- **Exámenes en papel y en clase** (reglas 115 y 118): generar, imprimir,
  poner a un turno y llevar la nota de un examen presencial. Ellos no tienen
  nada parecido a gestionar clase física.
- **El informe semanal de abandono** (regla 116): quién lleva dos semanas sin
  entrar, quién entra pero no contesta nada. Ellos no gestionan una academia,
  gestionan un alumno suelto.
- **Dificultad visible y corregible por el preparador** (reglas 121-122), con
  medida real contra respuestas y sin inventar un «2» por defecto.
- **"Repasar fallos" por prioridad**, no una lista plana (regla 62).
- **La gestión de la academia entera**: grupos, profesores, pagos, asistencia,
  psicotécnicos propios generados por código. OpositandoPN es una app para un
  opositor suelto; Campus Alphapol es la plataforma de la academia.

---

## Recomendaciones, de menor a mayor coste/riesgo

**A. Calculadora de nota como herramienta aparte.**
Coste: muy bajo (reutilizar `CNP_SCORING`/`scoreExam`, regla 22, en un widget
nuevo). Riesgo: nulo, no toca el motor del examen. Encajaría en «Mi perfil».

**B. Un «guardar para luego» genérico, aparte de las notas.**
Coste: bajo (una tabla ligera tipo `question_notes` pero sin texto, solo
marcador; o reutilizar la misma tabla con una columna booleana). Riesgo: bajo.
Prioridad baja: «Repasar fallos» por prioridad ya cubre lo urgente; esto es
comodidad, no necesidad.

**C. Ampliar los exámenes oficiales indexados más allá de 2021-2025.**
Coste: bajo (el guion `scripts/operacion/indexar-examenes-oficiales.mjs` ya
existe, regla 72; solo hace falta localizar los PDF de más años). Riesgo:
bajo, con la misma salvaguarda de la regla 78 (nunca se usan como fuente de
generación, solo como dato o, si se decide, como examen de práctica literal).
Si además se quiere que el alumno los HAGA tal cual (no solo que alimenten el
peso real), eso es una pantalla nueva — más coste, decisión aparte.

**D. Esquemas visuales, pero en piloto, no en los 45 temas.**
Coste: medio-alto si se hace a mano (diseño gráfico real); más bajo si se
genera con IA y se revisa, pero entonces compite con el mismo problema de
calidad que ya tuvimos con preguntas generadas (regla 10: nada vale sin
comprobarse). Riesgo: bajo en código, alto en mantenimiento (una ley que
cambia obliga a rehacer el esquema). Recomendación: si se quiere probar, un
piloto de 5-10 subtemas de los temas con más peso real del examen
(`PESO_EXAMEN_REAL`, regla 73), no un proyecto de los 45 temas de golpe.

**E. Inglés (B1): decisión del dueño antes que código.**
No es una llamada técnica. Si la convocatoria vigente de Alphapol exige
acreditar B1 de inglés como prueba del proceso, es un hueco de contenido
real; si no, construirlo sería justo lo que la premisa prohíbe («nada nuevo
sin afianzar lo que hay»). Coste si se decide que sí: alto (banco de
preguntas de idioma, un tipo de pregunta distinto —comprensión de texto largo,
no opción múltiple simple de una línea—, posiblemente corrección gramatical).
Riesgo: medio. **Antes de nada: preguntarle al dueño si esa prueba forma
parte de lo que preparan en Alphapol.**

**F. Simulacro a medias recuperable entre dispositivos.**
Coste: medio (pasar de `localStorage` a una tabla con Server Action, regla
37). Riesgo: bajo. Prioridad baja: no hay ninguna señal hoy de que los
alumnos cambien de dispositivo a mitad de un simulacro; antes de construirlo
convendría preguntar si es un problema real o una comodidad teórica.

---

## Lo que NO copiaría, y por qué

- **Gemas, puntos, "reto personal" con racha y escudo, duelos 1 contra 1.**
  Ya decidido en la regla 85 («la app habla como Alphapol, no como un
  videojuego de policías») y reafirmado en la 120. Esta vuelta solo confirma
  los mecanismos exactos: un contador de racha con "escudos" anti-fallo, y
  duelos de 10 preguntas por puntos. Nada de esto encaja con el tono de
  academia.
- **El ranking, en cualquier simulacro, no solo el competitivo.** Sorprendió
  que hasta los simulacros "esenciales" normales llevan su propio top 5. Es
  más agresivo de lo que parecía en la primera revisión (regla 120 solo había
  visto el ranking nacional mensual). Sigue siendo mala idea: expone con nota
  baja a quien menos lo necesita ver.
- **El análisis de progreso con IA agregado.** Existe solo para físicas, y
  solo si hay datos esa semana — es decir, ni ellos lo tienen resuelto del
  todo. Construir el equivalente para teoría sería pagar Gemini por un
  resumen que el propio "Mi Evolución" ya da sin coste de IA.
- **Los planes de físicas genéricos iguales para todos.** El texto de
  "Potencia aeróbica" es el mismo para cualquier alumno, variando solo el
  ritmo por kilómetro que el alumno introduce a mano. Ya tenemos algo mejor:
  un preparador real que escribe el plan, o el motor adaptativo por grupo
  (reglas 48 y 86). Retroceder a un texto estático sería peor que lo que hay.

---

## Lo que queda sin ver

- **Onboarding, "Mi cuenta" y "Ajustes".** Viven en `www.opositandopn.com`
  (dominio distinto de la app, `app.opositandopn.com`), piden iniciar sesión
  aparte, y no se debía ni crear una cuenta nueva ni usar credenciales que no
  fueran las ya abiertas en el navegador. Si interesa ver el primer día de un
  alumno nuevo, hace falta que alguien de la academia lo enseñe con su propia
  sesión.
- **El banco de preguntas propio**, por instrucción explícita: solo se
  anotó el estilo (ver los dos ejemplos de arriba: psicotécnicos con
  subtemas, inglés con comprensión de texto), nunca su contenido.

---

## Segunda ronda (12 nov 2026)

Con la sesión de la cuenta de Alphapol en la app y, esta vez, con sesión propia en el dominio de cuenta
y ajustes (`www.opositandopn.com`). Solo lectura: no se ha pagado nada, no se
ha cambiado ningún ajuste, no se ha entregado ningún simulacro y no se ha
extraído ni su banco de preguntas ni sus esquemas (solo título y recuento).

### 1 · Puntuación — la fórmula es LA MISMA, verificada con números reales

Abierta la «Calculadora de nota» del menú (icono de calculadora, visible en
cualquier pantalla). Dice la fórmula tal cual:

> `[ A - E / (n - 1) ] * 10 / P`, siendo «A» el número de aciertos, «E» el de
> errores, «n» el número de alternativas de respuesta y «P» el número total
> de preguntas.

**Es exactamente la fórmula de la regla 22** (`app/lib/scoring.ts`,
`CNP_SCORING`): `[A − E/(n−1)] × 10/P`. Probado con los mismos números que ya
usa nuestra documentación como ejemplo (60 aciertos, 40 errores, 100
preguntas, 3 alternativas): la calculadora de OpositandoPN da **4** — el
mismo resultado que dice la regla 22 («60 aciertos y 40 fallos… la nota real
es un 4»). Con 4 alternativas en vez de 3, la misma situación da **4,67**
(penalización más suave, como manda la fórmula: `E/(n−1)` con `n=4` resta
menos que con `n=3`). **No hay discrepancia que señalar**: las dos
plataformas calculan la nota del simulacro de teoría exactamente igual,
porque las dos la sacan de la misma convocatoria oficial (BOE-A-2026-15055).

Lo que sí añade OpositandoPN y nosotros no: en el simulacro de teoría el
desplegable solo deja 3 alternativas (igual que el examen real); en
psicotécnicos e inglés, por defecto usan 4. Y en cada tarjeta de Inicio
enseñan, junto a la nota media del alumno, una **«nota de corte»** de
referencia (p. ej. 6,75 en el competitivo de noviembre) — no es parte de la
fórmula, es un dato de contexto que nosotros no mostramos en ningún sitio.

**Corrección tras revisar un resultado real (verificación pedida aparte,
12 nov 2026).** En toda la cuenta de Alphapol solo hay **un** simulacro
terminado — ni en teoría hay un segundo, ni en psicotécnicos ni en inglés
hay ninguno («No tienes simulacros completados» en los tres). Es el mismo
que ya se había visto por captura: «Simulacro autogenerado», 15 preguntas,
3 alternativas, **4 aciertos y 11 fallos** (contado celda a celda en la
cuadrícula: verdes 4, 9, 11 y 12; el resto, rojas; ningún blanco). La
pantalla muestra «Aciertos 26,7 %», **«Penalización −3,67 PTS»** y una nota
de **0** en el círculo grande.

A primera vista, 3,67 PTS entre 11 fallos sale a 0,333 por fallo — un
tercio, no un medio, y con 3 alternativas (`n−1 = 2`) la regla 22 diría que
cada fallo resta **medio acierto**, no un tercio. **Pero no es una fórmula
distinta: es la misma, con la aritmética hecha entera y no solo mirando el
cociente final.**

```
nota = [A − E/(n−1)] × 10/P
     = [4 − 11/2] × 10/15
     = [4 − 5,5] × 0,667
     = −1,5 × 0,667
     = −1,00   → se enseña como 0 (no deja bajar de 0)

penalización (lo que se resta, ya en la escala de 0 a 10)
     = E/(n−1) × 10/P
     = 5,5 × 0,667
     = 3,67   ← exactamente lo que enseña la pantalla
```

Comprobado con aritmética exacta (no con una llamada a su API, solo
multiplicar y dividir los números que ya enseña la pantalla): con
`E/(n−1)` sale 3,67 y nota −1 (mostrada como 0); con `E/n` saldría 2,44 y
nota 0,22 — y la pantalla no enseña ni 2,44 ni 0,22. **Usan `E/(n−1)`, la
misma fórmula que la calculadora y que la regla 22.** El «tercio» que se ve
al dividir 3,67 entre 11 es un efecto de este examen en concreto
(`10 / ((n−1) × P) = 10/(2×15) = 1/3`): con 15 preguntas y 3 alternativas,
el tercio sale solo, sin que la fórmula interna cambie. En el examen oficial
de 100 preguntas ese mismo cálculo da `10/(2×100) = 0,05` — el «cada dos
fallos se pierde un acierto» de siempre.

**Lo que no se pudo comprobar, por no existir**: un segundo simulacro
terminado de otro tamaño, o uno «esencial», para confirmar que la fórmula
se mantiene igual con otro `P`. No lo hay en esta cuenta — ni en teoría, ni
en psicotécnicos, ni en inglés —, y no se ha completado ninguno nuevo para
no generar un dato que no es real. Con un solo caso real no se puede probar
que la fórmula sea *siempre* la misma en las tres pantallas (calculadora,
simulacro de teoría, simulacro de psicotécnicos/inglés), pero el único dato
real que hay **no discrepa** de la fórmula de la calculadora ni de la
nuestra — coincide al céntimo.

### 2 · Mapa del temario — 671 esquemas en 45 temas, y dónde flojeamos los dos

OpositandoPN llama «Esquemas» a una infografía de diseño por cada subtema
(no por tema). Se contaron las 45 secciones del acordeón de verdad, una por
una, con un script para no fiarme de contar a ojo: **671 esquemas en total**.
**No muestran cuántas preguntas tiene cada tema ni cada subtema** en ningún
sitio accesible al alumno (ni en el selector de temas del simulacro, ni en
los esquemas): se preguntó explícitamente por este dato y no existe.

La tabla cruza sus esquemas con nuestros propios números
(`docs/dificultad/hechos-por-tema.json`, el mismo inventario que ya usa la
regla 78 para decidir dónde crece el banco):

| # | Tema (nuestro título) | Esquemas OpositandoPN | Nuestras preguntas | Nuestros hechos distintos | Nota |
|---|---|---|---|---|---|
| 1 | El Derecho | 23 | 167 | 96 | |
| 2 | La Constitución (I) | 25 | 40 | 39 | |
| 3 | La Constitución (II) | 38 | 566 | 301 | |
| 4 | La Unión Europea | 37 | 77 | 25 | |
| 5 | AGE. El Gobierno | 27 | 55 | 48 | |
| 6 | Funcionarios públicos | 17 | 100 | 61 | |
| 7 | Ministerio del Interior | 11 | 55 | 49 | |
| 8 | La Dirección General de la Policía | 40 | 495 | 321 | |
| 9 | LO 2/1986, FCS | 16 | 55 | 48 | |
| 10 | Extranjería (I) | 38 | 168 | 132 | |
| 11 | Extranjería (II), infracciones | 12 | 40 | 36 | |
| 12 | Protección internacional | 19 | 55 | 54 | |
| 13 | Seguridad Privada | 20 | 55 | 51 | |
| 14 | LO 4/2015, seguridad ciudadana | 14 | 272 | 164 | |
| 15 | Infraestructuras críticas | 10 | 55 | 35 | |
| 16 | Derecho Penal, parte general | 45 | 438 | 326 | |
| 17 | D. Penal especial (I): homicidio, lesiones, libertad sexual | **0** | 201 | 151 | **Hueco suyo**: su tema "Derecho Penal especial" no tiene NI UN esquema, siendo de los más pesados del examen real |
| 18 | D. Penal especial (II): patrimonio | 9 | 55 | 49 | |
| 19 | Delitos orden público / armas | 2 | 55 | 41 | |
| 20 | Delitos informáticos | 10 | 55 | 50 | |
| 21 | Derecho Procesal Penal | 28 | 441 | 318 | |
| 22 | Estatuto de la víctima del delito | **0** | 55 | 51 | **Hueco suyo**: tampoco tiene esquemas |
| 23 | Igualdad / violencia de género | 29 | 55 | 53 | |
| 24 | PRL (I), conceptos básicos | 5 | 40 | 19 | Flojo en los dos |
| 25 | PRL (II), marco normativo | 8 | 40 | 40 | |
| 26 | Protección de datos | 12 | 55 | 50 | |
| 27 | Derechos Humanos | 15 | 55 | 53 | |
| 28 | Globalización y antiglobalización | 7 | 40 | 18 | Flojo en los dos |
| 29 | Actitudes y valores sociales | 15 | 55 | 19 | Flojo nuestro, no tanto el suyo |
| 30 | Principios éticos de la sociedad actual | 9 | 40 | 19 | Flojo en los dos |
| 31 | Inmigración | 5 | 40 | **7** | **El más flojo de los dos**: nuestro tema con menos hechos distintos de todo el banco, y uno de los suyos con menos esquemas |
| 32 | Geografía humana | 7 | 40 | 14 | Flojo en los dos |
| 33 | La seguridad (criminología) | 12 | 40 | 16 | Flojo nuestro |
| 34 | Drogodependencias | 12 | 40 | 22 | |
| 35 | El desarrollo sostenible | 15 | 55 | 30 | |
| 36 | Gramática de la lengua española | 3 | 39 | 20 | |
| 37 | Ortografía de la lengua española | 1 | 39 | 22 | Es el tema con MENOS esquemas de los 45 (solo uno: «Palabras con B y V») |
| 38 | Fundamentos de sistemas operativos | 3 | 40 | 27 | |
| 39 | Redes informáticas | 9 | 39 | 12 | Flojo en los dos |
| 40 | Inteligencia | 9 | 55 | 25 | |
| 41 | Ciberdelincuencia | 17 | 80 | 43 | |
| 42 | Armas de fuego | 17 | 55 | 53 | |
| 43 | Vehículo prioritario | 8 | 40 | 23 | |
| 44 | Seguridad en la conducción | 7 | 40 | 23 | |
| 45 | PRL en seguridad vial | 5 | 40 | 10 | Flojo en los dos |

**Dónde somos más flojos — y no es solo nuestro.** Los temas con menos
«hechos distintos» en nuestro banco (regla 78: 24, 28, 29, 30, 31, 32, 33, 39,
45 — toda la zona de Ciencias Sociales y algo de Materias técnicas) son
**también** los que menos esquemas tienen en OpositandoPN. No es casualidad:
son los 20 temas de nuestro `docs/TEMARIO.md` que **no tienen una norma
detrás** — doctrina sin BOE que citar, así que ni su equipo de contenido ni
el nuestro tienen de dónde sacar material con la misma facilidad que de un
código articulado. El tema 31 (Inmigración) es el caso más claro: es nuestro
tema con menos hechos distintos de los 45 (solo 7) y, a la vez, uno de los
que menos esquemas tiene en OpositandoPN (5, empatado con el segundo puesto
más bajo). **Si se decide reforzar algo, aquí el esfuerzo no compite contra
nadie que ya lo tenga resuelto.**

**Dos huecos que son solo suyos, y pesan mucho en el examen real:** "Derecho
Penal especial" (nuestro tema 17: homicidio, lesiones, libertad sexual —
201 preguntas y 151 hechos distintos en nuestro banco, de los más pesados)
y "Estatuto de la víctima del delito" (tema 22) no tienen ni un esquema en
OpositandoPN, a pesar de que sí tienen simulacro y preguntas sueltas. No es
un hueco pequeño ni casual: es justo lo contrario del patrón de arriba — un
tema con mucho peso real que, por lo que sea, se quedó sin su material
visual.

### 3 · Normativa — 31 de los 45 temas tienen lista propia de leyes (BOE)

«Normativa» es una lista de enlaces externos al BOE/boe.es, por tema —
ninguna la normativa en sí sale de la plataforma, solo el enlace y el
nombre. Comprobado uno a uno (aquí sí hubo que insistir: varios temas que un
primer repaso rápido daba por vacíos tenían la lista oculta detrás de una
reapertura más lenta del acordeón). **31 de los 45 temas tienen lista propia**
(el 32.º, «La Constitución (I)», comparte la de «El Derecho»); los 13
restantes —9 de Ciencias Sociales y 4 de Materias técnico-científicas— no
enlazan ninguna. Son una parte de los 20 temas «sin norma detrás» de nuestro
propio `docs/TEMARIO.md`.

Lista completa, agrupada por tema (nombre de la ley, sin repetir aquí el
contenido de la norma, que es público):

- **El Derecho**: Código Civil (RD 24/07/1889), Constitución Española, Ley
  12/2015 (sefardíes), Ley 20/2011 (Registro Civil), Ley 20/2022 (Memoria
  Democrática).
- **La Constitución (I)**: sin lista propia — la Constitución ya está en «El
  Derecho»; **La Constitución (II)**: Constitución Española, LO 6/1985
  (Poder Judicial), LO 2/1979 (Tribunal Constitucional), LO 3/1980 (Consejo
  de Estado), Reglamento del Congreso, Reglamento del Senado.
- **La Unión Europea**: LO 9/2021 (Fiscalía Europea), Reglamento UE
  2017/1939, TUE y TFUE.
- **AGE**: Ley 40/2015, RD 890/2023, Ley 50/1997 (Gobierno).
- **Funcionarios públicos**: RDL 5/2015 (EBEP), RD 364/1995, RD 365/1995.
- **Ministerio del Interior**: RD 207/2024, RD 1009/2023, RD 829/2023.
- **DGP**: Orden INT/859/2023, LO 9/2015 (régimen personal PN), LO 4/2010
  (régimen disciplinario CNP), Orden INT/430/2014 (uniformidad).
- **LO 2/1986, FCS**: LO 2/1986, RD 769/1987 (Policía Judicial).
- **Extranjería**: LO 4/2000, RD 240/2007, RD 1155/2024; **Infracciones de
  extranjería**: LO 4/2000, RD 1155/2024.
- **Protección internacional**: Ley 12/2009, RD 865/2001, RD 220/2022, RD
  1325/2003, Orden ISM/922/2023.
- **Seguridad Privada**: Ley 5/2014, RD 2364/1994, Orden INT/317/2011.
- **LO 4/2015, seguridad ciudadana**: LO 4/2015, RD 1154/2024, RD 255/2025.
- **Infraestructuras críticas**: Ley 8/2011, RD 704/2011, Orden
  PCI/487/2019, RDL 12/2018.
- **Derecho Penal parte general**: LO 10/1995 (Código Penal); **D. Penal
  especial**: LO 10/1995, LO 10/2022 (libertad sexual); **Delitos
  patrimonio**: LO 10/1995; **Delitos orden público**: LO 10/1995;
  **Delitos informáticos**: LO 10/1995, LO 4/1997 (videocámaras FCS), LO
  1/1982 (honor e intimidad), LECrim (RD 14/09/1882).
- **Derecho Procesal Penal**: LO 6/1985, LECrim, LO 6/1984 (Habeas Corpus),
  LO 5/1995 (Tribunal del Jurado), Ley 50/1981 (Estatuto Ministerio Fiscal).
- **Estatuto de la víctima**: Ley 4/2015, RD 1109/2015.
- **Violencia de género / igualdad**: LO 1/2004, LO 3/2007, ISES 4/2019, RD
  752/2022, Ley 4/2023, LO 10/2022, Ley 39/2006, Ley 15/2022 (ocho normas,
  la lista más larga de toda la plataforma).
- **PRL (I)**: Ley 31/1995, RD 39/1997, Directiva 1989/391/CEE; **PRL (II)**:
  RD 2/2006 (PRL Policía), Ley 31/1995, RD 67/2010, RDL 8/2015.
- **Protección de datos**: LO 3/2018, LO 7/2021, RD 389/2021.
- **Derechos Humanos**: Convenio Europeo DDHH, Carta de Derechos
  Fundamentales UE, Pacto Internacional Civiles y Políticos, Pacto
  Internacional Económicos/Sociales, Convención contra la Tortura.
- **Principios éticos**: ISES 5/2022 (Plan de Acción contra Delitos de
  Odio) — único tema de Ciencias Sociales con una norma enlazada.
- **Armas de fuego**: RD 137/1993 (Reglamento de Armas).
- **Vehículo prioritario**: RD 1428/2003, RD 818/2009.
- **Seguridad en la conducción**: RD 2822/1998, Orden INT/2573/2015.
- **PRL en seguridad vial**: RDL 6/2015, RDL 8/2015.

Sin ninguna norma enlazada: Globalización, Actitudes y valores, Inmigración,
Geografía humana, La seguridad, Drogodependencias, Desarrollo sostenible,
Gramática, Ortografía (9 de Ciencias Sociales), y Fundamentos de sistemas operativos, Redes
informáticas, Inteligencia, Ciberdelincuencia (4 de Materias
técnico-científicas).

### 4 · Físicas — mismo dato que el baremo oficial, planes de un solo nivel

**Ajustes de la cuenta** confirma algo que no se veía desde dentro del
módulo de físicas: el **género** del alumno es un campo de cuenta aparte
("Tu género se utiliza para calcular la puntuación de las pruebas físicas
según los baremos oficiales"), y el registro diario lo usa en silencio —
por eso el ejercicio de barra se llama "suspensión" para un perfil y
"dominadas" para otro, sin que el alumno elija nada en esa pantalla.

**Registro diario**: tres categorías, calcadas de las pruebas oficiales del
CNP (circuito de agilidad con tiempo en segundos/centésimas; fuerza =
suspensión en barra o dominadas, también por tiempo; carrera con distancia,
tiempo y ritmo). Cada intento se guarda con una columna **Puntos** — el
baremo se calcula al introducir una marca real; no se encontró ninguna
tabla de baremo visible sin introducir un dato (y no se introdujo ninguno,
para no dejar un intento falso en su base de datos).

**Progreso**: cuatro KPIs (mejor tiempo de circuito, mejor tiempo de
suspensión/dominadas, mejor ritmo de carrera, puntuación media) más una
gráfica por ejercicio, filtrable por rango de fechas.

**Planes de entrenamiento**: tres niveles fijos por dificultad (Agilidad
fácil, Estabilidad media, Potencia aeróbica difícil), y cada uno es **una
sola sesión de texto genérica**, no una progresión semanal: calentamiento,
bloque de carrera con ritmos relativos al "Ritmo MIL" del alumno, circuito
de fuerza, y el ejercicio de barra ya diferenciado por género. **No hay
semana 1 / semana 2, ni manera de decir "llevo dos semanas sin entrenar" o
"esto me costó mucho"**: es la misma plantilla siempre. Y lo dice la propia
plataforma con un aviso: *"Estos entrenamientos son de carácter general y
pueden no adaptarse a tus necesidades. Consulta con tu entrenador o
profesional cualificado para asegurarte de que son adecuados para ti."* —
exactamente el hueco que cubre un preparador real (regla 48) o el motor
adaptativo por grupo (P9) que ya tenemos. **No se copian sus planes**: no
hay nada que copiar, es un texto fijo por dificultad, y lo nuestro —ligado
a un plan real o a un % de RM del propio alumno— ya resuelve lo que ellos
delegan expresamente a "tu entrenador".

### 5 · Ritmo — preguntas y minutos por tipo de simulacro

| Simulacro | Preguntas | Minutos | Alternativas | Origen del dato |
|---|---|---|---|---|
| Teoría, oficial/competitivo | 100 | 50 | 3 | Dicho explícitamente en la pantalla de configuración: *"La duración y el número de preguntas oficial es de 100 preguntas a responder en un máximo de 50 minutos"* — coincide con `CNP_SCORING.secondsPerQuestion` (30 s × 100 = 50 min, regla 25) |
| Teoría, "esencial" (ej. Principios básicos de actuación) | 25 | 15 | 3 | Visto en la tarjeta de Inicio |
| Psicotécnicos, "esencial" (Ómnibus) | 39 | 19 | 4 (por defecto) | Visto en la tarjeta de Inicio |
| Teoría / Psicotécnicos / Inglés, a medida | 15 / 25 / 50 (100 solo en teoría) | No se mostró un tiempo fijo en la pantalla de configuración antes de empezar | configurable | `Preguntas sueltas` y `Simulacro` del menú de cada materia |

El ritmo de teoría (≈0,5-0,6 min/pregunta) es casi idéntico al oficial (0,5
min/pregunta exacto). El de psicotécnicos "esencial" sale a ≈0,49
min/pregunta — más ajustado, coherente con preguntas más cortas
(razonamiento, no texto legal). **No se pudo comprobar el tiempo exacto de
un examen oficial de psicotécnicos o de inglés** sin empezarlo de verdad,
así que ese dato concreto queda "no visto".

### 6 · Academia — control de acceso por licencias, no un panel pedagógico

La cuenta de Alphapol ve exactamente lo mismo que un alumno (mismo menú,
mismo "Inicio"): **no hay ninguna vista de profesor o de academia dentro
de la app** (`app.opositandopn.com`). Lo que existe vive en la web pública
(`www.opositandopn.com/academias`), es un producto de pago aparte
("OpositandoPN + Academias") y, por lo que enseña esa página de marketing
(no se entró al panel real, que pide contratarlo):

- **Gestiona licencias, no progreso.** Una tabla de "Alumnos" con usuario,
  nombre y estado (**Activo** / **Inactivo**) — alta y baja de acceso a la
  plataforma, facturado "según el número de licencias activas". Es un
  interruptor de acceso por alumno, parecido a nuestro `memberships`
  (regla 52), no un cuadro de mando de cómo le va a cada uno.
- **No se menciona nada de progreso agregado, grupos, ni exportar a CSV**
  en toda la página. Ni una palabra sobre ver qué temas falla un alumno, ni
  comparar resultados, ni descargar nada.
- **"Mi cuenta" confirma el modelo de pago**: la cuenta de Alphapol muestra
  una "Suscripción de prueba" (7 días, 1-8 octubre 2025) y, después, una
  "Suscripción Premium activa — **asociada a tu academia**, Academia
  asignada: Alphapol" (desde el 6 de octubre de 2025). El alumno no paga
  directamente: la academia paga un paquete de licencias y cada alumno
  queda marcado como Activo/Inactivo dentro de ese paquete.

**Conclusión para decidir con el dueño:** OpositandoPN no tiene nada
parecido a nuestro panel de "Alumnos" (lista por urgencia, ficha con
cajones del motor adaptativo, informe semanal de abandono, regla 35/116).
Lo suyo es pago y acceso; lo nuestro ya es gestión pedagógica de academia.
No hay nada que echar en falta aquí, salvo si Alphapol quisiera vender
acceso a OpositandoPN como complemento con el mismo modelo de licencias por
volumen — eso es una decisión comercial, no una carencia de nuestra
plataforma.

### 7 · Cuenta, ajustes, onboarding y notificaciones

**Ajustes de la cuenta** (`www.opositandopn.com/mi-cuenta/ajustes`): imagen
de perfil, nombre de usuario, nombre y apellidos, **género** (usado para el
baremo físico, ver §4), **academia** (campo de texto/selector con una
marca verde de verificado — "Alphapol" ya aparece verificado en esta
cuenta), y un bloque **Notificaciones** con solo dos interruptores: "Recibir
notificaciones por email" y "Recibir notificaciones push", **los dos
apagados por defecto**. No hay ninguna opción de frecuencia ("cada cuánto"
avisan) ni de qué tipo de evento avisa cada canal — es un interruptor
binario por canal, nada más granular.

**Mi cuenta**: identificador de cuenta, método de autenticación (email),
correo verificado, fecha de registro y última conexión, botón de cerrar
sesión, y un bloque de "Eliminar cuenta" con aviso de que es irreversible.

**Onboarding**: **no se pudo ver**. Observarlo de verdad exigiría crear una
cuenta nueva desde cero, y la tarea lo prohibía explícitamente. Lo único
indirecto: la cuenta de Alphapol tuvo una "suscripción de prueba" de 7 días
antes de pasar a Premium (ver §6), así que existe al menos un periodo de
prueba antes de necesitar que la academia la active.

**Lo que sigue sin verse**: el contenido exacto de un email o notificación
push (no se activó ninguno de los dos interruptores), y el panel real de
"OpositandoPN + Academias" (pide contratar el producto; solo se vio su
página de marketing).

---

## Revisión de ingeniería (12 nov 2026)

Añadida al integrar el documento en el repo. Lo de arriba es el trabajo de la
sesión que revisó OpositandoPN; esto es lo que se comprobó contra nuestro código
y datos, y lo que se corrigió.

**Comprobado y correcto**
- La tabla de los 45 temas coincide con `docs/dificultad/hechos-por-tema.json`
  fila a fila (suman 4.617 preguntas).
- **Puntuación: la fórmula es la misma que la nuestra** (regla 22). Una captura
  parecía mostrar «un tercio por fallo»; era un error de lectura: «−3,67 PTS» son
  puntos sobre 10, no aciertos, y 10 / (2 × 15) = ⅓ de punto por fallo en un
  examen de 15 preguntas. Cerrado.
- Las referencias a las reglas 37 (el simulacro a medias vive en `localStorage`),
  73 (el feedback explica también las opciones incorrectas) y 62 (repasar fallos
  por prioridad) son correctas.

**Corregido en este documento**
- «36 de los 45 temas» con normativa no cuadraba con su propia lista: son 31 con
  lista propia (32 contando «La Constitución (I)», que comparte) y 13 sin ninguna.
- La referencia de la calculadora apuntaba a la recomendación C; es la A.
- Se quitó el correo personal de la cuenta de la academia y su nombre de usuario:
  no hacen falta y es un dato de una persona.
- «Atenea» pasa a «Campus Alphapol» (regla 81).

**Decisiones tomadas**
- **Los 13 exámenes oficiales (recomendación C): se dejan.** No se persigue ahora.
- **Esquemas visuales (D) e Inglés (E):** pendientes de decisión del dueño; no se
  construye nada.
- **La calculadora de nota (A)** y el «guardar para luego» (B) quedan como ideas
  baratas, sin fecha: la premisa sigue siendo afianzar antes de abrir nada nuevo.

**Con cautela**
- La afirmación de que los temas flojos de los dos bancos son «los 20 sin norma» es
  aproximada: el tema 24 (PRL I) y el 30 tienen norma o apuntes mixtos. Lo que sí
  se sostiene es que el tema 31 (Inmigración, 7 hechos distintos) es el más flojo
  de nuestro banco.
- Del onboarding y del panel real de «OpositandoPN + Academias» no hay nada visto.

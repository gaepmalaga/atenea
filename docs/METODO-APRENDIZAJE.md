# El método de aprendizaje de Atenea

> Investigación de base para el **entrenamiento adaptativo** (P10). Aquí está el
> *qué* y el *por qué*; el diseño técnico está en
> [`P10-entrenamiento-adaptativo.md`](P10-entrenamiento-adaptativo.md).

## El examen que optimizamos

Escala Básica del CNP: **100 preguntas, 3 opciones, penalización**
(`[A − E/(n−1)] × 10/P` — cada 2 fallos, −1 acierto), **50 minutos**, temario
**cerrado y finito** (45 temas), contenido muy memorístico (artículos, números,
plazos, órganos, competencias), preparación de **12–24 meses**.

Hay que ganar en tres frentes a la vez:

1. **Retención a largo plazo** — lo estudiado hace 8 meses tiene que seguir ahí.
2. **Velocidad** — 30 s por pregunta. Recuperar despacio es fallar.
3. **Calibración** — con penalización, *saber cuándo no lo sabes* (y dejar en
   blanco) es una habilidad medible.

## Las técnicas, por solidez de la evidencia

### 1. Práctica de recuperación (efecto test) — la base, ya la tenemos

Hacerte preguntas retiene mucho más que releer. Meta-análisis: **g ≈ 0,50–0,61**
frente a releer; con opción múltiple **g ≈ 0,70**. Que la plataforma sea "test
primero" ya es correcto. Lo que falta es **cómo se eligen** las preguntas.

### 2. Repetición espaciada — la pieza que falta

Espaciar los repasos bate a amontonarlos, efecto grande y muy replicado (estudio
2025 con 26.000 médicos: 58 % vs 43 % de retención). Hoy Atenea la usa **solo en
las fichas**, no en las preguntas de test.

- **Leitner** (cajas fijas): simple, explicable, sin cálculo.
- **FSRS** (Anki moderno, 500 M de repasos): 20–30 % menos repasos para la misma
  retención, porque predice la probabilidad de recuerdo de cada ítem.
- **Decisión:** v1 con cajas tipo Leitner **por pregunta y por alumno**, rápido
  de montar y de explicar. Se guardan los datos (aciertos, fechas, tiempos) para
  poder pasar a FSRS más adelante sin migración.

### 3. Los "cajones" por alumno

Banco común, pero cada alumno con su estado por pregunta. Seis cajones:

| Cajón | Qué es |
|---|---|
| **Nueva** | No la ha visto (o solo la ha dejado en blanco) |
| **Recaída** (caja 1) | Falló en el último intento |
| **En aprendizaje** (cajas 2–3) | Acierta, intervalo aún corto |
| **Consolidando** (caja 4) | Intervalo creciendo |
| **Dominada** (caja 5) | Acierta rápido y sin dudar, intervalo largo |
| **Atascada** | Fallada 4+ veces — necesita otra intervención, no más repeticiones |

### 4. La dificultad objetivo: la regla del 85 %

Wilson (2019, *Nature Communications*): el ritmo de aprendizaje se **maximiza
cuando aciertas ~85 %** durante la práctica. Anki usa 90 % de retención objetivo;
el umbral de dominio de Bloom es ~90 %.

**Implica:** una sesión generada debe quedar calibrada para que el alumno
**acierte entre el 80 y el 90 %**. Todo dominado → no aprende. Todo fallado → se
quema y es ineficiente. Esto fija las cuotas de cada cajón.

### 5. Intercalar temas (interleaving), no bloques

Intercalar ayuda a **discriminar entre ítems parecidos** — justo el problema del
temario CNP (plazos, órganos, competencias de temas distintos se confunden). La
evidencia es sólida para discriminación; para texto puramente factual el efecto
es más pequeño, así que va como capa que **medimos**.

**Matiz:** al aprender un tema **nuevo**, primero algo de práctica en bloque, y
después entra a la mezcla.

### 6. Feedback elaborado inmediato — ya lo tenemos

Corrección al momento + cita del artículo. Imprescindible en opción múltiple para
que la respuesta equivocada no se consolide. El retardo que aporta valor lo da el
**reencuentro espaciado** de la pregunta, no un feedback tardío.

### 7. Taxonomía del error + metacognición — la tenemos, infrautilizada

Los 4 diagnósticos (olvido / laguna / trampa / lectura) pueden **dirigir a qué
cajón vuelve** la pregunta:

- **Laguna** → "en aprendizaje" (no lo sabía).
- **Lectura** → no se reinicia del todo; aviso de "lee dos veces el enunciado".
- **Trampa** → marca la *familia* de esa pregunta para intercalarla más.
- **Olvido** → repaso espaciado normal.

### 8. Marca de confianza / entrenar el blanco — NO existe, diferenciador

Con penalización, "saber cuándo no lo sabes" es entrenable y medible. La marca de
confianza mejora la conciencia metacognitiva y **corrige la sobreconfianza** de
los alumnos más flojos.

**Implica (v2):** opción de marcar confianza; se mide la calibración; en
resultados: *"contestaste a ciegas 12, acertaste 4 — a −0,5 eso te costó 4
puntos netos; en blanco habrías puntuado más"*.

### 9. Velocidad / fluidez

El examen son 30 s/pregunta. "Dominada" no es solo acertar: es acertar **rápido y
sin cambiar de opción** (el índice de incertidumbre que ya medimos). Hasta
entonces sigue en "consolidando".

### 10. Preguntas atascadas ("leech")

Una fallada 4+ veces no se arregla con más repeticiones: ficha, artículo, nota, o
aviso al profesor.

## Qué es roca sólida y qué es capa

- **Roca:** recuperación + espaciado + dificultad al 85 %. Eso primero.
- **Capa (se mide):** intercalado, marca de confianza, criterio de velocidad,
  taxonomía dirigiendo cajones.

## La dependencia que hay que decir en voz alta

El valor de esto está **topado por el tamaño del banco**. La repetición espaciada
y el intercalado brillan con muchas preguntas por tema. Un banco fino hace que un
alumno agote un tema y el sistema caiga a aleatorio. El motor adaptativo y un
empujón de siembra van juntos.

## Fuentes

- Wilson et al. (2019), *The Eighty Five Percent Rule for optimal learning*, Nature Communications — https://www.nature.com/articles/s41467-019-12552-4
- Adesope et al. (2017), *Rethinking the Use of Tests: A Meta-Analysis of Practice Testing* — https://journals.sagepub.com/doi/10.3102/0034654316689306
- Cepeda et al., *A Meta-Analytic Review of the Benefit of Spacing* — http://www.lscp.net/persons/ramus/docs/EPR20.pdf
- *Retrieval practice in the health professions: state-of-the-art review* (2025) — https://pmc.ncbi.nlm.nih.gov/articles/PMC12292765/
- *Spaced repetition algorithms: from SM-2 to FSRS* — https://www.mindomax.com/spaced-repetition-algorithms
- *The optimal retention* — FSRS4Anki wiki — https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-optimal-retention
- Brunmair & Richter (2019), *Similarity matters: a meta-analysis of interleaved learning* — https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf
- *Whether Interleaving or Blocking Is More Effective Depends on Learning Strategy* (2024) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12108632/
- *Certainty-based marking in MCQ assessments* (2025), Advances in Physiology Education — https://journals.physiology.org/doi/full/10.1152/advan.00087.2025
- Gardner-Medwin, *Certainty-Based Marking for reflective learning* — https://www.researchgate.net/publication/228648846
- *Mastery learning* (Bloom, 1968) — https://en.wikipedia.org/wiki/Mastery_learning

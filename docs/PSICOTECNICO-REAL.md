# Cómo es el psicotécnico real (13 nov 2026)

Fuente: dos PDF que aportó el dueño. **No son material propio y no se copian
preguntas a la plataforma**: sirven solo de referencia de forma.

- «Test Psicotécnico Policía Nacional XXXVII», de una academia (pie «Bas_37»,
  parece reproducir el formato del examen oficial de esa promoción).
- «Simulacro final OMN760», de DEPOL (dice que busca «ejercicios similares a los
  de pruebas oficiales»; trae soluciones).

## La estructura (Bas_37)

| Ejercicio | Preguntas | Minutos | Alternativas | Qué es |
|---|---|---|---|---|
| 1 | 40 | 23 | **4** | Mezcla de razonamiento numérico, verbal y espacial |
| 2 | 34 | 18 | **3** | Una tabla de 20 símbolos con nombres; en cada pregunta, elegir la fila cuyos nombres (al cambiar los símbolos) están en orden alfabético |
| 3 | 30 | 18 | **3** | Una frase inicial y una tabla de órdenes (A–H: pasar la primera palabra al final, intercambiar, eliminar, repetir, añadir «s»…); aplicar las órdenes en cadena y elegir el resultado |

«Tenga en cuenta que los errores penalizan.» El simulacro de DEPOL es un solo
ejercicio de 40 preguntas, 4 alternativas y 18 minutos.

## Lo que hay en el ejercicio 1 (40 preguntas)

Contar números con exclusiones («del 7 al 38 sin contar los que acaban en 2, 4 y
6»); series numéricas (también de dos series entrelazadas) y de letras con saltos;
analogías con símbolos («OBELISCO es a ⟨símbolos⟩ como CIELO es a…»);
problemas (porcentajes, proporciones, tasas, tuberías, ocas y ovejas, edades,
repartos proporcionales, monedas, unidades de tiempo); posiciones en el
abecedario y ordenar palabras alfabéticamente; equivalencias con símbolos;
silogismos, parentescos y orden de estatura; tablas 3×3 con una X; y lo visual:
series de figuras, rotaciones de figuras complejas, cubos contados, desarrollos
de cubo, fichas de dominó, plegados.

## Qué hay ahora (13 nov, en la rama)

- **VERSION_PSICO = 2.** Preguntas con **4 opciones** (3 en los ejercicios 2 y 3), como
  el examen. Una sesión empezada con la versión 1 (5 opciones) se corrige y se repasa
  como la 1 (`VERSIONES_PSICO`). Los generadores hacen 5 opciones y la versión 2 las
  recorta (`recorta`), así que las sesiones de la versión 1 salen idénticas: un test
  lleva la huella de 300.
- **Nota:** cada fallo resta 1/(opciones − 1) de un acierto, con las opciones de
  CADA pregunta. Es una suposición (la fórmula de la regla 22 generalizada): la
  penalización exacta hay que leerla en las bases de la convocatoria.
- **«Como en el examen»:** los tres ejercicios con sus preguntas y minutos
  (`EJERCICIOS_PSICO`). El ejercicio 1 mezcla 15 tipos.
- **Tipos nuevos:** conteo, series dobles, problemas (12 modelos: el aceite a
  precios distintos, el precio X, la cuenta del bar, los invitados, ocas y ovejas,
  porcentajes, grifos, reparto proporcional, minutos, ciclistas, impresoras, edades),
  abecedario (4 variantes), lógica (estatura y silogismos, comprobados contra todos
  los mundos posibles), cuadros con una X, palabras en símbolos, símbolos y nombres
  (ejercicio 2) y órdenes sobre una frase (ejercicio 3).
- **Lo que NO está:** lo visual complejo del ejercicio 1 (cubos contados, desarrollos
  de cubo, plegados, rotaciones de figuras con varios elementos, series de figuras
  con flechas) y los parentescos. Requieren dibujo por código; se hacen si compensa.

## Qué se guarda y dónde se ve

- Se guarda la SESIÓN (semilla, tipos, respuestas y resultado), no las preguntas:
  con la semilla se regeneran idénticas. Por eso el alumno puede repasar cualquier
  sesión ya hecha («Mis últimas sesiones» → tocar una).
- El admin todavía no ve las sesiones de psicotécnicos de sus alumnos.

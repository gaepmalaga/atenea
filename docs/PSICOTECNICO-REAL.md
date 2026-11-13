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

## Qué tenemos y qué falta (regla 117)

- Tenemos: series, letras, cálculo, sinónimos, atención, figuras (tabla 3×3),
  dominós, rotaciones (rejilla 3×3) y tablas de datos.
- **Diferencia grande:** generamos con **5** opciones; el examen real usa **4 o 3**.
  Cambiarlo obliga a subir `VERSION_PSICO` (cambia lo que se genera).
- **Diferencia grande:** no existen los ejercicios 2 y 3 (símbolos→nombres en
  orden alfabético; órdenes sobre una frase). Son los más fáciles de generar con
  exactitud por código.
- Los minutos por pregunta (~30 s) y el número (40) son parecidos.
- La penalización exacta del psicotécnico hay que leerla en las bases de la
  convocatoria: no se asume.

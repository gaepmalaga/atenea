/**
 * TEMA 1 · EL DERECHO — apuntes completos de Alphapol.
 *
 * Fuente ÚNICA del contenido: de aquí salen el PDF (HTML + Chromium) y el DOCX
 * (python-docx). Marcado en línea: **negrita** y ==subrayado amarillo==.
 * Bloques: h2, h3, p, ul, ol, tabla, clave (artículo literal), examen (pregunta
 * real con su año), ojo (trampa), ejemplo, resumen.
 *
 * Los artículos entre comillas son del Código Civil consolidado (BOE-A-1889-4763,
 * temario/md/tema-01.md). Las preguntas reales son de los exámenes oficiales de
 * Escala Básica 2021-2025 (solo el hecho preguntado, reformulado).
 */
export const meta = {
  numero: 1,
  titulo: 'El Derecho',
  subtitulo: 'Las normas jurídicas, la persona, la nacionalidad, el domicilio y la vecindad civil',
  escala: 'Escala Básica · Ciencias Jurídicas',
  programa: 'El Derecho: concepto y acepciones. Las normas jurídicas positivas: concepto, estructura, clases y caracteres. El principio de jerarquía normativa. La persona en sentido jurídico: concepto y clases; su nacimiento y extinción; capacidad jurídica y capacidad de obrar. Adquisición, conservación y pérdida de la nacionalidad española. El domicilio. La vecindad civil.',
  fuente: 'Código Civil (BOE-A-1889-4763), texto consolidado a 26/06/2026.',
};

export const secciones = [
  // ───────────────────────── 0 · CÓMO ESTUDIAR ─────────────────────────
  {
    id: 'guia', titulo: 'Antes de empezar: qué cae y cómo estudiarlo', corta: 'Qué cae',
    bloques: [
      { t: 'p', texto: 'Este tema es el primero del programa y el que más se subestima: parece «teoría general» y, sin embargo, **la mayoría de sus preguntas reales son de memoria exacta** (plazos, listas de supuestos, quién hace qué). En los cinco últimos exámenes oficiales de Escala Básica (2021-2025) han caído **11 preguntas** de este tema. Así se reparten:' },
      { t: 'tabla', cols: ['Parte del tema', 'Preguntas 2021-2025', 'Prioridad'], anchos: [46, 24, 30], filas: [
        ['**Nacionalidad española** (apartado 8)', '**7**', '🔥 Máxima'],
        ['**Vecindad civil** (apartado 10)', '2', '🔥 Alta'],
        ['**La persona**: nacimiento y capacidad (apartado 6)', '1', '🔥 Alta'],
        ['**Norma jurídica**: concepto (apartado 2)', '1', 'Media'],
        ['Fuentes, jerarquía y eficacia de las normas (apartados 3 a 5)', '0', 'Base: se entiende y se repasa'],
        ['Personas jurídicas y domicilio (apartados 7 y 9)', '0', 'Base: se entiende y se repasa'],
      ] },
      { t: 'ojo', titulo: 'Cómo sacarle partido', texto: 'Estudia en **tres pasadas**. **1.ª** Lee el apartado entero con calma (30-40 minutos el tema). **2.ª** Fíjate solo en los cuadros, los **artículos clave** y las **preguntas reales**. **3.ª** Haz el **test de autoevaluación** del final y repasa lo que falles. Después, practica este tema en el Campus Alphapol.' },
      { t: 'p', texto: 'Una norma a la hora de leer: **todo lo que lleva «(art. N)» es del Código Civil**, salvo que se diga otra cosa. Los textos entre comillas son literales del BOE; el resto está explicado con palabras más sencillas, sin cambiar el sentido.' },
    ],
  },

  // ───────────────────────── 1 · EL DERECHO ─────────────────────────
  {
    id: 'derecho', titulo: '1. El Derecho: concepto y acepciones', corta: 'El Derecho',
    bloques: [
      { t: 'p', texto: 'La palabra **«Derecho»** se usa con varios sentidos. Los cuatro que conviene distinguir son los siguientes.' },
      { t: 'tabla', cols: ['Acepción', 'Qué significa', 'Ejemplo'], anchos: [22, 48, 30], filas: [
        ['**Derecho objetivo**', 'El **conjunto de normas jurídicas** que regulan la conducta de las personas en sociedad y que el Estado puede hacer cumplir por la fuerza.', '«El Derecho español prohíbe…»; el Código Civil.'],
        ['**Derecho subjetivo**', 'La **facultad o poder** que el ordenamiento reconoce a una persona para exigir algo o actuar de una manera.', '«Tengo derecho a cobrar mi sueldo»; el derecho de propiedad.'],
        ['**Derecho como ciencia**', 'El **estudio sistemático** del ordenamiento jurídico (la ciencia jurídica).', '«Estudio Derecho»; la doctrina de los juristas.'],
        ['**Derecho como justicia**', 'El **ideal** de lo justo, el valor al que aspira el ordenamiento.', '«Esto no es Derecho, es una injusticia».'],
      ] },
      { t: 'h3', texto: 'Dos distinciones más' },
      { t: 'ul', items: [
        '**Derecho positivo** es el que **está vigente**, puesto por quien tiene poder para ello (las leyes, los reglamentos…). Se opone al **Derecho natural**, que sería un conjunto de principios de justicia anteriores y superiores a la ley. Cuando se habla de «normas jurídicas positivas» se habla del Derecho positivo.',
        '**Derecho público** (regula la organización del Estado y su relación con los ciudadanos: Constitucional, Administrativo, Penal…) y **Derecho privado** (regula las relaciones entre particulares: Civil, Mercantil…). El **Código Civil** es la norma básica del Derecho privado.',
      ] },
      { t: 'resumen', items: ['Derecho **objetivo** = las normas. Derecho **subjetivo** = el poder que te dan las normas.', 'Derecho **positivo** = el vigente. Derecho **natural** = el ideal.'] },
    ],
  },

  // ───────────────────────── 2 · LA NORMA ─────────────────────────
  {
    id: 'norma', titulo: '2. Las normas jurídicas positivas', corta: 'La norma',
    bloques: [
      { t: 'h3', texto: 'Concepto' },
      { t: 'p', texto: 'La **norma jurídica positiva** es un **precepto general**, destinado a **ordenar la convivencia de la comunidad**, cuya **observancia puede imponerse por la fuerza** (coactivamente) por el poder público. Esa es, casi con estas palabras, la definición que cae en el examen.' },
      { t: 'examen', anio: 2025, texto: 'Se describe un «precepto general cuyo fin es ordenar la convivencia de la comunidad y cuya observancia puede ser impuesta coactivamente por el poder directivo de aquella». La respuesta es **norma jurídica positiva**.' },
      { t: 'h3', texto: 'Estructura: supuesto de hecho y consecuencia jurídica' },
      { t: 'p', texto: 'Toda norma tiene dos partes: el **supuesto de hecho** (la situación que la norma prevé) y la **consecuencia jurídica** (el efecto que produce cuando ese supuesto se da).' },
      { t: 'tabla', cols: ['Supuesto de hecho', '→', 'Consecuencia jurídica'], anchos: [44, 6, 50], filas: [
        ['Nacer con vida y con entero desprendimiento del seno materno', '→', 'Se adquiere la personalidad (art. 30)'],
        ['Residir legalmente en España diez años, de forma continuada', '→', 'Se puede pedir la nacionalidad por residencia (art. 22)'],
        ['Realizar un acto contrario a una norma imperativa', '→', 'El acto es nulo de pleno derecho (art. 6.3)'],
      ] },
      { t: 'h3', texto: 'Caracteres de la norma jurídica' },
      { t: 'ul', items: [
        '**General**: se dirige a un grupo indeterminado de personas, no a una en concreto.',
        '**Abstracta**: regula supuestos tipo, no un caso particular.',
        '**Obligatoria**: hay que cumplirla aunque no se esté de acuerdo.',
        '**Coercible**: su cumplimiento se puede **imponer por la fuerza** y su incumplimiento lleva aparejada una sanción.',
        '**Heterónoma**: viene **de fuera** del sujeto (del poder público), no de su propia conciencia.',
      ] },
      { t: 'h3', texto: 'Clases de normas' },
      { t: 'tabla', cols: ['Criterio', 'Clases', 'Qué las distingue'], anchos: [22, 22, 56], filas: [
        ['Por su fuerza obligatoria', '**Imperativas**', 'Ordenan algo. No se pueden dejar de aplicar por voluntad de las partes.'],
        ['', '**Prohibitivas**', 'Prohíben algo. Los actos contrarios son **nulos de pleno derecho**, salvo que la propia norma prevea otro efecto (art. 6.3).'],
        ['', '**Dispositivas**', 'Se aplican **solo si las partes no han pactado otra cosa**. Permiten que la voluntad de los interesados las sustituya.'],
        ['Por su aplicación', '**Supletorias**', 'Se aplican **a falta de otra norma**. El Código Civil es **supletorio** en las materias regidas por otras leyes (art. 4.3 y art. 13.2).'],
        ['Por su alcance', '**Generales / especiales / excepcionales**', 'Las leyes **penales, excepcionales y de ámbito temporal** no se aplican a casos ni momentos distintos de los que prevén expresamente (art. 4.2): **no admiten aplicación por analogía**.'],
      ] },
      { t: 'ojo', titulo: 'No las mezcles', texto: '«Imperativa» y «prohibitiva» **mandan** y no admiten pacto en contra. «Dispositiva» **cede** ante la voluntad de las partes. «Supletoria» **rellena el hueco** cuando no hay otra norma aplicable.' },
    ],
  },

  // ───────────────────────── 3 · FUENTES ─────────────────────────
  {
    id: 'fuentes', titulo: '3. Las fuentes del ordenamiento jurídico', corta: 'Fuentes',
    bloques: [
      { t: 'p', texto: 'Las **fuentes** son los modos en que nace el Derecho. El Código Civil las enumera en su primer artículo y fija un **orden de aplicación**.' },
      { t: 'clave', titulo: 'Artículo 1.1', texto: '«Las fuentes del ordenamiento jurídico español son la ley, la costumbre y los principios generales del derecho.»' },
      { t: 'tabla', cols: ['Fuente', 'Cuándo se aplica', 'Condiciones y notas'], anchos: [20, 30, 50], filas: [
        ['**1.º La ley**', 'Siempre que haya una aplicable.', 'Es la fuente principal. Se publica en el BOE y obliga a todos.'],
        ['**2.º La costumbre**', '**Solo en defecto de ley aplicable** (art. 1.3).', 'No puede ser contraria a la **moral ni al orden público**, y debe ser **probada**. Los usos jurídicos que no sean meramente interpretativos de una declaración de voluntad tienen la consideración de costumbre.'],
        ['**3.º Principios generales del Derecho**', '**En defecto de ley o costumbre** (art. 1.4).', 'Además tienen un carácter **informador** del ordenamiento: inspiran e interpretan todas las normas.'],
      ] },
      { t: 'h3', texto: 'Otras piezas del sistema de fuentes' },
      { t: 'ul', items: [
        '**La jurisprudencia** no es una fuente en sentido estricto: **complementa** el ordenamiento con la doctrina que, de modo **reiterado**, establezca el **Tribunal Supremo** al interpretar y aplicar la ley, la costumbre y los principios generales (art. 1.6).',
        '**Los tratados internacionales** no se aplican directamente en España mientras no hayan pasado a formar parte del ordenamiento interno mediante su **publicación íntegra en el «Boletín Oficial del Estado»** (art. 1.5).',
        '**Jueces y tribunales** tienen el **deber inexcusable de resolver** en todo caso los asuntos de que conozcan, ateniéndose al sistema de fuentes (art. 1.7): no pueden negarse a juzgar por falta de ley.',
      ] },
      { t: 'resumen', items: ['Orden: **Ley → Costumbre → Principios generales** (regla mnemotécnica: **L-C-P**).', 'La costumbre se **prueba**; la ley no hace falta probarla.', 'Un tratado solo se aplica tras su **publicación íntegra en el BOE**.'] },
    ],
  },

  // ───────────────────────── 4 · JERARQUÍA ─────────────────────────
  {
    id: 'jerarquia', titulo: '4. El principio de jerarquía normativa', corta: 'Jerarquía',
    bloques: [
      { t: 'p', texto: 'Las normas no valen todas lo mismo: están ordenadas por **rango**. Cuando dos normas se contradicen, **prevalece la de rango superior**. El Código Civil lo dice con claridad y la Constitución lo garantiza.' },
      { t: 'clave', titulo: 'Artículo 1.2', texto: '«Carecerán de validez las disposiciones que contradigan otra de rango superior.»' },
      { t: 'p', texto: 'La Constitución (art. 9.3) **garantiza el principio de jerarquía normativa**. Así se ordenan las normas, de mayor a menor rango:' },
      { t: 'tabla', cols: ['Nivel', 'Normas', 'Notas'], anchos: [18, 36, 46], filas: [
        ['**1.º**', '**Constitución**', 'Norma suprema. Todas las demás deben respetarla.'],
        ['**2.º**', '**Tratados internacionales**', 'Una vez publicados oficialmente forman parte del ordenamiento interno (art. 96 CE y art. 1.5 CC).'],
        ['**3.º**', '**Leyes** y normas con rango de ley', '**Leyes orgánicas** (derechos fundamentales, estatutos de autonomía, régimen electoral…; exigen mayoría absoluta del Congreso) y **ordinarias**; **decretos-leyes** y **decretos legislativos** del Gobierno.'],
        ['**4.º**', '**Reglamentos**', 'Reales decretos, órdenes ministeriales… Los dicta el Gobierno o la Administración. **No pueden contradecir una ley.**'],
        ['Después', 'Costumbre y principios generales', 'Se aplican en defecto de ley y **siempre por debajo de ella**.'],
      ] },
      { t: 'ojo', titulo: 'Qué significa «carecer de validez»', texto: 'Un reglamento que contradiga una ley, o una ley que contradiga la Constitución, **no tiene validez**: se puede impugnar ante los tribunales y se anula. La jerarquía responde a la pregunta «¿qué norma prevalece cuando chocan?».' },
    ],
  },

  // ───────────────────────── 5 · EFICACIA ─────────────────────────
  {
    id: 'eficacia', titulo: '5. Eficacia y aplicación de las normas', corta: 'Eficacia',
    bloques: [
      { t: 'p', texto: 'El Título Preliminar del Código Civil recoge las reglas básicas sobre **cuándo** se aplica una ley, **cómo** se interpreta y **a quién** obliga. Son artículos cortos que conviene saber casi de memoria.' },
      { t: 'h3', texto: 'Entrada en vigor, derogación e irretroactividad (art. 2)' },
      { t: 'clave', titulo: 'Artículo 2', texto: '«1. Las leyes entrarán en vigor a los veinte días de su completa publicación en el “Boletín Oficial del Estado”, si en ellas no se dispone otra cosa. 2. Las leyes sólo se derogan por otras posteriores. […] Por la simple derogación de una ley no recobran vigencia las que ésta hubiere derogado. 3. Las leyes no tendrán efecto retroactivo, si no dispusieren lo contrario.»' },
      { t: 'ul', items: [
        '**Vigor: a los 20 días** de su **completa** publicación en el BOE (salvo que la propia ley diga otro plazo).',
        '**Derogación**: solo la hace **otra ley posterior**; alcanza a todo lo incompatible. Derogar una ley **no revive** las que ella había derogado.',
        '**Irretroactividad**: las leyes **no se aplican al pasado**, salvo que digan lo contrario.',
      ] },
      { t: 'h3', texto: 'Interpretación, analogía y plazos (arts. 3 a 5)' },
      { t: 'tabla', cols: ['Artículo', 'Regla'], anchos: [14, 86], filas: [
        ['**Art. 3**', 'Las normas se **interpretan** según el sentido propio de sus palabras, en relación con el **contexto**, los **antecedentes históricos y legislativos** y la **realidad social** del tiempo en que se aplican, atendiendo fundamentalmente al **espíritu y finalidad** de la norma. La **equidad** se pondera, pero los tribunales solo pueden resolver apoyándose **exclusivamente** en ella cuando la ley lo permite expresamente.'],
        ['**Art. 4**', '**Analogía**: se aplica una norma a un caso que la ley no prevé cuando regula otro **semejante** y hay **identidad de razón**. **No** cabe en leyes **penales, excepcionales y de ámbito temporal** (4.2). El Código Civil es **supletorio** de otras leyes (4.3).'],
        ['**Art. 5**', '**Plazos por días**: se **excluye el día inicial** y se cuenta desde el siguiente. **Plazos por meses o años**: de **fecha a fecha**; si el mes de vencimiento no tiene día equivalente, vence el **último del mes**. En el cómputo **civil** **no se excluyen los días inhábiles**.'],
      ] },
      { t: 'h3', texto: 'Obligatoriedad, fraude de ley y abuso de derecho (arts. 6 y 7)' },
      { t: 'clave', titulo: 'Artículo 6.1', texto: '«La ignorancia de las leyes no excusa de su cumplimiento. El error de derecho producirá únicamente aquellos efectos que las leyes determinen.»' },
      { t: 'ul', items: [
        '**Renuncia** a la ley aplicable o a los derechos que reconoce: solo válida si **no contraría el interés ni el orden público** y no perjudica a terceros (6.2).',
        'Los actos contrarios a normas **imperativas y prohibitivas** son **nulos de pleno derecho**, salvo que la norma fije otro efecto (6.3).',
        '**Fraude de ley** (6.4): actos realizados **al amparo del texto de una norma** pero que buscan un **resultado prohibido** por el ordenamiento. No impiden aplicar la norma que se quiso eludir.',
        '**Buena fe** y **abuso del derecho** (art. 7): los derechos se ejercen conforme a la buena fe; la ley **no ampara el abuso** ni el ejercicio antisocial del derecho, que da lugar a indemnización y a medidas para que cese.',
      ] },
      { t: 'h3', texto: 'A quién obligan las leyes (art. 8.1)' },
      { t: 'clave', titulo: 'Artículo 8.1', texto: '«Las leyes penales, las de policía y las de seguridad pública obligan a todos los que se hallen en territorio español.»' },
      { t: 'ojo', titulo: 'Importante para un policía', texto: 'Las leyes penales, de policía y de seguridad pública obligan a **todos los que se encuentren en territorio español**, sean **españoles o extranjeros**. En cambio, el estado civil o la capacidad de una persona se rigen por su **ley personal**, que es la de su **nacionalidad** (art. 9.1) o, dentro de España, la de su **vecindad civil** (art. 16).' },
    ],
  },

  // ───────────────────────── 6 · LA PERSONA ─────────────────────────
  {
    id: 'persona', titulo: '6. La persona en sentido jurídico', corta: 'La persona',
    bloques: [
      { t: 'p', texto: 'En Derecho, **persona** es todo ser capaz de ser **titular de derechos y obligaciones**. Hay dos clases: las **personas físicas o naturales** (los seres humanos) y las **personas jurídicas** (organizaciones a las que la ley da personalidad propia, que veremos en el apartado 7).' },
      { t: 'h3', texto: 'Nacimiento de la personalidad' },
      { t: 'clave', titulo: 'Artículos 29 y 30', texto: '«El nacimiento determina la personalidad; pero el concebido se tiene por nacido para todos los efectos que le sean favorables, siempre que nazca con las condiciones que expresa el artículo siguiente.» — «La personalidad se adquiere en el momento del nacimiento con vida, una vez producido el entero desprendimiento del seno materno.»' },
      { t: 'ul', items: [
        'La personalidad **empieza al nacer con vida** y con **entero desprendimiento del seno materno** (art. 30).',
        'El **concebido** (aún no nacido) se tiene por nacido **solo para lo que le favorezca**, y siempre que luego **nazca con las condiciones del art. 30** (art. 29). Ejemplo: puede heredar si nace con vida.',
        'En los **partos dobles**, la prioridad del nacimiento da al primer nacido los derechos que la ley reconozca al **primogénito** (art. 31).',
      ] },
      { t: 'examen', anio: 2024, texto: 'Se cita el art. 29 y se pregunta por el art. 30: la personalidad se adquiere **en el momento del nacimiento con vida, producido el entero desprendimiento del seno materno**. No basta la concepción ni la mayoría de edad.' },
      { t: 'h3', texto: 'Extinción de la personalidad' },
      { t: 'ul', items: [
        'La personalidad civil se **extingue por la muerte** de las personas (art. 32).',
        '**Comoriencia** (art. 33): si se duda **quién murió primero** entre dos o más personas llamadas a sucederse, quien sostenga la muerte anterior de una u otra **debe probarla**; a falta de prueba, se **presumen muertas al mismo tiempo** y **no hay transmisión de derechos** entre ellas.',
        '**Ausencia y presunción de muerte** (art. 34): se rigen por el Título VIII del Libro I del Código Civil.',
      ] },
      { t: 'h3', texto: 'Capacidad jurídica y capacidad de obrar' },
      { t: 'tabla', cols: ['', 'Capacidad jurídica', 'Capacidad de obrar'], anchos: [18, 41, 41], filas: [
        ['**Qué es**', 'Aptitud para ser **titular** de derechos y obligaciones.', 'Aptitud para **ejercer** por uno mismo esos derechos y asumir obligaciones, mediante actos con efectos jurídicos.'],
        ['**Cuándo se tiene**', 'Desde el **nacimiento**. La tienen **todas** las personas.', 'Se alcanza **plenamente con la mayoría de edad**, a los **18 años cumplidos** (art. 315). Antes es limitada o nula.'],
        ['**Ejemplo**', 'Un recién nacido puede ser **propietario** de un piso heredado.', 'Un menor no puede **vender** ese piso por sí solo: lo hace su representante legal.'],
      ] },
      { t: 'ul', items: [
        'La **emancipación** pone fin a la minoría de edad antes de tiempo (por ejemplo, por concesión de los padres a partir de los **16 años**) y da al menor mucha de la capacidad de obrar de un adulto.',
        'Las personas con **discapacidad** tienen capacidad jurídica **en igualdad de condiciones** que las demás y pueden ejercerla **con los apoyos** que precisen (reforma de la Ley 8/2021). Por eso los preceptos de nacionalidad hablan de formular las declaraciones «con los apoyos y ajustes de procedimiento» necesarios.',
      ] },
      { t: 'resumen', items: ['**Capacidad jurídica** = poder **tener** derechos (desde que se nace). **Capacidad de obrar** = poder **ejercerlos** (plena a los 18).', 'Nace la persona **con vida y desprendida** del seno materno; el concebido cuenta solo si **le favorece**.'] },
    ],
  },

  // ───────────────────────── 7 · PERSONAS JURÍDICAS ─────────────────────────
  {
    id: 'juridicas', titulo: '7. Las personas jurídicas', corta: 'Pers. jurídicas',
    bloques: [
      { t: 'clave', titulo: 'Artículo 35', texto: '«Son personas jurídicas: 1.º Las corporaciones, asociaciones y fundaciones de interés público reconocidas por la ley. Su personalidad empieza desde el instante mismo en que, con arreglo a derecho, hubiesen quedado válidamente constituidas. 2.º Las asociaciones de interés particular, sean civiles, mercantiles o industriales, a las que la ley conceda personalidad propia, independiente de la de cada uno de los asociados.»' },
      { t: 'tabla', cols: ['Tipo (art. 35)', 'Qué son', 'Ejemplos'], anchos: [30, 42, 28], filas: [
        ['**1.º De interés público**', 'Corporaciones, asociaciones y fundaciones **reconocidas por la ley**. Su personalidad empieza al **constituirse válidamente**.', 'Colegios profesionales, fundaciones.'],
        ['**2.º De interés particular**', 'Asociaciones **civiles, mercantiles o industriales** a las que la ley da **personalidad propia, independiente** de la de sus miembros.', 'Sociedades mercantiles, asociaciones privadas.'],
      ] },
      { t: 'ul', items: [
        '**Régimen** (art. 36): las asociaciones de interés particular se rigen por las normas del **contrato de sociedad**, según su naturaleza.',
        '**Capacidad civil** (art. 37): la de las **corporaciones**, por las leyes que las crearon o reconocieron; la de las **asociaciones**, por sus **estatutos**; la de las **fundaciones**, por las **reglas de su institución**, aprobadas por la Administración cuando sea necesario.',
        '**Qué pueden hacer** (art. 38): **adquirir y poseer bienes** de todas clases, **contraer obligaciones** y **ejercitar acciones civiles o criminales**, conforme a las leyes y reglas de su constitución.',
        '**Extinción** (art. 39): si dejan de funcionar (por expirar su plazo, cumplir su fin o ser imposible aplicar su actividad), sus bienes se destinan a lo que digan las leyes, los **estatutos** o las **cláusulas fundacionales**; si nada se previó, a **fines análogos** en interés del municipio, provincia o Nación.',
      ] },
      { t: 'ojo', titulo: 'Dos ideas para el examen', texto: 'La persona jurídica tiene **personalidad propia e independiente** de la de sus miembros. Y su **nacionalidad** depende de que esté **reconocida por la ley y domiciliada en España** (art. 28).' },
    ],
  },

  // ───────────────────────── 8 · NACIONALIDAD ─────────────────────────
  {
    id: 'nacionalidad', titulo: '8. La nacionalidad española', corta: 'Nacionalidad',
    destacada: true,
    bloques: [
      { t: 'p', texto: 'La **nacionalidad** es el vínculo jurídico y político entre una persona y un Estado. Es **la parte del tema que más cae** (7 de las 11 preguntas reales), y casi todo lo que se pregunta son **plazos, listas y supuestos exactos**. Estúdiala con papel y lápiz.' },
      { t: 'p', texto: '**Dónde se regula.** La Constitución (art. 11) dice que la nacionalidad se **adquiere, se conserva y se pierde de acuerdo con la ley**, y que **ningún español de origen puede ser privado de su nacionalidad**. La ley que lo desarrolla es el **Código Civil** (arts. 17 a 28), junto con otras normas, como la **Ley de Memoria Democrática**.' },
      { t: 'examen', anio: 2022, texto: '¿Qué normativa regula la adquisición de la nacionalidad española? → La **Constitución española, el Código Civil y la Ley de Memoria Democrática**.' },
      { t: 'h3', texto: 'Mapa de los modos de adquirirla' },
      { t: 'tabla', cols: ['Modo', 'Cómo funciona', 'Artículo'], anchos: [20, 64, 16], filas: [
        ['**Origen**', 'Se **nace español**. Lo son los hijos de padre o madre españoles y otros supuestos del art. 17.', '17'],
        ['**Consolidación**', 'Diez años de posesión y uso **de buena fe** con título inscrito.', '18'],
        ['**Adopción**', 'El adoptado **menor de 18** es español de origen **desde la adopción**; el mayor puede **optar**.', '19'],
        ['**Opción**', 'Un **derecho** de ciertas personas: basta **declarar** que se quiere ser español.', '20'],
        ['**Carta de naturaleza**', 'La concede el **Gobierno**, por **Real Decreto**, de forma **discrecional**, en circunstancias excepcionales.', '21.1'],
        ['**Residencia**', 'Tras un **tiempo de residencia legal** (10, 5, 2 o 1 años). Concede el **Ministro de Justicia**.', '21.2 y 22'],
      ] },
      { t: 'h3', texto: '8.1 Españoles de origen (art. 17)' },
      { t: 'clave', titulo: 'Artículo 17.1', texto: '«Son españoles de origen: a) Los nacidos de padre o madre españoles. b) Los nacidos en España de padres extranjeros si, al menos, uno de ellos hubiera nacido también en España. Se exceptúan los hijos de funcionario diplomático o consular acreditado en España. c) Los nacidos en España de padres extranjeros, si ambos carecieren de nacionalidad o si la legislación de ninguno de ellos atribuye al hijo una nacionalidad. d) Los nacidos en España cuya filiación no resulte determinada. […]»' },
      { t: 'ul', items: [
        'Ser español **de origen** significa que se **nace** español: nunca se pierde ese origen y **ningún español de origen puede ser privado de su nacionalidad** (art. 11 CE).',
        '**Letra d)**: los menores de edad cuyo **primer lugar conocido de estancia** sea territorio español se **presumen nacidos en España**.',
        '**Art. 17.2**: si la filiación o el nacimiento en España se determina **después de los 18 años**, no da por sí solo la nacionalidad: el interesado tiene **derecho a optar** a la nacionalidad española de origen en **2 años** desde esa determinación.',
      ] },
      { t: 'examen', anio: 2025, texto: '«En relación al art. 17 del Código Civil, son españoles de origen…» → **Los nacidos de padre o madre españoles.**' },
      { t: 'h3', texto: '8.2 Consolidación y adopción (arts. 18 y 19)' },
      { t: 'ul', items: [
        '**Consolidación (art. 18)**: la posesión y utilización **continuada** de la nacionalidad española durante **10 años**, con **buena fe** y basada en un **título inscrito en el Registro Civil**, consolida la nacionalidad **aunque se anule el título** que la originó.',
        '**Adoptado menor de 18 años** por un español: adquiere la nacionalidad española **de origen desde la adopción** (19.1).',
        '**Adoptado mayor de 18 años**: puede **optar** por la nacionalidad española de origen en el plazo de **2 años** desde la constitución de la adopción (19.2).',
        'Si, según su país de origen, el menor adoptado **mantiene su nacionalidad**, esta también se reconoce en España (19.3).',
      ] },
      { t: 'examen', anio: 2022, texto: 'Una joven pakistaní es **adoptada por una familia española a los 19 años**. ¿Desde cuándo adquiere o puede optar a la nacionalidad española de origen? → **Podrá optar a ella en el plazo de dos años a partir de la constitución de la adopción** (art. 19.2).' },
      { t: 'h3', texto: '8.3 Adquisición por opción (art. 20)' },
      { t: 'clave', titulo: 'Artículo 20.1', texto: '«Tienen derecho a optar por la nacionalidad española: a) Las personas que estén o hayan estado sujetas a la patria potestad de un español. b) Aquellas cuyo padre o madre hubiera sido originariamente español y nacido en España. c) Las que se hallen comprendidas en el segundo apartado de los artículos 17 y 19.»' },
      { t: 'p', texto: 'La declaración de opción la formula (art. 20.2):' },
      { t: 'ul', items: [
        'El **representante legal**, si el optante es **menor de 14 años**.',
        'El **propio interesado asistido por su representante legal**, si es **mayor de 14 años**.',
        'El **interesado por sí solo**, si está **emancipado o es mayor de 18 años**. La opción **caduca a los 20 años** de edad (con prórroga si no estaba emancipado a los 18: hasta 2 años después de la emancipación).',
        'La persona con **discapacidad**, con los **apoyos y ajustes** que precise.',
      ] },
      { t: 'ojo', titulo: 'Excepción de la letra b', texto: 'El derecho de opción de quien tiene **padre o madre originariamente español y nacido en España** (20.1.b) **no está sujeto a límite de edad** (art. 20.3).' },
      { t: 'examen', anio: 2023, texto: 'En el art. 20 del Código Civil, tienen derecho a optar a la nacionalidad → **Las personas que estén o hayan estado sujetas a la patria potestad de un español.**' },
      { t: 'h3', texto: '8.4 Carta de naturaleza y residencia (arts. 21 y 22)' },
      { t: 'ul', items: [
        '**Carta de naturaleza** (21.1): se concede **discrecionalmente por Real Decreto** cuando concurren **circunstancias excepcionales** en el interesado.',
        '**Residencia** (21.2): se concede por el **Ministro de Justicia**, que puede **denegarla por motivos razonados de orden público o interés nacional**. La concesión o denegación **deja a salvo la vía contencioso-administrativa** (22.5).',
        '**Quién puede pedirla** (21.3): el interesado **emancipado o mayor de 18 años**; el mayor de 14 **asistido por su representante legal**; el representante legal del **menor de 14**; y la persona con discapacidad con los apoyos necesarios.',
        '**Caducidad** (21.4): las concesiones por carta de naturaleza o por residencia **caducan a los 180 días** siguientes a su notificación si el interesado **no comparece** ante funcionario competente para cumplir los requisitos del art. 23.',
      ] },
      { t: 'h3', texto: 'El tiempo de residencia exigido (art. 22)' },
      { t: 'clave', titulo: 'Artículo 22.1', texto: '«Para la concesión de la nacionalidad por residencia se requiere que ésta haya durado diez años. Serán suficientes cinco años para los que hayan obtenido la condición de refugiado y dos años cuando se trate de nacionales de origen de países iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial o Portugal o de sefardíes.»' },
      { t: 'tabla', cols: ['Años', 'Quién', 'Artículo'], anchos: [14, 70, 16], filas: [
        ['**10**', '**Regla general.**', '22.1'],
        ['**5**', 'Quienes hayan obtenido la condición de **refugiado**.', '22.1'],
        ['**2**', '**Nacionales de origen** de países **iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial o Portugal**, y **sefardíes**.', '22.1'],
        ['**1**', '1) El que haya **nacido en territorio español**. 2) El que **no haya ejercitado oportunamente** la facultad de optar. 3) El sujeto a **tutela, curatela con facultades de representación plena, guarda o acogimiento** de un ciudadano o institución españoles durante **2 años consecutivos**. 4) El que lleve **1 año casado** con español o española y no esté separado legal o de hecho. 5) El **viudo o viuda** de español o española, si a la muerte del cónyuge no existía separación. 6) El **nacido fuera de España** de padre o madre, abuelo o abuela que originariamente hubieran sido españoles.', '22.2'],
      ] },
      { t: 'p', texto: '**La residencia ha de ser siempre legal, continuada e inmediatamente anterior a la petición** (22.3). Además, el interesado debe justificar **buena conducta cívica** y **suficiente grado de integración** en la sociedad española (22.4).' },
      { t: 'ojo', titulo: 'Dos trampas que ya han caído', texto: '**1)** Los países con 2 años son **solo** los de la lista del art. 22.1 (iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial y Portugal, más los sefardíes). **Mónaco no está.** **2)** Hay que distinguir quién necesita **2 años** (nacionales de origen de esos países) de quién necesita **1 año** (supuestos del 22.2).' },
      { t: 'examen', anio: 2024, texto: '«¿Para qué personas **no** será suficiente la residencia por dos años?» → **Nacionales de origen de Mónaco**, que no figuran en la lista del art. 22.1.' },
      { t: 'examen', anio: 2024, texto: 'Nacionalidad por residencia: «bastará el tiempo de residencia de **un año**…» → **Para el que no haya ejercitado oportunamente la facultad de optar** (22.2.b).' },
      { t: 'h3', texto: '8.5 Requisitos comunes (art. 23)' },
      { t: 'p', texto: 'Para que la adquisición por **opción, carta de naturaleza o residencia** sea válida, hacen falta **tres cosas**:' },
      { t: 'tabla', cols: ['', 'Requisito', 'Detalle'], anchos: [8, 38, 54], filas: [
        ['**a)**', '**Jurar o prometer**', 'El mayor de **14 años** y capaz jura o promete **fidelidad al Rey** y **obediencia a la Constitución y a las leyes**.'],
        ['**b)**', '**Renunciar**', 'Declarar que **renuncia a su anterior nacionalidad**. Se salvan los naturales de los países del art. 24.1 (iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial, Portugal) y los **sefardíes** originarios de España.'],
        ['**c)**', '**Inscribir**', 'Que la adquisición se **inscriba en el Registro Civil español**.'],
      ] },
      { t: 'h3', texto: '8.6 Conservación y pérdida (arts. 24 y 25)' },
      { t: 'clave', titulo: 'Artículo 24.1', texto: '«Pierden la nacionalidad española los emancipados que, residiendo habitualmente en el extranjero, adquieran voluntariamente otra nacionalidad o utilicen exclusivamente la nacionalidad extranjera que tuvieran atribuida antes de la emancipación. La pérdida se producirá una vez que transcurran tres años, a contar, respectivamente, desde la adquisición de la nacionalidad extranjera o desde la emancipación. No obstante, los interesados podrán evitar la pérdida si dentro del plazo indicado declaran su voluntad de conservar la nacionalidad española al encargado del Registro Civil.»' },
      { t: 'tabla', cols: ['Quién', 'Cuándo la pierde', 'Cómo evitarlo'], anchos: [30, 46, 24], filas: [
        ['**Emancipados** que residen habitualmente en el extranjero (24.1)', 'Si **adquieren voluntariamente otra nacionalidad** o **usan solo la extranjera** que tenían: la pierden **a los 3 años**.', 'Declarar ante el **Registro Civil** que quieren conservarla, dentro de esos 3 años.'],
        ['Emancipados con otra nacionalidad que residen fuera (24.2)', 'Si **renuncian expresamente** a la española.', '—'],
        ['**Nacidos y residentes en el extranjero**, españoles por ser hijos de padre o madre españoles también nacidos en el extranjero (24.3)', 'Si las leyes del país donde residen les atribuyen su nacionalidad y **no declaran su voluntad de conservarla** en **3 años** desde la mayoría de edad o emancipación.', 'Declararlo ante el **Registro Civil** en ese plazo.'],
        ['Los **no españoles de origen** (25.1)', '**1)** Si durante **3 años** usan **exclusivamente** la nacionalidad a la que declararon renunciar. **2)** Si entran voluntariamente al **servicio de las armas** o ejercen **cargo político** en un Estado extranjero **contra la prohibición expresa del Gobierno**.', '—'],
      ] },
      { t: 'ul', items: [
        '**La nacionalidad no se pierde por esta vía si España está en guerra** (24.4).',
        '**Nulidad** (25.2): una **sentencia firme** que declare que hubo **falsedad, ocultación o fraude** en la adquisición **anula** la nacionalidad; la acción la ejercita el **Ministerio Fiscal** en **15 años**, sin perjudicar a terceros de buena fe.',
      ] },
      { t: 'h3', texto: '8.7 Recuperación (art. 26)' },
      { t: 'clave', titulo: 'Artículo 26.1', texto: '«Quien haya perdido la nacionalidad española podrá recuperarla cumpliendo los siguientes requisitos: a) Ser residente legal en España. Este requisito no será de aplicación a los emigrantes ni a los hijos de emigrantes. […] b) Declarar ante el encargado del Registro Civil su voluntad de recuperar la nacionalidad española. c) Inscribir la recuperación en el Registro Civil.»' },
      { t: 'examen', anio: 2021, texto: '¿Cuál es un requisito para **recuperar** la nacionalidad española tras haberla perdido (art. 26)? → **Declarar ante el encargado del Registro Civil su voluntad de recuperarla.**' },
      { t: 'ojo', titulo: 'Quien perdió por servir en armas o cargo político', texto: 'Los españoles que incurrieron en los supuestos del art. 25 (servicio de las armas o cargo político extranjero contra la prohibición del Gobierno) **no pueden recuperar** la nacionalidad **sin previa habilitación concedida discrecionalmente por el Gobierno** (26.2).' },
      { t: 'h3', texto: '8.8 Extranjeros y personas jurídicas (arts. 27 y 28)' },
      { t: 'ul', items: [
        '**Art. 27**: los extranjeros gozan en España de los **mismos derechos civiles que los españoles**, salvo lo dispuesto en las **leyes especiales** y en los **tratados**.',
        '**Art. 28**: las corporaciones, fundaciones y asociaciones **reconocidas por la ley y domiciliadas en España** gozan de la **nacionalidad española** si tienen el concepto de personas jurídicas conforme al Código Civil. Las asociaciones domiciliadas en el extranjero tienen la consideración y derechos que fijen los tratados o leyes especiales.',
        '**Doble nacionalidad** (art. 9.9): se estará a lo que digan los **tratados**; si no dicen nada, prefiere la **coincidente con la última residencia habitual** y, en su defecto, la **última adquirida**. **Prevalece siempre la española** frente a otra que no esté prevista en nuestras leyes o en los tratados.',
      ] },
      { t: 'resumen', items: [
        'Se **nace** español (origen) o se **adquiere**: opción, carta de naturaleza, residencia (y consolidación y adopción).',
        '**Residencia: 10 · 5 · 2 · 1 años.** Siempre **legal, continuada e inmediatamente anterior** a la petición.',
        'Requisitos comunes (art. 23): **jurar o prometer**, **renunciar** y **inscribir**.',
        '**Perder**: **3 años** (emancipados en el extranjero con otra nacionalidad). **Recuperar**: residir legalmente, **declararlo** e **inscribirlo**.',
        'Concesión **caduca a los 180 días** si no se comparece.',
      ] },
    ],
  },

  // ───────────────────────── 9 · DOMICILIO ─────────────────────────
  {
    id: 'domicilio', titulo: '9. El domicilio', corta: 'Domicilio',
    bloques: [
      { t: 'clave', titulo: 'Artículos 40 y 41', texto: '«Para el ejercicio de los derechos y el cumplimiento de las obligaciones civiles, el domicilio de las personas naturales es el lugar de su residencia habitual, y, en su caso, el que determine la Ley de Enjuiciamiento Civil. El domicilio de los diplomáticos residentes por razón de su cargo en el extranjero, que gocen del derecho de extraterritorialidad, será el último que hubieren tenido en territorio español.» — «Cuando ni la ley que las haya creado o reconocido ni los estatutos o las reglas de fundación fijaren el domicilio de las personas jurídicas, se entenderá que lo tienen en el lugar en que se halle establecida su representación legal, o donde ejerzan las principales funciones de su instituto.»' },
      { t: 'tabla', cols: ['Quién', 'Su domicilio civil es…'], anchos: [34, 66], filas: [
        ['**Persona natural**', 'El lugar de su **residencia habitual** (y, en su caso, el que determine la Ley de Enjuiciamiento Civil).'],
        ['**Diplomáticos** con extraterritorialidad residentes en el extranjero por razón de su cargo', 'El **último que tuvieron en territorio español**.'],
        ['**Persona jurídica**', 'El que fije **su ley o sus estatutos**. Si no lo dicen: donde esté su **representación legal** o donde ejerza sus **principales funciones**.'],
      ] },
      { t: 'ojo', titulo: 'No confundas', texto: 'Aquí hablamos del **domicilio a efectos civiles**. La **inviolabilidad del domicilio** (protección frente a entradas y registros) es otra materia, que se estudia en el tema de la Constitución.' },
    ],
  },

  // ───────────────────────── 10 · VECINDAD ─────────────────────────
  {
    id: 'vecindad', titulo: '10. La vecindad civil', corta: 'Vecindad civil',
    bloques: [
      { t: 'p', texto: 'En España coexisten el **derecho civil común** (el Código Civil) y los **derechos civiles forales o especiales** de algunos territorios. La **vecindad civil** es el vínculo que decide **qué derecho civil se le aplica a cada persona**.' },
      { t: 'clave', titulo: 'Artículo 14.1', texto: '«La sujeción al derecho civil común o al especial o foral se determina por la vecindad civil.»' },
      { t: 'ul', items: [
        '**Art. 13**: las disposiciones del Título Preliminar y las del Título IV del Libro I (salvo las del régimen económico matrimonial) tienen **aplicación general y directa en toda España**. En lo demás, el **Código Civil rige como derecho supletorio**, respetando los derechos forales.',
        '**Art. 16**: los conflictos entre legislaciones civiles de España se resuelven con las normas del Capítulo IV con una particularidad: **la ley personal es la determinada por la vecindad civil**.',
      ] },
      { t: 'h3', texto: 'Cómo se tiene la vecindad civil de los padres (art. 14.2 y 14.3)' },
      { t: 'ul', items: [
        'Tienen la vecindad civil de **derecho común o de un derecho foral** los **nacidos de padres que tengan esa vecindad**. Por **adopción**, el adoptado no emancipado adquiere la vecindad de los adoptantes.',
        '**Padres con distinta vecindad**: el hijo tiene la del progenitor **respecto del cual la filiación haya sido determinada antes**; si no, la del **lugar de nacimiento**; y, en último término, la de **derecho común**.',
        'Los padres (o quien ejerza la patria potestad) pueden **atribuir al hijo la vecindad de cualquiera de ellos** en los **6 meses** siguientes al nacimiento o adopción.',
        'El hijo, **desde los 14 años** y hasta **1 año después de su emancipación**, puede **optar** por la vecindad del **lugar de nacimiento** o por la **última vecindad de cualquiera de sus padres**. Si no está emancipado, lo hace asistido por su representante legal.',
      ] },
      { t: 'h3', texto: 'Cómo se adquiere por residencia (art. 14.5)' },
      { t: 'clave', titulo: 'Artículo 14.5', texto: '«La vecindad civil se adquiere: 1.º Por residencia continuada durante dos años, siempre que el interesado manifieste ser esa su voluntad. 2.º Por residencia continuada de diez años, sin declaración en contrario durante este plazo. Ambas declaraciones se harán constar en el Registro Civil y no necesitan ser reiteradas.»' },
      { t: 'tabla', cols: ['Residencia continuada', 'Condición'], anchos: [30, 70], filas: [
        ['**2 años**', 'Solo si el interesado **manifiesta que esa es su voluntad**.'],
        ['**10 años**', '**Sin declaración en contrario** durante ese plazo (opera automáticamente).'],
      ] },
      { t: 'h3', texto: 'Otras reglas' },
      { t: 'ul', items: [
        '**El matrimonio no altera la vecindad civil** (14.4). Aun así, cualquiera de los cónyuges no separados puede, **en cualquier momento, optar por la vecindad del otro**.',
        '**En caso de duda**, prevalece la vecindad civil que corresponda al **lugar de nacimiento** (14.6).',
        '**El extranjero que adquiere la nacionalidad española** debe **optar**, al inscribirla, por una de estas vecindades (art. 15.1): la del **lugar de residencia**, la del **lugar de nacimiento**, la **última de cualquiera de sus progenitores o adoptantes** o la del **cónyuge**. Si adquiere por carta de naturaleza, la fija el Real Decreto de concesión (15.2). **Quien recupera** la nacionalidad recupera la vecindad que tenía al perderla (15.3).',
      ] },
      { t: 'examen', anio: 2023, texto: '«Señale la opción correcta sobre la vecindad civil» → **El matrimonio no altera la vecindad civil.**' },
      { t: 'examen', anio: 2024, texto: '«Siempre que el interesado manifieste ser esa su voluntad, ¿cómo se adquiere la vecindad civil?» → **Por residencia continuada durante dos años.**' },
      { t: 'resumen', items: ['Vecindad = qué **derecho civil** te toca (común o foral). Hijos: la de los **padres**.', '**6 meses** para que los padres la atribuyan; el hijo opta **desde los 14 años**.', 'Por residencia: **2 años (si lo declaras)** o **10 años (sin declaración en contrario)**.', 'El **matrimonio no la cambia**.'] },
    ],
  },

  // ───────────────────────── 11 · NÚMEROS ─────────────────────────
  {
    id: 'numeros', titulo: '11. Plazos y números que hay que saber', corta: 'Números',
    bloques: [
      { t: 'tabla', cols: ['Número', 'A qué se refiere', 'Artículo'], anchos: [18, 66, 16], filas: [
        ['**20 días**', 'Entrada en vigor de las leyes desde su completa publicación en el BOE.', '2.1'],
        ['**14 años**', 'Jurar o prometer fidelidad (art. 23.a); optar a la nacionalidad asistido por el representante; optar por la vecindad civil.', '20, 23, 14'],
        ['**16 años**', 'Edad mínima para la emancipación por concesión de los padres.', '317'],
        ['**18 años**', 'Mayoría de edad y plena capacidad de obrar. Si el adoptado es mayor, opta en 2 años (19.2).', '315, 19'],
        ['**20 años**', 'Caduca la opción por nacionalidad si el optante emancipado o mayor de 18 no ejercita antes su derecho.', '20.2.c'],
        ['**6 meses**', 'Plazo para que los padres atribuyan al hijo la vecindad civil de cualquiera de ellos.', '14.3'],
        ['**1 año**', 'Residencia suficiente en los supuestos del art. 22.2. Plazo del hijo emancipado para optar por la vecindad.', '22.2, 14.3'],
        ['**2 años**', 'Residencia para iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial, Portugal y sefardíes; opción tras determinar filiación o adopción; vecindad por residencia declarada.', '22.1, 17.2, 19.2, 14.5'],
        ['**3 años**', 'Se pierde la nacionalidad por adquirir otra o usar solo la extranjera; plazo para declarar la voluntad de conservarla.', '24, 25'],
        ['**5 años**', 'Residencia para quienes han obtenido la condición de refugiado.', '22.1'],
        ['**10 años**', 'Residencia general; consolidación de la nacionalidad; vecindad civil sin declaración en contrario.', '22.1, 18, 14.5'],
        ['**15 años**', 'Plazo de la acción de nulidad de la nacionalidad por falsedad, ocultación o fraude.', '25.2'],
        ['**180 días**', 'Caducidad de la concesión por carta de naturaleza o residencia si no se comparece.', '21.4'],
      ] },
    ],
  },
];

/** Las 11 preguntas reales de 2021-2025 que son de este tema. */
export const realesPorAnio = [
  { anio: 2021, pregunta: 'Requisito para **recuperar** la nacionalidad tras haberla perdido (art. 26).', respuesta: 'Declarar ante el encargado del Registro Civil su voluntad de recuperarla.', parte: 'Nacionalidad' },
  { anio: 2022, pregunta: 'Normativa que regula la adquisición de la nacionalidad española.', respuesta: 'Constitución española, Código Civil y Ley de Memoria Democrática.', parte: 'Nacionalidad' },
  { anio: 2022, pregunta: 'Adoptada por una familia española **a los 19 años**: ¿desde cuándo adquiere o puede optar a la nacionalidad de origen?', respuesta: 'Puede optar en el plazo de **dos años** a partir de la constitución de la adopción (19.2).', parte: 'Nacionalidad' },
  { anio: 2023, pregunta: 'Según el art. 20, ¿quién tiene derecho a optar a la nacionalidad?', respuesta: 'Quienes estén o hayan estado sujetos a la patria potestad de un español.', parte: 'Nacionalidad' },
  { anio: 2023, pregunta: 'Opción correcta sobre la vecindad civil.', respuesta: 'El matrimonio no altera la vecindad civil.', parte: 'Vecindad' },
  { anio: 2024, pregunta: 'Art. 30: ¿cuándo se adquiere la personalidad?', respuesta: 'Al nacer con vida, una vez producido el entero desprendimiento del seno materno.', parte: 'Persona' },
  { anio: 2024, pregunta: '¿Cómo se adquiere la vecindad civil, si el interesado lo manifiesta?', respuesta: 'Por residencia continuada durante **dos años**.', parte: 'Vecindad' },
  { anio: 2024, pregunta: 'Nacionalidad por residencia: ¿cuándo basta **un año**?', respuesta: 'Para el que no haya ejercitado oportunamente la facultad de optar (22.2.b).', parte: 'Nacionalidad' },
  { anio: 2024, pregunta: '¿Para qué personas **no** basta residir **dos años**?', respuesta: 'Nacionales de origen de **Mónaco** (no figura en la lista del art. 22.1).', parte: 'Nacionalidad' },
  { anio: 2025, pregunta: 'Según el art. 17, son españoles de origen…', respuesta: 'Los nacidos de padre o madre españoles.', parte: 'Nacionalidad' },
  { anio: 2025, pregunta: 'Precepto general que ordena la convivencia y puede imponerse por la fuerza.', respuesta: 'Norma jurídica positiva.', parte: 'Norma' },
];

/** Test de autoevaluación: pregunta, tres opciones, índice de la correcta (0-2) y explicación. */
export const test = [
  { q: '¿Cuál es el orden de las fuentes del ordenamiento jurídico español según el art. 1 del Código Civil?', o: ['Ley, costumbre y principios generales del derecho.', 'Costumbre, ley y jurisprudencia.', 'Principios generales, ley y costumbre.'], c: 0, e: 'Art. 1.1: la ley, la costumbre y los principios generales del derecho, en ese orden de aplicación.' },
  { q: 'Salvo que se disponga otra cosa, las leyes entran en vigor…', o: ['Al día siguiente de su publicación en el BOE.', 'A los veinte días de su completa publicación en el BOE.', 'A los treinta días de su aprobación por las Cortes.'], c: 1, e: 'Art. 2.1: a los veinte días de su completa publicación en el «Boletín Oficial del Estado».' },
  { q: 'La costumbre rige…', o: ['Siempre que sea anterior a la ley.', 'Solo en defecto de ley aplicable, si no es contraria a la moral ni al orden público y resulta probada.', 'Cuando el juez lo decide, sin necesidad de prueba.'], c: 1, e: 'Art. 1.3: solo en defecto de ley, que no sea contraria a la moral o al orden público y que se pruebe.' },
  { q: 'Según el Código Civil, la ignorancia de las leyes…', o: ['Excusa de su cumplimiento si hay buena fe.', 'No excusa de su cumplimiento.', 'Excusa en materia civil, pero no en la penal.'], c: 1, e: 'Art. 6.1: la ignorancia de las leyes no excusa de su cumplimiento.' },
  { q: 'Las disposiciones que contradigan otra de rango superior…', o: ['Se aplican si son posteriores.', 'Carecen de validez.', 'Solo se aplican en materia civil.'], c: 1, e: 'Art. 1.2: carecerán de validez las disposiciones que contradigan otra de rango superior.' },
  { q: 'Las leyes penales, las de policía y las de seguridad pública obligan…', o: ['Solo a los españoles.', 'A todos los que se hallen en territorio español.', 'A los residentes legales.'], c: 1, e: 'Art. 8.1: obligan a todos los que se hallen en territorio español.' },
  { q: 'La personalidad se adquiere…', o: ['Con la concepción.', 'En el momento del nacimiento con vida, producido el entero desprendimiento del seno materno.', 'A los dieciocho años.'], c: 1, e: 'Art. 30. El concebido solo se tiene por nacido para los efectos que le sean favorables (art. 29).' },
  { q: 'La capacidad de obrar plena se alcanza, con carácter general…', o: ['A los catorce años.', 'A los dieciséis años.', 'A los dieciocho años, con la mayoría de edad.'], c: 2, e: 'Art. 315: la mayoría de edad empieza a los dieciocho años cumplidos.' },
  { q: 'Son españoles de origen…', o: ['Los nacidos de padre o madre españoles.', 'Los nacidos en España de padres extranjeros en todo caso.', 'Los que residan diez años en España.'], c: 0, e: 'Art. 17.1.a. Los nacidos en España de extranjeros lo son solo si uno de ellos nació también aquí (y salvo hijos de diplomáticos).' },
  { q: 'Para la concesión de la nacionalidad por residencia se requiere, con carácter general, una residencia de…', o: ['Cinco años.', 'Diez años.', 'Dos años.'], c: 1, e: 'Art. 22.1: diez años, cinco para refugiados y dos para iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial, Portugal y sefardíes.' },
  { q: 'Bastará un año de residencia para…', o: ['El que haya nacido en territorio español.', 'Cualquier nacional de un país iberoamericano.', 'El que lleve tres meses casado con español.'], c: 0, e: 'Art. 22.2.a. Los iberoamericanos necesitan dos años y el matrimonio exige un año de casados (22.2.d).' },
  { q: 'Las concesiones de nacionalidad por carta de naturaleza o por residencia caducan…', o: ['A los noventa días de su notificación.', 'A los ciento ochenta días siguientes a su notificación, si el interesado no comparece.', 'Al año de su concesión.'], c: 1, e: 'Art. 21.4: a los 180 días siguientes a la notificación si no comparece el interesado para cumplir los requisitos del art. 23.' },
  { q: '¿Cuál NO es requisito común del art. 23 para adquirir la nacionalidad por opción, carta de naturaleza o residencia?', o: ['Jurar o prometer fidelidad al Rey y obediencia a la Constitución y a las leyes.', 'Renunciar a la anterior nacionalidad (con las excepciones legales).', 'Acreditar estudios universitarios.'], c: 2, e: 'Art. 23: jurar o prometer, renunciar a la anterior nacionalidad e inscribir la adquisición en el Registro Civil.' },
  { q: 'Pierden la nacionalidad española, salvo que declaren su voluntad de conservarla, los emancipados que residen habitualmente en el extranjero y adquieren voluntariamente otra nacionalidad, tras…', o: ['Un año.', 'Tres años.', 'Cinco años.'], c: 1, e: 'Art. 24.1: a los tres años desde la adquisición de la otra nacionalidad.' },
  { q: 'El domicilio de las personas naturales a efectos civiles es…', o: ['El lugar de su nacimiento.', 'El lugar de su residencia habitual.', 'El lugar de su trabajo.'], c: 1, e: 'Art. 40: el lugar de su residencia habitual, y, en su caso, el que determine la Ley de Enjuiciamiento Civil.' },
  { q: 'La vecindad civil se adquiere por residencia continuada de…', o: ['Dos años, si se manifiesta la voluntad; o diez años, sin declaración en contrario.', 'Cinco años, o diez años en todo caso.', 'Un año, o cinco años sin declaración.'], c: 0, e: 'Art. 14.5: 2 años si el interesado manifiesta su voluntad; 10 años sin declaración en contrario.' },
];

/**
 * LOS 12 POSTS DE INSTAGRAM — la ÚNICA fuente del contenido.
 *
 * De aquí salen las imágenes (`render.mjs` → `../png/`) y el documento con los
 * textos, el pie de foto y el texto alternativo (`../POSTS.md`). Si cambias un
 * texto, cámbialo aquí y vuelve a generar: nunca a mano en el .md ni en Canva,
 * o la imagen y el pie acabarán diciendo cosas distintas.
 *
 * Reglas del contenido (ver ../README.md, «Reglas de honestidad»):
 *  - Cada número sale del producto o de un documento oficial, nunca «de memoria».
 *  - Lo que es un ejemplo inventado lleva la etiqueta «Ejemplo» en la imagen.
 *  - No se anuncia nada que hoy esté fuera del MVP (chat, entrevista).
 *
 * Marcado: **texto** se pinta en el color de acento.
 * `publico`: 'opositor' (fondo hueso) · 'academia' (fondo noche) · 'ambos'.
 */

export const POSTS = [
  // ───────────────────────────────────────────── SEMANA 1
  {
    id: '01-manifiesto',
    semana: 1,
    dia: 'Lunes',
    publico: 'ambos',
    fijar: true,
    tema: 'Quiénes somos y en qué somos distintos',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Atenea Policial',
        titulo: 'Estudiar más horas no es el problema.',
        sub: '**Estudiar lo que no toca, sí.**',
      },
      {
        tipo: 'texto',
        kicker: 'Lo que hay',
        titulo: 'Miles de preguntas al azar y un porcentaje.',
        cuerpo:
          'Así funcionan casi todas las plataformas de test. Qué repasar, cuándo y cuánto lo decides tú. Y nadie mira cómo has respondido: solo si has acertado.',
      },
      {
        tipo: 'lista',
        kicker: 'Lo que hace Atenea',
        titulo: 'Decide por ti. **Y te dice por qué.**',
        items: [
          { h: 'Qué estudias hoy', p: 'Cada pregunta lleva su propio calendario de repaso. Hoy salen las que te tocan.' },
          { h: 'Dónde está tu nota', p: 'El banco crece donde más cae el examen real: 497 preguntas oficiales de 2021 a 2025, contadas tema a tema.' },
          { h: 'Qué se te está olvidando', p: 'Lo que se te va antes de que se vaya del todo, sin que tengas que buscarlo.' },
        ],
      },
      {
        tipo: 'texto',
        kicker: 'Y para academias',
        titulo: 'Tu método, con un motor detrás.',
        cuerpo:
          'A quién llamar hoy, qué preguntas falla toda la clase, grupos, pagos y físicas. Con el nombre de tu academia y tu propio enlace.',
      },
      {
        tipo: 'cierre',
        titulo: 'Policía Nacional. Escala Básica.',
        cuerpo: '45 temas. Un sistema que aprende de cómo respondes.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Estudiar más horas no es el problema. Estudiar lo que no toca, sí.

Casi todas las plataformas de test hacen lo mismo: un banco enorme, preguntas al azar y un porcentaje de acierto. Lo demás lo decides tú: qué repasar, cuándo y cuánto.

Atenea lo decide por ti, y te dice por qué:
→ Cada pregunta tiene su calendario de repaso. Hoy salen las que te tocan.
→ El banco crece donde más cae el examen real (497 preguntas oficiales, 2021–2025, contadas por tema).
→ Sabe qué se te está olvidando y te lo pone delante antes de que se vaya.

¿Tienes una academia? También es para ti: panel de alumnos, grupos, pagos y físicas, con tu nombre y tu enlace.

Oposita a Policía Nacional como nunca antes. ateneapolicial.com`,
    hashtags: ['policianacional', 'oposicionespolicia', 'escalabasica', 'opositores', 'academiadeoposiciones'],
    alt: 'Carrusel de presentación de Atenea Policial: estudiar más horas no es el problema, estudiar lo que no toca sí. Explica que la plataforma decide qué repasar cada día, prioriza los temas que más caen en el examen real y detecta qué se le está olvidando al alumno.',
  },
  {
    id: '02-lo-que-se-te-va-a-olvidar',
    semana: 1,
    dia: 'Miércoles',
    publico: 'opositor',
    fijar: true,
    tema: 'Sabe qué se te va a olvidar antes que tú',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Lo que te toca hoy',
        titulo: 'Sabe qué se te va a olvidar **antes que tú.**',
        sub: 'Y te lo pone delante justo a tiempo.',
      },
      {
        tipo: 'texto',
        kicker: 'El problema',
        titulo: 'Lo que estudiaste hace tres semanas ya se está yendo.',
        cuerpo:
          'Y no lo notas hasta el examen. Repasar por temas, en orden, llega tarde a unas preguntas y demasiado pronto a otras.',
      },
      {
        tipo: 'semana',
        kicker: 'Lo que te toca esta semana',
        ejemplo: true,
        dias: [['Hoy', 38], ['Mar', 21], ['Mié', 9], ['Jue', 0], ['Vie', 14], ['Sáb', 6], ['Dom', 11]],
        cuerpo: 'Preguntas que vencen cada día. Las que se te pasan no se pierden: cuentan en hoy.',
      },
      {
        tipo: 'texto',
        kicker: 'Cómo lo sabe',
        titulo: 'Cada pregunta tiene **su propio reloj.**',
        cuerpo:
          'Uno por pregunta y por alumno. Si la aciertas firme, se aleja. Si se te cae, vuelve antes. Si la aciertas dudando, no se retira.',
      },
      {
        tipo: 'texto',
        kicker: 'Sin encuestas',
        titulo: 'No te pregunta nada.',
        cuerpo:
          'Lo deduce de cómo respondes: cuánto tardas comparado contigo, cuándo tocas la primera opción, si cambias de idea.',
      },
      {
        tipo: 'cierre',
        titulo: 'Tú entras. Lo que toca hoy ya está elegido.',
        cuerpo: 'Oposita a Policía Nacional como nunca antes.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Lo que estudiaste hace tres semanas se te está olvidando ahora mismo. Y no lo vas a notar hasta el examen.

Repasar por temas, en orden, llega tarde a unas preguntas y demasiado pronto a otras.

En Atenea cada pregunta tiene su propio reloj, distinto para cada alumno:
→ Si la aciertas firme, se aleja.
→ Si se te cae, vuelve antes.
→ Si la aciertas dudando, no se da por sabida.

Y no te pregunta nada: lo deduce de cómo respondes. Cuánto tardas comparado contigo, cuándo tocas la primera opción, si cambias de idea.

Tú entras y lo que te toca hoy ya está elegido. Ves lo que vence cada día de la semana, y lo que se te pasa no se pierde: cuenta en hoy.

(Las cifras de la imagen son un ejemplo.)

ateneapolicial.com`,
    hashtags: ['policianacional', 'oposicionespolicia', 'tecnicasdeestudio', 'repeticionespaciada', 'opositores'],
    alt: 'Carrusel sobre cómo Atenea anticipa el olvido: cada pregunta tiene su propio calendario de repaso por alumno. Muestra un ejemplo de las preguntas que vencen cada día de la semana y explica que el sistema lo deduce de cómo responde el alumno, sin preguntarle.',
  },
  {
    id: '03-a-quien-llamar',
    semana: 1,
    dia: 'Viernes',
    publico: 'academia',
    fijar: true,
    tema: 'Para academias: detectar el abandono antes de que pase',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Para dirección de academia',
        titulo: '¿Sabes quién va a **dejarlo en noviembre?**',
        sub: 'Las señales se ven semanas antes. Si alguien las mira.',
      },
      {
        tipo: 'texto',
        kicker: 'El dato que falta',
        titulo: 'Un alumno que lleva dos semanas sin entrar.',
        cuerpo:
          'Es lo más accionable que tiene una academia. Y casi nunca aparece en ninguna parte hasta que ya no paga.',
      },
      {
        tipo: 'panel',
        kicker: 'Panel de alumnos',
        titulo: 'Ordenado por urgencia, no por nombre.',
        ejemplo: true,
        filas: [
          { nombre: 'Alumno 1', estado: 'Nunca ha entrado', detalle: 'Dado de alta hace 12 días', tono: 'rojo' },
          { nombre: 'Alumno 2', estado: '16 días sin entrar', detalle: 'Iba al 58 % de acierto', tono: 'rojo' },
          { nombre: 'Alumno 3', estado: 'Entra y no contesta', detalle: 'A diario, 0 preguntas esta semana', tono: 'ambar' },
          { nombre: 'Alumno 4', estado: 'Estudia', detalle: '71 % sobre lo contestado', tono: 'verde' },
        ],
      },
      {
        tipo: 'compara',
        kicker: 'Dos conversaciones distintas',
        titulo: '«Viene» y «estudia» no son lo mismo.',
        izq: { h: 'No viene', items: ['¿Sigue interesado?', 'Llamada de retención'] },
        der: { h: 'Viene y no estudia', items: ['¿Se ha atascado?', 'De los que más se salvan'] },
      },
      {
        tipo: 'texto',
        kicker: 'Sin disfrazar',
        titulo: 'Sin datos no es cero.',
        cuerpo:
          'Un 0 % es un alumno que va mal; uno que no ha empezado pide otra llamada. El panel no los mezcla. Y el acierto se calcula sobre lo contestado: quien deja blancos a propósito no sale peor de lo que va.',
      },
      {
        tipo: 'cierre',
        titulo: 'Tu academia, con un motor detrás.',
        cuerpo: 'Para academias de oposición a Policía Nacional.',
        accion: 'Pide una demo por DM',
      },
    ],
    pie: `¿Sabes qué alumnos van a dejarlo en noviembre?

Casi nunca se sabe hasta que dejan de pagar. Y las señales estaban semanas antes: alguien que no entra desde hace dos semanas, alguien que se dio de alta y no ha empezado, alguien que entra cada día y no contesta ni una pregunta.

En el panel de alumnos de Atenea la lista no va por orden alfabético: va por urgencia. Primero quien nunca ha entrado, después quien lleva más tiempo fuera.

Y separa dos cosas que casi todo el mundo mezcla:
→ Quien no viene: ¿sigue interesado?
→ Quien viene y no estudia: ¿se ha atascado? Son de los que más se salvan, y de los que antes se pierden.

Tienes una academia de oposición a Policía Nacional y quieres verlo con tus alumnos: escríbenos por DM.`,
    hashtags: ['academiadeoposiciones', 'oposicionespolicia', 'policianacional', 'gestionacademia', 'formacion'],
    alt: 'Carrusel para directores de academia. Muestra un ejemplo del panel de alumnos de Atenea ordenado por urgencia: quien nunca ha entrado, quien lleva 16 días fuera, quien entra y no contesta y quien estudia. Explica que venir y estudiar son dos señales distintas.',
  },

  // ───────────────────────────────────────────── SEMANA 2
  {
    id: '04-peso-del-examen',
    semana: 2,
    dia: 'Lunes',
    publico: 'opositor',
    tema: 'Qué temas caen de verdad (5 exámenes oficiales)',
    slides: [
      {
        tipo: 'portada',
        kicker: '5 exámenes oficiales · 497 preguntas',
        titulo: 'No todos los temas **valen lo mismo.**',
        sub: 'Lo hemos contado.',
      },
      {
        tipo: 'barras',
        kicker: 'Los 5 temas que más han caído · 2021–2025',
        filas: [
          { n: 'T3', label: 'La Constitución Española (II)', v: 32 },
          { n: 'T8', label: 'La Dirección General de la Policía', v: 27 },
          { n: 'T6', label: 'Los funcionarios públicos', v: 25 },
          { n: 'T1', label: 'El Derecho', v: 20 },
          { n: 'T14', label: 'LO 4/2015, seguridad ciudadana', v: 20 },
        ],
        max: 32,
        nota: 'Preguntas de 497.',
      },
      {
        tipo: 'numero',
        kicker: 'Concentración',
        grande: '42 %',
        label: 'del examen salió de solo 10 temas.',
        cuerpo: 'De 45.',
      },
      {
        tipo: 'numero',
        kicker: 'Y al otro extremo',
        grande: '17 %',
        label: 'salió de otros 17 temas juntos.',
        cuerpo: 'El tema 30 cayó una vez en cinco años.',
      },
      {
        tipo: 'texto',
        kicker: 'Ojo',
        titulo: 'No es para saltarte temas.',
        cuerpo:
          'Entran los 45, y una pregunta es una pregunta. Es para saber dónde se gana la nota cuando no llegas a todo.',
      },
      {
        tipo: 'texto',
        kicker: 'Cómo lo usa Atenea',
        titulo: 'El banco crece **donde pesa.**',
        cuerpo:
          'En los temas que más caen hay preguntas para cada artículo, no una cifra redonda por tema. Y cuando dos repasos son igual de urgentes, va primero el del tema que más cae.',
      },
      {
        tipo: 'cierre',
        titulo: 'Guárdalo. Pásaselo a quien estudia contigo.',
        cuerpo: 'Las preguntas oficiales se usan para medir el peso, nunca como fuente: la ley cambia.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Hemos contado las 497 preguntas de los cinco últimos exámenes oficiales de la Escala Básica (2021–2025), tema a tema.

Los que más han caído:
T3 · La Constitución Española (II) — 32
T8 · La Dirección General de la Policía — 27
T6 · Los funcionarios públicos — 25
T1 · El Derecho — 20
T14 · LO 4/2015, seguridad ciudadana — 20

Solo 10 temas suman el 42 % del examen. En el otro extremo, 17 temas juntos suman el 17 %.

No es para saltarte nada: entran los 45. Es para saber dónde se gana la nota cuando no llegas a todo.

En Atenea este reparto decide dos cosas: dónde crece el banco (en los temas que más pesan hay preguntas para cada artículo) y qué va primero cuando dos repasos son igual de urgentes.

Una aclaración: los exámenes antiguos los usamos para medir el peso, no para sacar preguntas. Un artículo citado hace cinco años puede haber cambiado.

Fuente: cuadernillos oficiales 2021–2025, clasificados por tema.`,
    hashtags: ['policianacional', 'oposicionespolicia', 'escalabasica', 'temario', 'opositores'],
    alt: 'Carrusel con el peso real de cada tema en los cinco últimos exámenes de Policía Nacional. Los que más caen: Constitución II (32 preguntas), Dirección General de la Policía (27), funcionarios públicos (25), El Derecho (20) y seguridad ciudadana (20). Diez temas suman el 42 por ciento del examen.',
  },
  {
    id: '05-hoy-te-toca',
    semana: 2,
    dia: 'Miércoles',
    publico: 'opositor',
    tema: 'El entrenamiento adaptativo: qué te toca hoy y por qué',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Entrenamiento adaptativo',
        titulo: 'Hoy te toca esto.',
        sub: '**Y te decimos por qué.**',
      },
      {
        tipo: 'cajones',
        kicker: 'Cada pregunta, en su cajón',
        titulo: 'Los tuyos, no los de la clase.',
        items: [
          { h: 'Nueva', p: 'Aún no la has visto', c: 'gris' },
          { h: 'Recaída', p: 'La sabías y se te fue', c: 'rojo' },
          { h: 'En aprendizaje', p: 'Acertada hace poco', c: 'ambar' },
          { h: 'Consolidando', p: 'Varios aciertos seguidos', c: 'azul' },
          { h: 'Dominada', p: 'Se retira una temporada', c: 'verde' },
          { h: 'Atascada', p: 'Falla tras falla', c: 'negro' },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Cómo se arma tu sesión',
        items: [
          { h: 'Recaídas primero', p: 'Lo que se te está yendo, antes de que se vaya del todo.' },
          { h: 'Lo nuevo, con tope', p: 'Si todo es nuevo, el acierto se hunde y te rindes.' },
          { h: 'Temas mezclados', p: 'Cuesta más y se queda mejor.' },
          { h: 'Calibrada al ~85 %', p: 'Lo bastante difícil para aprender. No tanto como para frustrarte.' },
        ],
      },
      {
        tipo: 'texto',
        kicker: 'Antes de cada pregunta',
        titulo: '«Te toca porque la fallaste hace 3 días.»',
        cuerpo: '«Una más y se retira una temporada.» La decisión no es una caja negra: te la dice.',
      },
      {
        tipo: 'texto',
        kicker: 'Tu curva de olvido',
        titulo: 'Si una pregunta se te cae, **vuelve antes.**',
        cuerpo:
          'Cada recaída acorta su siguiente repaso. Es tu memoria con esa pregunta, no una media de todo el mundo.',
      },
      {
        tipo: 'cierre',
        titulo: 'Cuántas preguntas hoy, lo propone el sistema.',
        cuerpo: 'Tú lo ajustas y entrenas. Sin nota y sin reloj: aquí se aprende.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `¿Qué repasas hoy? Si la respuesta es «lo que me apetezca» o «el tema que toca en el calendario», estás dejando lo más importante al azar.

En Atenea cada pregunta está en un cajón, y los cajones son tuyos, no de la clase: nueva, recaída, en aprendizaje, consolidando, dominada o atascada.

Con eso se arma tu sesión:
→ Recaídas primero, antes de que se vayan del todo.
→ Material nuevo con tope, para que no se hunda el acierto.
→ Temas mezclados.
→ Calibrada para que aciertes alrededor del 85 %.

Y antes de cada pregunta te dice por qué está ahí: «te toca porque la fallaste hace 3 días», «una más y se retira una temporada».

Si una pregunta se te cae una y otra vez, vuelve antes. Es tu curva de olvido con esa pregunta, no una media.`,
    hashtags: ['policianacional', 'oposicionespolicia', 'tecnicasdeestudio', 'repeticionespaciada', 'opositores'],
    alt: 'Carrusel sobre el entrenamiento adaptativo de Atenea. Cada pregunta está en uno de seis cajones: nueva, recaída, en aprendizaje, consolidando, dominada y atascada. La sesión pone primero las recaídas, limita el material nuevo, mezcla temas y apunta a un 85 por ciento de acierto.',
  },
  {
    id: '06-academia-sin-excel',
    semana: 2,
    dia: 'Viernes',
    publico: 'academia',
    tema: 'Para academias: grupos, pagos, altas y físicas en un sitio',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Para dirección de academia',
        titulo: 'Excel, WhatsApp **y una libreta.**',
        sub: 'Lo que usa tu academia para llevar alumnos, grupos y pagos.',
      },
      {
        tipo: 'lista',
        kicker: 'Grupos',
        titulo: 'Un alumno, varios grupos.',
        items: [
          { h: 'Teoría, inglés, físicas…', p: 'Se marcan desde la ficha del alumno. Si en enero deja físicas, un clic.' },
          { h: 'Varios profesores por grupo', p: 'Con su horario.' },
          { h: 'Tipos de grupo a tu medida', p: 'Los llamas como los llames en tu academia.' },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Pagos',
        titulo: 'Cobras como ya cobras.',
        items: [
          { h: 'Rejilla mes a mes', p: 'Alumnos por 12 meses. Un toque para marcar quién ha pagado.' },
          { h: 'Lo cobrado, por mes', p: 'Sin sumar a mano.' },
          { h: 'Exentos', p: 'Becados o familia: se ven, pero no cuentan como deuda.' },
          { h: 'Sin pasarela', p: 'No cobramos comisión por tus cuotas: el acceso lo abres y cierras tú.' },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Altas y preparación física',
        items: [
          { h: 'Tu propio enlace', p: 'Tus alumnos se registran en la página de tu academia.' },
          { h: 'Solicitudes de alta', p: 'Te llega un correo, aceptas o rechazas, y el alumno se entera.' },
          { h: 'Plan físico por grupo', p: 'Semana a semana y con histórico. Lo escribe tu preparador.' },
        ],
      },
      {
        tipo: 'cierre',
        titulo: 'Y el mismo motor de estudio para todos tus alumnos.',
        cuerpo: 'La gestión es lo que te ahorra tiempo. El entrenamiento adaptativo es lo que te hace distinta.',
        accion: 'Pide una demo por DM',
      },
    ],
    pie: `Excel para los pagos, WhatsApp para los grupos y una libreta para las físicas. Si te suena, esto es para ti.

En Atenea, todo en un panel:

GRUPOS · Un alumno puede estar en teoría, inglés y físicas a la vez. Se marca desde su ficha; si en enero deja físicas, un clic. Varios profesores por grupo, y los tipos de grupo los defines tú.

PAGOS · Rejilla de alumnos por 12 meses: un toque y marcado. Lo cobrado cada mes, sin sumar a mano. Los exentos (becados, familia) se ven pero no cuentan como deuda. Sin pasarela y sin comisiones: cobras como ya cobras, y el acceso lo abres y cierras tú.

ALTAS · Tu propio enlace. Cada solicitud de alta te llega por correo, la aceptas o rechazas y el alumno recibe la respuesta.

FÍSICAS · Tu preparador escribe el plan de cada grupo semana a semana, y queda el histórico.

Y encima, el mismo entrenamiento adaptativo para todos tus alumnos.

Demo para academias: escríbenos por DM.`,
    hashtags: ['academiadeoposiciones', 'oposicionespolicia', 'gestionacademia', 'policianacional', 'preparacionfisica'],
    alt: 'Carrusel para academias sobre la gestión en Atenea: grupos con varios profesores, alumnos en varios grupos, rejilla de pagos mes a mes con exentos y sin pasarela, enlace propio de registro, solicitudes de alta por correo y plan físico por grupo semana a semana.',
  },

  // ───────────────────────────────────────────── SEMANA 3
  {
    id: '07-acertar-dudando',
    semana: 3,
    dia: 'Lunes',
    publico: 'opositor',
    tema: 'Firmeza: acertar dudando no es dominar',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Lo que tu app no ve',
        titulo: 'Acertar dudando **no es saberlo.**',
        sub: 'Y tu plataforma debería notar la diferencia.',
      },
      {
        tipo: 'compara',
        kicker: 'Dos aciertos',
        titulo: 'Para casi todas las apps, los dos son un ✓.',
        izq: { h: 'Firme', items: ['Tocaste la buena a la primera', 'Más rápido que tu ritmo', 'Sin cambiar de opción'] },
        der: { h: 'Titubeante', items: ['El doble de lo que sueles tardar', 'Cambiaste de respuesta', 'Volviste a tu primera idea'] },
      },
      {
        tipo: 'texto',
        kicker: 'Lo que mira Atenea',
        titulo: 'Tu tiempo, tus cambios, tu primer toque.',
        cuerpo:
          'Contra tu propio ritmo, no contra un número fijo. Y sin preguntarte nada: se deduce de cómo respondes.',
      },
      {
        tipo: 'texto',
        kicker: 'Qué cambia',
        titulo: 'Un acierto dudoso **no da la pregunta por dominada.**',
        cuerpo: 'Vuelve antes. Hasta que la aciertes sin pelearla, no se retira.',
      },
      {
        tipo: 'lista',
        kicker: 'Y si fallas',
        titulo: 'No todos los fallos son iguales.',
        items: [
          { h: 'Olvido', p: 'La tenías aprendida y se te fue.' },
          { h: 'Trampa', p: 'Cambiaste de opción y caíste.' },
          { h: 'Lectura', p: 'Contestaste en tres segundos. Leíste mal.' },
          { h: 'Laguna', p: 'Esto no lo sabías.' },
        ],
        nota: 'Cada uno vuelve en un momento distinto.',
      },
      {
        tipo: 'cierre',
        titulo: 'Tú contestas. Lo demás lo deducimos.',
        cuerpo: 'Sin encuestas después de cada pregunta.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Dos aciertos. Uno lo marcaste al momento. El otro, después de tardar el doble de lo normal y cambiar de respuesta dos veces.

Para casi todas las plataformas los dos son un ✓. Para tu examen, no.

Atenea mira cómo respondes: tu tiempo comparado con tu propio ritmo, si cambias de opción, cuándo tocas la primera. Y no te pregunta nada: lo deduce.

Con eso:
→ Un acierto dudoso no da la pregunta por dominada. Vuelve antes.
→ Un fallo no es solo un fallo. Olvido, trampa, lectura o laguna, y cada uno vuelve en un momento distinto. Si leíste mal, no hace falta volver a empezar de cero con esa pregunta.

Tú contestas. Lo demás lo hace el sistema.`,
    hashtags: ['policianacional', 'oposicionespolicia', 'tecnicasdeestudio', 'opositores', 'escalabasica'],
    alt: 'Carrusel que compara un acierto firme con uno titubeante. Atenea deduce la firmeza del tiempo de respuesta comparado con el ritmo del alumno, los cambios de opción y el primer toque, y distingue cuatro tipos de fallo: olvido, trampa, lectura y laguna.',
  },
  {
    id: '08-simulacro-comparable',
    semana: 3,
    dia: 'Miércoles',
    publico: 'opositor',
    tema: 'El simulacro representativo y los dos tipos de blanco',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Simulacros',
        titulo: 'Si no puedes comparar dos simulacros, **tu nota no dice nada.**',
        sub: '',
      },
      {
        tipo: 'lista',
        kicker: 'Cómo se monta uno',
        items: [
          { h: '25, 50 o 100 preguntas', p: 'Tamaños fijos, para poder comparar.' },
          { h: 'Reparto por temas y artículos', p: 'No cuarenta preguntas del mismo artículo.' },
          { h: 'Mezcla de dificultad fija', p: 'No sale fácil un día y durísimo al siguiente.' },
          { h: 'Nada de los últimos 7 días', p: 'Que no se note que la has visto esta semana.' },
        ],
      },
      {
        tipo: 'cuadricula',
        kicker: 'Al terminar',
        titulo: 'Tu examen, pregunta a pregunta.',
        celdas: 'VVRVBVVVRVVBVVVRVVVBVVRVV',
        cuerpo: 'Cada casilla abre qué marcaste, la correcta, por qué, el artículo y cuánto tardaste.',
      },
      {
        tipo: 'texto',
        kicker: 'Los blancos',
        titulo: 'Hay dos tipos de blanco.',
        cuerpo:
          'El que no tocaste porque no tenías ni idea. Y el que marcaste y retiraste porque no compensaba arriesgar. **El segundo es estrategia**, y lo distinguimos.',
      },
      {
        tipo: 'cierre',
        titulo: 'Dos simulacros que se pueden comparar.',
        cuerpo: 'Tu media, la mejor y hacia dónde vas.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Haces un simulacro el lunes y sacas un 6. El jueves, un 4. ¿Has ido a peor o te ha tocado un examen más difícil?

Si el simulacro son preguntas al azar, no lo sabrás nunca.

En Atenea un simulacro:
→ Tiene 25, 50 o 100 preguntas. Tamaños fijos, para comparar.
→ Reparte por temas y por artículos.
→ Mantiene fija la mezcla de dificultad.
→ No repite lo que has visto en los últimos 7 días.

Al terminar, una cuadrícula: verde, rojo y blanco. Cada casilla abre qué marcaste, la correcta, la explicación, el artículo y cuánto tardaste.

Y una cosa que casi nadie mira: no todos los blancos son iguales. No es lo mismo no tener ni idea que marcar, dudar y retirarla porque no compensaba el riesgo. Lo segundo es estrategia, y te lo decimos.`,
    hashtags: ['policianacional', 'oposicionespolicia', 'simulacro', 'escalabasica', 'opositores'],
    alt: 'Carrusel sobre los simulacros de Atenea: tamaños fijos de 25, 50 o 100 preguntas, reparto por temas y artículos, dificultad constante y 30 segundos por pregunta. Muestra la cuadrícula de resultados en verde, rojo y blanco, y explica los dos tipos de respuesta en blanco.',
  },
  {
    id: '09-lo-que-falla-la-clase',
    semana: 3,
    dia: 'Viernes',
    publico: 'academia',
    tema: 'Para academias: preguntas que falla todo el mundo y pares que se confunden',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Para profesores',
        titulo: 'Si casi toda tu clase falla la misma pregunta…',
        sub: '**…puede que el problema no sea tu clase.**',
      },
      {
        tipo: 'texto',
        kicker: 'Preguntas que falla casi todo el mundo',
        titulo: 'Una pregunta que nadie acierta suele estar mal.',
        cuerpo:
          'Mal redactada, o con la correcta mal marcada. Solo entra en la lista con un mínimo de intentos: un fallo suelto no la pone ahí.',
      },
      {
        tipo: 'texto',
        kicker: 'Pares que se confunden',
        titulo: 'Quien falla esta, **falla también aquella.**',
        cuerpo:
          'Cuando dos preguntas del mismo tema se fallan juntas mucho más de lo que explicaría el azar, suele ser la misma distinción mal entendida. Ahí tienes tu próxima clase.',
      },
      {
        tipo: 'aviso',
        kicker: 'Y un dato para el lunes',
        ejemplo: true,
        texto: 'Esta semana el sistema ha llevado **214 preguntas más a dominadas**, entre 23 alumnos.',
        cuerpo: 'Un hecho que se puede comprobar, no una frase de ánimo. Si una semana sale cero, no se disfraza.',
      },
      {
        tipo: 'texto',
        kicker: 'Reportes',
        titulo: 'El aviso llega a quien puede arreglarlo.',
        cuerpo:
          'Si un alumno reporta una pregunta de tu banco, te llega a ti. Si es del banco común, la corregimos nosotros.',
      },
      {
        tipo: 'cierre',
        titulo: 'Menos intuición. Más clase donde hace falta.',
        cuerpo: 'Para academias de oposición a Policía Nacional.',
        accion: 'Pide una demo por DM',
      },
    ],
    pie: `Si casi toda tu clase falla la misma pregunta, hay dos opciones: o nadie se sabe ese punto, o la pregunta está mal.

Con suficientes intentos, suele ser lo segundo: mal redactada o con la correcta mal marcada. Y si está mal, tus alumnos están estudiando un dato falso.

En el panel de Atenea:
→ Preguntas que falla casi todo el mundo, con un mínimo de intentos para que un fallo suelto no las cuele.
→ Pares que se confunden: cuando quien falla una falla también la otra mucho más de lo que explicaría el azar. Suele ser la misma distinción mal entendida. Ahí tienes tu próxima clase.
→ Cada semana, cuántas preguntas ha llevado el sistema a dominadas entre tus alumnos. Un hecho comprobable.

Y si un alumno reporta una pregunta de tu banco, te llega a ti. Si es del banco común, la arreglamos nosotros.

(La cifra de la imagen es un ejemplo.)`,
    hashtags: ['academiadeoposiciones', 'profesores', 'oposicionespolicia', 'policianacional', 'formacion'],
    alt: 'Carrusel para profesores de academia. Explica que Atenea detecta preguntas que falla casi toda la clase, a menudo mal redactadas, y pares de preguntas que se fallan juntas. Incluye un ejemplo de aviso semanal: el sistema ha llevado 214 preguntas más a dominadas entre 23 alumnos.',
  },

  // ───────────────────────────────────────────── SEMANA 4
  {
    id: '10-la-misma-opcion-falsa',
    semana: 4,
    dia: 'Lunes',
    publico: 'opositor',
    tema: 'El distractor fijo: una creencia falsa bien aprendida',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Fallar siempre igual',
        titulo: 'Si siempre caes en la **misma opción falsa**…',
        sub: '…no es que no lo sepas. Es que te lo sabes mal.',
      },
      {
        tipo: 'texto',
        kicker: 'Una creencia falsa',
        titulo: 'Fallar al azar y fallar siempre igual son problemas distintos.',
        cuerpo:
          'Si casi todos tus fallos en una pregunta van a la misma opción equivocada, no te falta un dato: tienes uno falso, y bien aprendido.',
      },
      {
        tipo: 'texto',
        kicker: 'Ahí repetir no sirve',
        titulo: 'Más tests **refuerzan el error.**',
        cuerpo:
          'Atenea deja de insistir y te manda a releer el artículo. Lo mismo con las que llevas cuatro fallos o más: salen aparte, arriba, en «Se te resisten».',
      },
      {
        tipo: 'texto',
        kicker: 'En cada explicación',
        titulo: 'Por qué está bien la correcta. Y por qué están mal las otras dos.',
        cuerpo: 'Porque el día del examen la trampa no es la correcta: es la que se le parece.',
      },
      {
        tipo: 'cierre',
        titulo: 'Tus fallos, ordenados por lo que hay que hacer con ellos.',
        cuerpo: 'No una lista plana de todo lo que has fallado.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `Hay preguntas que fallas siempre igual: siempre la B, aunque la correcta sea la C.

Eso no es no saberlo. Es tener un dato falso bien aprendido, y ahí hacer más tests no ayuda: refuerza el error.

Atenea lo detecta. Cuando tus fallos en una pregunta se concentran en la misma opción equivocada, deja de repetírtela y te manda al artículo. Lo mismo con las que llevas cuatro fallos o más: aparecen aparte, arriba, en «Se te resisten».

Y cada explicación dice por qué la correcta está bien y también por qué las otras dos están mal. El día del examen, la trampa es la opción que se parece a la buena.`,
    hashtags: ['policianacional', 'oposicionespolicia', 'tecnicasdeestudio', 'opositores', 'testoposiciones'],
    alt: 'Carrusel sobre el error sistemático: cuando un alumno falla una pregunta siempre con la misma opción equivocada tiene una creencia falsa. Atenea deja de repetir esa pregunta, remite al artículo y agrupa aparte las que se resisten. Las explicaciones justifican también las opciones incorrectas.',
  },
  {
    id: '11-mi-evolucion',
    semana: 4,
    dia: 'Miércoles',
    publico: 'opositor',
    tema: 'Mi Evolución: todo tu progreso en una pantalla',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Mi Evolución',
        titulo: 'Todo lo que has hecho, **en una pantalla.**',
        sub: 'Sin proyecciones inventadas.',
      },
      {
        tipo: 'curva',
        kicker: 'Preguntas dominadas, día a día',
        ejemplo: true,
        grande: '1.284',
        label: 'dominadas desde el 11 de agosto',
        puntos: [0, 12, 30, 41, 60, 88, 103, 140, 176, 190, 231, 280, 318, 350, 402, 455, 470, 530, 590, 640, 671, 730, 802, 860, 905, 960, 1010, 1072, 1130, 1190, 1231, 1284],
      },
      {
        tipo: 'lista',
        kicker: 'Lo que te enseña',
        items: [
          { h: 'El mapa del temario', p: 'Por tema: dominadas, en camino y sin tocar.' },
          { h: 'Las que se te resisten', p: 'Y de qué tema son la mayoría.' },
          { h: 'Las que evitas', p: 'Las que siempre dejas en blanco.' },
          { h: '¿Aprobaría?', p: 'Tu media de simulacros y hacia dónde va.' },
        ],
      },
      {
        tipo: 'texto',
        kicker: 'En todos tus dispositivos',
        titulo: 'Un día que ya pasó no cambia.',
        cuerpo: 'Tu curva se guarda en tu cuenta: la misma en el móvil y en el ordenador.',
      },
      {
        tipo: 'cierre',
        titulo: 'Dónde estás. No dónde te gustaría estar.',
        cuerpo: 'Solo lo que has hecho, contado bien.',
        accion: 'ateneapolicial.com',
      },
    ],
    pie: `¿Cuántas preguntas dominas hoy? ¿Y hace un mes?

Casi ninguna plataforma te lo puede decir, porque solo guarda aciertos y fallos sueltos.

«Mi Evolución» te lo cuenta todo en una pantalla:
→ La curva de preguntas dominadas, día a día, desde que empezaste.
→ El mapa del temario: por tema, qué está dominado, qué va en camino y qué no has tocado.
→ Las que se te resisten, y de qué tema son la mayoría.
→ Las que evitas: las que siempre dejas en blanco.
→ ¿Aprobaría?: la media de tus simulacros y la tendencia.

Sin predicciones de cuándo vas a aprobar. Solo lo que has hecho, contado bien.

(La curva de la imagen es un ejemplo.)`,
    hashtags: ['policianacional', 'oposicionespolicia', 'opositores', 'escalabasica', 'motivacionopositores'],
    alt: 'Carrusel sobre la pantalla Mi Evolución de Atenea. Muestra una curva de ejemplo de preguntas dominadas día a día, que llega a 1.284. Incluye el mapa del temario por tema, las preguntas que se resisten, las que se evitan y la media de simulacros con la nota oficial.',
  },
  {
    id: '12-banco-para-academias',
    semana: 4,
    dia: 'Viernes',
    publico: 'academia',
    tema: 'Para academias: banco común de más de 4.600 preguntas y banco propio',
    slides: [
      {
        tipo: 'portada',
        kicker: 'Para academias',
        titulo: 'Más de 4.600 preguntas **desde el primer día.**',
        sub: 'Y un banco propio que no ve nadie más.',
      },
      {
        tipo: 'lista',
        kicker: 'El banco común',
        items: [
          { h: 'Crece donde pesa el examen', p: 'Más preguntas en los temas que más caen.' },
          { h: 'Artículo por artículo', p: 'En los temas importantes, preguntas para cada uno.' },
          { h: 'Tres opciones explicadas', p: 'Por qué la correcta, y por qué no las otras dos.' },
          { h: 'Con el estilo del examen', p: 'Datos concretos y distractores que se parecen a la buena.' },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Tu banco',
        items: [
          { h: 'Alta a mano', p: 'Tus profesores escriben sus preguntas.' },
          { h: 'Importación desde Excel', p: 'Y cada fila rechazada sale con su número y el motivo.' },
          { h: 'Privado', p: 'Tus alumnos lo ven. Otra academia, no.' },
        ],
      },
      {
        tipo: 'texto',
        kicker: 'La misma vara',
        titulo: 'Lo que escribe tu profesor **pasa el mismo filtro.**',
        cuerpo:
          'Opciones repetidas, una celda vacía, la correcta mal marcada: se rechaza antes de llegar a un alumno.',
      },
      {
        tipo: 'cierre',
        titulo: 'Tu contenido y el nuestro, en el mismo motor.',
        cuerpo: 'Para academias de oposición a Policía Nacional.',
        accion: 'Pide una demo por DM',
      },
    ],
    pie: `Montar un banco de preguntas desde cero lleva años. Tu academia empieza con más de 4.600.

EL BANCO COMÚN
→ Crece donde pesa el examen real: más preguntas en los temas que más caen y, en los importantes, preguntas para cada artículo.
→ Cada explicación dice por qué la correcta está bien y por qué las otras dos están mal.
→ Estilo de examen real: datos concretos y distractores que se parecen a la respuesta buena.

TU BANCO
→ Tus profesores escriben sus preguntas a mano o las importan desde Excel.
→ Cada fila que no vale sale con su número y el motivo. Ninguna desaparece sin avisar.
→ Es privado: lo ven tus alumnos, no otra academia.

Y todo pasa el mismo filtro, lo escriba una persona o la IA: opciones repetidas, celdas vacías o la correcta mal marcada no llegan a ningún alumno.

Demo para academias: escríbenos por DM.`,
    hashtags: ['academiadeoposiciones', 'oposicionespolicia', 'policianacional', 'bancodepreguntas', 'profesores'],
    alt: 'Carrusel para academias sobre el banco de preguntas de Atenea: más de 4.600 preguntas comunes que crecen según el peso real del examen, con explicación de las tres opciones, y un banco privado de cada academia con alta manual e importación desde Excel validada.',
  },
];

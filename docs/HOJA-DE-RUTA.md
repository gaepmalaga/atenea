# Hoja de ruta del piloto con Alphapol

Estado: **propuesto, nada implementado** (11 nov 2026). Sale de las
conversaciones con el dueño del proyecto sobre cómo pasar la plataforma a
Alphapol y empezar con alumnos reales. Los días son **estimaciones sin medir**.

Aquí no hay dinero: lo económico se lleva aparte. Lo que se decida aquí se
apunta como regla en `docs/REGLAS.md` y su estado en `docs/TRASPASO.md`.

## 1 · Cómo se lanza (por fases)

| Fase | Qué | Notas |
|---|---|---|
| 0 · Preparar | Cuentas de Supabase y Vercel a nombre de Alphapol; alta en bloque solo de los veteranos; preparación física apagada; canal de comentarios listo | Antes de nada: Supabase Pro (copias de seguridad; el plan gratuito pausa a la semana sin actividad) |
| 1 · Veteranos, teoría | Presentación presencial en clase; 3-4 semanas de uso real; arreglos cada semana | El grupo de WhatsApp de comentarios se crea ese día, por enlace o QR (así no se ven los teléfonos entre sí) |
| 2 · + Física | Se encienden los interruptores de preparación física, con el mismo grupo | Los interruptores son **de toda la academia**, no por grupo (regla 68): vale mientras solo tengan cuenta los veteranos |
| 3 · Todos | Alta en bloque del resto y presentación a cada grupo | |

Para pasar de fase: uso semanal real, sin errores graves abiertos, comentarios
respondidos en pocos días y una encuesta corta de opinión (criterios a pactar).

## 2 · Código para el piloto

| # | Qué | Implica | Días |
|---|---|---|---|
| A1 | **Perfil editable:** nombre, apellidos, teléfono (opcional), foto | `profiles` hoy solo guarda correo, rol y fecha: columnas nuevas (cambio de esquema en producción, con su guion en `docs/sql/`), bucket de Storage, pantalla en «Mi Perfil», nombre en el panel «Alumnos». Teléfono y foto solo para el propio alumno y los preparadores de su academia | 3-4 |
| A2 | **Canal de comentarios con panel** | Botón «Enviar comentario» (error, idea, duda de pregunta) con texto y captura, que adjunte pantalla y dispositivo. Tabla nueva, subida a Storage, panel del preparador con estados (nuevo, en curso, resuelto) y respuesta visible al alumno. Hoy solo existe el reporte de una pregunta concreta (`question_reports`) | 2-4 |
| A3 | **Alta en bloque con nombre y teléfono** | `altaMasivaAlumnos` lee esas columnas de la hoja y las guarda | 1 |

A1 y A2 comparten Storage: se hacen juntos. **El esquema no se toca en la BD
real hasta que el proyecto esté en la cuenta de Alphapol** (para no tocarlo dos
veces).

**Abierto:** qué puede hacer el preparador con un alumno (editar datos, baja,
reactivar, alta suelta). Hoy solo suspender o activar el acceso.

## 3 · Preguntas con el temario de Alphapol

- **Por CSV** (`app/lib/question-import.ts`, hasta 500 por importación):
  cabecera `enunciado;A;B;C;correcta;explicacion;dificultad;tema`. Tres
  opciones, no cuatro.
- **Ojo:** lo importado a mano entra **activo** (`moderation.ts`), sin cola de
  revisión: alguien de la academia lee el CSV antes de subirlo.
- Las manuales no guardan de qué fragmento del temario salen (las de Gemini sí).
- **Plan:** un tema de prueba (40-50 preguntas), revisarlas y, si valen, seguir.
- **Por Gemini:** `npm run sembrar -- --comprobar-pdfs` (gratis) y
  `npm run sembrar:peso -- --ensayo` (qué generaría, gratis) antes de gastar.
  Solo el superadmin genera (reglas 39 y 75).
- Hace falta su temario en **PDF con texto seleccionable** (no escaneado).

## 4 · Menú de mejoras (para que ellos elijan)

| Tamaño | Mejora |
|---|---|
| Rápido (1-3 días) | Informe semanal por correo al preparador · recordatorios al alumno (racha, clase de mañana) · ficha PDF por alumno |
| Medio (3-7 días) | Señales de abandono avanzadas (hoy: `DIAS_ABANDONO = 14` sin entrar) · ranking opcional con percentil · preguntas aportadas por alumnos con marca «aportada por un alumno» y revisión previa · audio en preguntas (vídeo por enlace externo) · simulacro en directo |
| Grande (semanas) | Exámenes en PDF con marca de agua y QR · tutor con IA (el chat existe, apagado por la regla 58) · psicotécnicos e inglés · comparación con la nota de corte (la regla 77 decidió no adivinar el futuro: hablarlo antes) |

Audio: cabe en Supabase Storage (Pro incluye 100 GB de ficheros y 250 GB de
tráfico). Vídeo propio, no: mejor un servicio externo y solo el enlace.

## 5 · Tareas que no son de código

1. Supabase Pro y Vercel Pro **a nombre de Alphapol**: transferir los proyectos
   (conserva URL y claves) o copia limpia con `supabase/migrations/`. Después
   rotar `SUPABASE_SERVICE_ROLE_KEY` y la clave de Gemini, y revocar el token de
   gestión (§3a de `TRASPASO.md`).
2. Pedirles: temario en PDF, hoja con nombre y correo (y teléfono) del grupo de
   veteranos, y acceso a la plataforma que usan hoy para comparar.
3. Alta en bloque de los veteranos (regla 83), con la física apagada.
4. Avisar al grupo de para qué se usan sus datos (RGPD: la academia es la
   responsable).
5. Presentación en clase (30-45 min): qué es, instalarla en el móvil, un test
   juntos, cómo reportar (una pregunta y un comentario, en directo) y qué se
   espera de ellos.
6. Dejar por escrito qué se cede, qué cubre el mantenimiento, de quién es lo
   que se desarrolle desde ahora y la protección de datos.

## 6 · Orden propuesto

1. Cuentas Pro a nombre de Alphapol.
2. A1 + A2 + A3 juntos.
3. Preguntas de un tema, revisadas.
4. Alta de los veteranos, presentación y grupo de WhatsApp.
5. Las mejoras del menú, según lo que elijan.

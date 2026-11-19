"""
ESQUEMA DEL TEMA 1 EN DOCX EDITABLE (dos páginas A4 apaisadas).

    python3 -I esquema_docx.py salida.docx logotipo.png qr.png

Es el mismo esquema que el PDF, pero hecho con tablas y texto de Word de verdad:
se puede cambiar cualquier texto, color o cifra. El contenido es el de
`esquema-tema-01.mjs` (si se cambia allí, hay que cambiarlo aquí también).
"""
import re
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

salida, logo, qr = sys.argv[1], sys.argv[2], sys.argv[3]

MARINO, HONDO, ORO, ORO_OSC, ORO_CL = '14295A', '0C1A3D', 'C5A738', '8A6D12', 'E2C977'
AZUL, VERDE, FUEGO, FUEGO_OSC = '2A5DB0', '0F766E', 'D9531E', 'B9430F'
TEXTO = RGBColor(0x1A, 0x22, 0x38)
ANCHO = 28.1  # cm útiles


def rgb(h):
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


doc = Document()
sec = doc.sections[0]
sec.orientation = WD_ORIENT.LANDSCAPE
sec.page_width, sec.page_height = Cm(29.7), Cm(21.0)
sec.left_margin = sec.right_margin = Cm(0.8)
sec.top_margin, sec.bottom_margin = Cm(0.5), Cm(0.4)
sec.header_distance = sec.footer_distance = Cm(0)

st = doc.styles['Normal']
st.font.name = 'Calibri'
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
st.font.size = Pt(8)
st.font.color.rgb = TEXTO
st.paragraph_format.space_after = Pt(0)
st.paragraph_format.space_before = Pt(0)
st.paragraph_format.line_spacing = 1.0

# ─────────── utilidades ───────────
PARTES = re.compile(r'(\*\*.+?\*\*|==.+?==)')


def runs(par, texto, tam=None, color=None, negrita=False, cursiva=False, c_negrita=MARINO):
    for t in PARTES.split(texto):
        if not t:
            continue
        b, marca = negrita, False
        if t.startswith('**') and t.endswith('**'):
            t, b = t[2:-2], True
        elif t.startswith('==') and t.endswith('=='):
            t, b, marca = t[2:-2], True, True
        r = par.add_run(t)
        r.bold = b
        r.italic = cursiva
        if tam:
            r.font.size = Pt(tam)
        if marca:
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            r.font.color.rgb = rgb(HONDO)
        elif b and c_negrita and color is None:
            r.font.color.rgb = rgb(c_negrita)
        elif color:
            r.font.color.rgb = rgb(color) if isinstance(color, str) else color


def sombra(celda, h):
    tcPr = celda._tc.get_or_add_tcPr()
    for e in tcPr.findall(qn('w:shd')):
        tcPr.remove(e)
    s = OxmlElement('w:shd')
    s.set(qn('w:val'), 'clear')
    s.set(qn('w:color'), 'auto')
    s.set(qn('w:fill'), h)
    tcPr.append(s)


def bordes(celda, **lados):
    tcPr = celda._tc.get_or_add_tcPr()
    for e in tcPr.findall(qn('w:tcBorders')):
        tcPr.remove(e)
    b = OxmlElement('w:tcBorders')
    for lado in ('top', 'left', 'bottom', 'right'):
        e = OxmlElement(f'w:{lado}')
        v = lados.get(lado)
        if v:
            e.set(qn('w:val'), v[2] if len(v) > 2 else 'single')
            e.set(qn('w:sz'), str(v[0]))
            e.set(qn('w:color'), v[1])
        else:
            e.set(qn('w:val'), 'nil')
        b.append(e)
    tcPr.append(b)


def margen(celda, a=40, b=40, i=80, d=80):
    tcPr = celda._tc.get_or_add_tcPr()
    for e in tcPr.findall(qn('w:tcMar')):
        tcPr.remove(e)
    m = OxmlElement('w:tcMar')
    for lado, v in (('top', a), ('left', i), ('bottom', b), ('right', d)):
        e = OxmlElement(f'w:{lado}')
        e.set(qn('w:w'), str(v))
        e.set(qn('w:type'), 'dxa')
        m.append(e)
    tcPr.append(m)


def fija(tabla, anchos_cm):
    tabla.autofit = False
    tabla.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = tabla._tbl.tblPr
    for e in tblPr.findall(qn('w:tblW')) + tblPr.findall(qn('w:tblLayout')):
        tblPr.remove(e)
    w = OxmlElement('w:tblW')
    w.set(qn('w:w'), str(int(sum(anchos_cm) * 567)))
    w.set(qn('w:type'), 'dxa')
    tblPr.append(w)
    lay = OxmlElement('w:tblLayout')
    lay.set(qn('w:type'), 'fixed')
    tblPr.append(lay)
    grid = tabla._tbl.tblGrid
    for col, cm in zip(grid.findall(qn('w:gridCol')), anchos_cm):
        col.set(qn('w:w'), str(int(cm * 567)))
    for fila in tabla.rows:
        for celda, cm in zip(fila.cells, anchos_cm):
            celda.width = Cm(cm)


def altura(fila, cm, exacta=False):
    trPr = fila._tr.get_or_add_trPr()
    h = OxmlElement('w:trHeight')
    h.set(qn('w:val'), str(int(cm * 567)))
    h.set(qn('w:hRule'), 'exact' if exacta else 'atLeast')
    trPr.append(h)


def no_partir(fila):
    fila._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))


def tabla(contenedor, filas, cols, anchos):
    t = contenedor.add_table(rows=filas, cols=cols)
    fija(t, anchos)
    for f in t.rows:
        for c in f.cells:
            bordes(c)
            margen(c)
    return t


def par(celda, texto='', tam=8, color=None, negrita=False, cursiva=False, alinea=None, antes=0, despues=1, primero=False, c_negrita=MARINO):
    p = celda.paragraphs[0] if primero and not celda.paragraphs[0].text and not celda.paragraphs[0].runs else celda.add_paragraph()
    p.paragraph_format.space_before = Pt(antes)
    p.paragraph_format.space_after = Pt(despues)
    if alinea:
        p.alignment = alinea
    if texto:
        runs(p, texto, tam, color, negrita, cursiva, c_negrita)
    return p


def viñeta(celda, texto, tam=7.2, despues=0.6, color=None, c_negrita=MARINO):
    p = celda.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.28)
    p.paragraph_format.first_line_indent = Cm(-0.28)
    p.paragraph_format.space_after = Pt(despues)
    r = p.add_run('● ')
    r.font.size = Pt(5.5)
    r.font.color.rgb = rgb(ORO)
    runs(p, texto, tam, color, c_negrita=c_negrita)
    return p


def vacio_final(celda):
    """Word exige un párrafo detrás de una tabla anidada: lo dejamos mínimo."""
    p = celda.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = Pt(1)
    rPr = OxmlElement('w:rPr')
    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), '2')
    rPr.append(sz)
    p._p.get_or_add_pPr().append(rPr)
    return p


def espacio(pts=2):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = Pt(pts)
    p.paragraph_format.space_after = Pt(0)
    return p


def real(celda, anio, texto, color=FUEGO, fondo='FFFFFF'):
    t = celda.add_table(rows=1, cols=2)
    fija(t, [0.9, celda.width.cm - 0.5 - 0.9 - 0.2 if celda.width else 8])
    a, b = t.rows[0].cells
    for c in (a, b):
        bordes(c, top=(4, 'F0C9B2'), bottom=(4, 'F0C9B2'), right=(4, 'F0C9B2'))
        margen(c, 25, 25, 50, 50)
        sombra(c, fondo)
    bordes(a, left=(24, color), top=(4, 'F0C9B2'), bottom=(4, 'F0C9B2'))
    par(a, anio, 6.8, 'FFFFFF', True, primero=True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
    sombra(a, color)
    par(b, texto, 6.8, primero=True, despues=0)
    vacio_final(celda)


def banda(titulo, subtitulo, color, texto_color='FFFFFF', badge=None, ancho=None):
    pass


def logo_celda(celda, ancho_cm):
    p = celda.paragraphs[0]
    p.add_run().add_picture(logo, width=Cm(ancho_cm))


# ─────────── CABECERA (se repite en las dos páginas) ───────────
def cabecera(titulo, em, subtitulo):
    t = tabla(doc, 1, 4, [5.3, 14.2, 6.1, 2.5])
    f = t.rows[0]
    altura(f, 1.25)
    for c in f.cells:
        sombra(c, MARINO)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        margen(c, 40, 40, 120, 80)
        bordes(c, bottom=(30, ORO))
    c0, c1, c2, c3 = f.cells
    p = c0.paragraphs[0]
    p.add_run().add_picture(logo, height=Cm(0.95))
    p = c1.paragraphs[0]
    r = p.add_run(titulo.upper() + ' ')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(20), 'Arial Narrow', rgb('FFFFFF')
    r = p.add_run(em.upper())
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(20), 'Arial Narrow', rgb(ORO_CL)
    par(c1, subtitulo, 7.5, 'C9D4EE', despues=0)
    p = c2.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p.add_run('ESCALA')
    r.bold, r.font.size, r.font.color.rgb = True, Pt(7), rgb(ORO_CL)
    p = par(c2, '', despues=0, alinea=WD_ALIGN_PARAGRAPH.RIGHT)
    r = p.add_run('BÁSICA · CIENCIAS JURÍDICAS')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(13), 'Arial Narrow', rgb('FFFFFF')
    p = c3.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('TEMA ')
    r.bold, r.font.size, r.font.color.rgb = True, Pt(7), rgb(ORO_CL)
    r = p.add_run('1')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(26), 'Arial Narrow', rgb(ORO)


def pie(texto_izq, pagina):
    espacio(2)
    t = tabla(doc, 1, 2, [20.1, 8.0])
    c1, c2 = t.rows[0].cells
    for c in (c1, c2):
        bordes(c, top=(12, ORO))
    par(c1, texto_izq, 6.5, '5B6478', primero=True, despues=0, c_negrita=MARINO)
    par(c2, f'**T1 |** EL DERECHO · página {pagina} de 2 — Contenido para uso personal de estudio', 6.5, MARINO, alinea=WD_ALIGN_PARAGRAPH.RIGHT, primero=True, despues=0, c_negrita=ORO_OSC)


# ═══════════════════ PÁGINA 1 ═══════════════════
cabecera('El Derecho:', 'lo que de verdad cae', 'Esquema con radar de examen · Código Civil, Título Preliminar y Libro I')
espacio(3)

# Radar
t = tabla(doc, 1, 3, [3.0, 17.6, 7.5])
f = t.rows[0]
altura(f, 1.2)
for c in f.cells:
    sombra(c, 'FFFFFF')
    bordes(c, top=(4, 'DDD8C9'), bottom=(4, 'DDD8C9'), left=(4, 'DDD8C9'), right=(4, 'DDD8C9'))
    c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
a, b, c = f.cells
p = par(a, '', primero=True, alinea=WD_ALIGN_PARAGRAPH.CENTER, despues=0)
r = p.add_run('11')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(22), 'Arial Narrow', rgb(MARINO)
par(a, 'PREGUNTAS\n2021 – 2025', 6.5, 'B08A12', True, alinea=WD_ALIGN_PARAGRAPH.CENTER, despues=0)
par(b, 'Así se reparte el **Tema 1** en los 5 últimos exámenes oficiales de Escala Básica: **donde cae, estudia más.**', 8, '5B6478', primero=True, despues=2)
barra = b.add_table(rows=1, cols=4)
fija(barra, [8.2, 2.5, 2.4, 2.7])
for cel, (txt, col) in zip(barra.rows[0].cells, [('NACIONALIDAD · 7', FUEGO), ('VECINDAD · 2', AZUL), ('PERSONA · 1', VERDE), ('NORMA · 1', MARINO)]):
    sombra(cel, col)
    bordes(cel, left=(12, 'FFFFFF'))
    margen(cel, 30, 30, 40, 40)
    par(cel, txt, 8, 'FFFFFF', True, primero=True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
vacio_final(b)
par(c, '❄ **Aún no han caído:** jerarquía normativa, fuentes, domicilio, capacidad y personas jurídicas. Vale la pena saberlas, pero no son prioridad.', 7.2, '5B6478', primero=True, despues=0)
espacio(3)

# Tres zonas
zonas = tabla(doc, 1, 3, [10.9, 8.0, 7.2])
zf = zonas.rows[0]
for c in zf.cells:
    margen(c, 0, 0, 30, 30)


def zona(celda, num, titulo, kicker, calor, color, fondo, texto_header='FFFFFF'):
    celda.paragraphs[0].paragraph_format.space_after = Pt(0)
    celda.paragraphs[0].paragraph_format.line_spacing = Pt(1)
    ancho = celda.width.cm - 0.2
    z = celda.add_table(rows=4, cols=1)
    fija(z, [ancho])
    for fila in z.rows:
        c = fila.cells[0]
        sombra(c, fondo)
        bordes(c, left=(6, 'C9D4EE'), right=(6, 'C9D4EE'))
        margen(c, 30, 20, 90, 90)
    h = z.rows[0].cells[0]
    sombra(h, color)
    bordes(h)
    margen(h, 50, 40, 110, 100)
    p = par(h, '', primero=True, despues=0)
    r = p.add_run(f'{num}  ')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(18), 'Arial Narrow', rgb(ORO_CL if color != ORO else MARINO)
    r = p.add_run(titulo.upper())
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(12.5), 'Arial Narrow', rgb(texto_header)
    par(h, f'{kicker}   ·   {calor}', 7, 'DBE4F7', True, despues=0, c_negrita=None)
    vacio_final(celda)
    return z


def bloque_titulo(c, texto, sub=None, color=MARINO):
    p = par(c, '', despues=1, primero=True)
    r = p.add_run(texto.upper())
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(9.5), 'Arial Narrow', rgb(color)
    if sub:
        r = p.add_run('   ' + sub)
        r.font.size, r.font.color.rgb = Pt(7), rgb('5B6478')


# ── Zona 1 · Nacionalidad ──
z1 = zona(zf.cells[0], '1', 'La nacionalidad española', 'Arts. 17-28 del Código Civil', '🔥 Cae mucho · 7 de 11', FUEGO_OSC, 'FDF0E8')
c = z1.rows[1].cells[0]
bloque_titulo(c, 'Españoles de origen', 'Art. 17')
viñeta(c, 'Hijos de **padre o madre españoles**.')
viñeta(c, 'Nacidos en España de extranjeros si **uno nació también aquí** (no hijos de diplomáticos).')
viñeta(c, 'Nacidos en España de padres **sin nacionalidad** o con **filiación no determinada**.')
real(c, '2025', '¿Españoles de origen? → **nacidos de padre o madre españoles** (17.1.a).')
c = z1.rows[2].cells[0]
bloque_titulo(c, 'Cómo se adquiere', 'Opción · carta de naturaleza · residencia')
viñeta(c, '**Opción** (20): quien esté o haya estado bajo patria potestad de un español. Adoptado mayor de 18: **2 años** (19.2).')
viñeta(c, '**Carta de naturaleza:** Real Decreto discrecional (21.1). **Residencia** legal (22):')
ch = c.add_table(rows=1, cols=4)
fija(ch, [1.6, 2.2, 3.6, 2.4])
for cel, (txt, ng) in zip(ch.rows[0].cells, [('10 años', True), ('5 · refugiados', False), ('2 · iberoamericanos, Andorra, Filipinas, G. Ecuatorial, Portugal, sefardíes', False), ('1 · casos del 22.2', False)]):
    sombra(cel, MARINO if ng else 'FFFFFF')
    bordes(cel, top=(8, ORO), bottom=(8, ORO), left=(8, ORO), right=(8, ORO))
    margen(cel, 20, 20, 40, 40)
    par(cel, txt, 6.5, ORO_CL if ng else MARINO, True, primero=True, despues=0, c_negrita=None)
vacio_final(c)
ps = c.add_table(rows=1, cols=3)
fija(ps, [3.2, 2.9, 3.0])
for cel, (n, txt) in zip(ps.rows[0].cells, [('1', 'Jurar fidelidad y obediencia'), ('2', 'Renunciar a la anterior'), ('3', 'Inscribir en el Registro')]):
    sombra(cel, MARINO)
    bordes(cel, left=(12, 'FFFFFF'))
    margen(cel, 30, 30, 50, 40)
    p = par(cel, '', primero=True, despues=0)
    r = p.add_run(n + ' ')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(10), 'Arial Narrow', rgb(ORO_CL)
    r = p.add_run(txt)
    r.font.size, r.font.color.rgb = Pt(6.5), rgb('FFFFFF')
vacio_final(c)
real(c, '2024', '¿Para quién **no basta** 2 años? → **Mónaco no está** en la lista (22.1). ¿Y 1 año? → quien **no ejerció la opción** a tiempo (22.2).')
real(c, '2022', 'Adoptada **a los 19 años** → **opta en 2 años** (19.2). **2023:** patria potestad de español → opta (20.1.a).')
c = z1.rows[3].cells[0]
bloque_titulo(c, 'Perder y recuperar', 'Arts. 24-26')
viñeta(c, 'Emancipados residentes fuera que **adquieren otra voluntariamente**: la pierden a los **3 años** salvo que declaren conservarla.')
viñeta(c, '**No originarios:** 3 años usando solo la anterior, o servir en armas extranjeras contra la prohibición del Gobierno. ==En guerra no se pierde.==')
real(c, '2021', '**Recuperar** (26): residir legalmente, **declararlo ante el Registro Civil** e inscribirlo.')

# ── Zona 2 · Vecindad y persona ──
z2 = zona(zf.cells[1], '2', 'Vecindad y persona', 'Arts. 14-15, 29-41', '🔥 Cae · 3 de 11', AZUL, 'E8F0FB')
c = z2.rows[1].cells[0]
bloque_titulo(c, 'Vecindad civil', 'Arts. 14-15 · derecho común o foral', AZUL)
viñeta(c, '**Hijos:** la de los padres; si difiere, la del primero con filiación determinada, luego la del lugar de nacimiento. Padres: **6 meses** para elegir; hijo: desde los **14 años**.')
viñeta(c, '**Se adquiere** por **2 años** de residencia (si se declara) o **10 años** (sin declaración en contra).')
real(c, '2023', '**El matrimonio no altera** la vecindad civil. **2024:** se adquiere por **2 años** de residencia continuada si se manifiesta.', AZUL)
c = z2.rows[2].cells[0]
bloque_titulo(c, 'La persona física', 'Arts. 29-33', AZUL)
viñeta(c, '**Nace** con vida y **entero desprendimiento del seno materno** (30); el **concebido** cuenta si le favorece (29). Se **extingue por la muerte** (32); en la duda, **a la vez** (33).')
cap = c.add_table(rows=1, cols=2)
fija(cap, [3.7, 3.9])
for cel, (tit, txt, col) in zip(cap.rows[0].cells, [('CAPACIDAD JURÍDICA', 'Ser **titular** de derechos. Desde el **nacimiento**.', AZUL), ('CAPACIDAD DE OBRAR', '**Ejercerlos** uno mismo. Plena a los **18 años** (315).', ORO)]):
    sombra(cel, 'FFFFFF')
    bordes(cel, top=(8, col), bottom=(8, col), left=(8, col), right=(8, col))
    margen(cel, 25, 25, 50, 50)
    par(cel, tit, 8.5, col if col != ORO else ORO_OSC, True, primero=True, despues=0, c_negrita=None)
    par(cel, txt, 7.5, despues=0)
vacio_final(c)
real(c, '2024', 'Art. 30: personalidad **al nacer con vida**, ya desprendido del seno materno.', AZUL)
c = z2.rows[3].cells[0]
bloque_titulo(c, 'Domicilio y personas jurídicas', 'Arts. 35-41 · ❄ aún sin caer', AZUL)
viñeta(c, '**Domicilio:** la ==residencia habitual== (40). En personas jurídicas, el de su ley o estatutos, o donde esté su representación legal (41).')
viñeta(c, '**Personas jurídicas** (35): corporaciones, asociaciones y fundaciones de interés público, y asociaciones de interés particular.')

# ── Zona 3 · Norma y fuentes ──
z3 = zona(zf.cells[2], '3', 'Norma y fuentes', 'Título Preliminar · 1-7', '❄ Cae poco · 1 de 11', MARINO, 'E9EEFA')
c = z3.rows[1].cells[0]
bloque_titulo(c, 'El Derecho y la norma', 'Concepto, estructura y clases')
viñeta(c, '**Objetivo** (conjunto de normas) y **subjetivo** (facultad de una persona); también **ciencia** y **justicia**.')
eq = c.add_table(rows=1, cols=3)
fija(eq, [3.0, 0.6, 3.3])
for cel, (a, b_, col) in zip(eq.rows[0].cells, [('SUPUESTO DE HECHO', 'Lo que ocurre', MARINO), ('→', '', None), ('CONSECUENCIA JURÍDICA', 'El efecto', ORO)]):
    if col:
        sombra(cel, 'FFFFFF' if col == MARINO else 'FFF9E0')
        bordes(cel, top=(8, col), bottom=(8, col), left=(8, col), right=(8, col))
    margen(cel, 20, 20, 40, 40)
    cel.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    par(cel, a, 6.5 if col else 12, '5B6478' if col else ORO_OSC, True, primero=True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
    if b_:
        par(cel, b_, 8, MARINO, True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
vacio_final(c)
viñeta(c, '**Imperativas** ordenan y **prohibitivas** prohíben (lo contrario es ==nulo==, 6.3); **dispositivas**: valen si no se pacta otra cosa.')
real(c, '2025', 'Precepto general que ordena la convivencia y se impone por la fuerza → **norma jurídica positiva**.', MARINO)
c = z3.rows[2].cells[0]
bloque_titulo(c, 'Fuentes y jerarquía', 'Art. 1 · manda el rango superior')
fl = c.add_table(rows=1, cols=3)
fija(fl, [2.1, 2.5, 2.7])
for cel, (n, t_, s_) in zip(fl.rows[0].cells, [('1.º', 'Ley', ''), ('2.º', 'Costumbre', 'a falta de ley'), ('3.º', 'Principios', 'a falta de ambas')]):
    sombra(cel, 'FFFFFF')
    bordes(cel, top=(8, AZUL), bottom=(8, AZUL), left=(8, AZUL), right=(8, AZUL))
    margen(cel, 20, 20, 40, 40)
    par(cel, n, 7, AZUL, True, primero=True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
    par(cel, t_, 9, MARINO, True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
    if s_:
        par(cel, s_, 6.5, '5B6478', despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER)
vacio_final(c)
pir = c.add_table(rows=4, cols=1)
fija(pir, [7.1])
for fila, (txt, col, sub) in zip(pir.rows, [('Constitución', HONDO, ''), ('Tratados internacionales', MARINO, 'tras publicarse en el BOE (1.5)'), ('Leyes', AZUL, 'orgánicas y ordinarias · decretos-leyes'), ('Reglamentos', '5E86C8', '')]):
    cel = fila.cells[0]
    sombra(cel, col)
    bordes(cel, bottom=(12, 'E9EEFA'))
    margen(cel, 20, 20, 60, 60)
    par(cel, txt + (f'  —  {sub}' if sub else ''), 7.8, 'FFFFFF', True, primero=True, despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER, c_negrita=None)
vacio_final(c)
c = z3.rows[3].cells[0]
bloque_titulo(c, 'Eficacia de las leyes', 'Arts. 2 y 6')
viñeta(c, '**Vigor a los 20 días** de su publicación completa en el BOE.')
viñeta(c, 'Las **deroga otra posterior**; no son retroactivas salvo que lo digan.')
viñeta(c, '==La ignorancia de las leyes no excusa su cumplimiento.==')
espacio(3)

# Banda inferior
b = tabla(doc, 1, 3, [10.6, 8.6, 8.9])
c1, c2, c3 = b.rows[0].cells
altura(b.rows[0], 2.9)
for cel, fondo in ((c1, MARINO), (c2, 'FFFFFF'), (c3, MARINO)):
    sombra(cel, fondo)
    margen(cel, 60, 40, 120, 120)
    cel.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    if fondo == 'FFFFFF':
        bordes(cel, top=(4, 'DDD8C9'), bottom=(4, 'DDD8C9'), left=(4, 'DDD8C9'), right=(4, 'DDD8C9'))
    else:
        bordes(cel, bottom=(24, ORO))
p = par(c1, '', primero=True, despues=2)
r = p.add_run('NÚMEROS QUE SE PREGUNTAN')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(12), 'Arial Narrow', rgb('FFFFFF')
nm = c1.add_table(rows=2, cols=3)
fija(nm, [3.2, 3.2, 3.5])
cifras = [('10·5·2·1', 'residencia para ser español'), ('3 años', 'para perder la nacionalidad'), ('2·10 años', 'vecindad civil por residencia'),
          ('180 días', 'caduca si no comparece'), ('14 años', 'jurar y optar con asistencia'), ('20 días', 'entrada en vigor de una ley')]
for i, cel in enumerate([x for f in nm.rows for x in f.cells]):
    bordes(cel, top=(12, ORO))
    margen(cel, 20, 30, 40, 60)
    par(cel, cifras[i][0], 12, ORO_CL, True, primero=True, despues=0, c_negrita=None).runs[0].font.name = 'Arial Narrow'
    par(cel, cifras[i][1], 6.5, 'CFD9F2', despues=0)
vacio_final(c1)
p = par(c2, '', primero=True, despues=2)
r = p.add_run('TRUCOS PARA NO FALLAR')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(12), 'Arial Narrow', rgb(MARINO)
viñeta(c2, '**10·5·2·1** = escalera: cuanto más cerca, menos años.', 7.8)
viñeta(c2, '**L-C-P:** Ley, Costumbre, Principios generales.', 7.8)
viñeta(c2, '**Origen** = nace español; el resto, se adquiere.', 7.8)
viñeta(c2, '**1 año** basta: nacido en España, casado con español, viudo, nieto de español…', 7.8)
inner = c3.add_table(rows=1, cols=2)
fija(inner, [2.6, 5.9])
for cel in inner.rows[0].cells:
    cel.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    bordes(cel)
q, tx = inner.rows[0].cells
sombra(q, 'FFFFFF')
q.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
q.paragraphs[0].add_run().add_picture(qr, width=Cm(2.0))
p = par(tx, '', primero=True, despues=2)
r = p.add_run('PRACTICA ESTE TEMA EN EL CAMPUS')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(12), 'Arial Narrow', rgb(ORO_CL)
par(tx, 'Escanea y entrena con **167 preguntas del Tema 1**, corregidas al momento y con explicación de cada respuesta.', 7.4, 'CFD9F2', despues=0, c_negrita=ORO_CL)
vacio_final(c3)

pie('**ALPHAPOL** · Centro de formación · Málaga | campus.alphapol.es — Fuente: Código Civil (BOE-A-1889-4763). Radar: exámenes oficiales 2021-2025, contados por Alphapol.', 1)

# ═══════════════════ PÁGINA 2 ═══════════════════
_salto = doc.add_paragraph()
_salto.paragraph_format.page_break_before = True
_salto.paragraph_format.line_spacing = Pt(1)
_salto.paragraph_format.space_after = Pt(0)
_rp = OxmlElement('w:rPr'); _sz = OxmlElement('w:sz'); _sz.set(qn('w:val'), '2'); _rp.append(_sz); _salto._p.get_or_add_pPr().append(_rp)
cabecera('La nacionalidad', 'paso a paso', 'Es el 64 % de lo que ha caído del Tema 1: aquí está entera, en orden y con las trampas')
espacio(4)

fl2 = tabla(doc, 1, 4, [2.9, 9.0, 9.2, 7.0])
fl2.rows[0].cells[0].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
q0 = fl2.rows[0].cells[0]
sombra(q0, MARINO)
bordes(q0, bottom=(24, ORO))
margen(q0, 60, 60, 80, 80)
par(q0, '', primero=True, despues=0)
p = par(q0, '', despues=0, alinea=WD_ALIGN_PARAGRAPH.CENTER)
r = p.add_run('¿CÓMO SE ES ESPAÑOL?')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(15), 'Arial Narrow', rgb(ORO_CL)
par(q0, 'ARTS. 17 A 26', 7, 'C9D4EE', True, alinea=WD_ALIGN_PARAGRAPH.CENTER, despues=0, c_negrita=None)


def nodo(celda, letra, titulo, kicker, color):
    n = celda.add_table(rows=2, cols=1)
    fija(n, [celda.width.cm - 0.2])
    h, cu = n.rows[0].cells[0], n.rows[1].cells[0]
    sombra(h, color)
    bordes(h)
    margen(h, 40, 40, 100, 80)
    p = par(h, '', primero=True, despues=0)
    r = p.add_run(f'{letra} · {titulo}'.upper())
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(11), 'Arial Narrow', rgb('FFFFFF')
    r = p.add_run('    ' + kicker.upper())
    r.bold, r.font.size, r.font.color.rgb = True, Pt(6.5), rgb('E8EEFC')
    sombra(cu, 'FFFFFF')
    bordes(cu, left=(6, 'DDD8C9'), right=(6, 'DDD8C9'), bottom=(6, 'DDD8C9'))
    margen(cu, 60, 60, 100, 100)
    vacio_final(celda)
    return cu


cu = nodo(fl2.rows[0].cells[1], 'A', 'Se nace español', 'Origen · art. 17', FUEGO_OSC)
viñeta(cu, '**Hijos de padre o madre españoles** (la que cayó en 2025).', 8.5)
viñeta(cu, '**Nacidos en España** de extranjeros si **uno nació también aquí** (no hijos de diplomáticos).', 8.5)
viñeta(cu, 'Nacidos en España de padres **sin nacionalidad** atribuible o con **filiación no determinada**.', 8.5)
viñeta(cu, 'Si la filiación se determina **después de los 18**: **opta en 2 años** (17.2).', 8.5)
cu = nodo(fl2.rows[0].cells[2], 'B', 'Se tiene derecho a optar', 'Opción · art. 20', AZUL)
viñeta(cu, '**Están o han estado bajo la patria potestad** de un español (cayó en 2023).', 8.5)
viñeta(cu, 'Padre o madre **originariamente español y nacido en España** (**sin límite de edad**).', 8.5)
viñeta(cu, '**Adoptado mayor de 18** (19.2) → **2 años** desde la adopción (cayó en 2022).', 8.5)
par(cu, '**Quién declara:** <14 años, su representante · ≥14, asistido por él · emancipado o ≥18, **por sí solo**. Caduca a los **20 años**.', 7.5, '1A2238', despues=0)
cu = nodo(fl2.rows[0].cells[3], 'C', 'Carta de naturaleza', 'Art. 21.1', VERDE)
viñeta(cu, 'La da el **Gobierno por Real Decreto**, de forma **discrecional**.', 8.5)
viñeta(cu, 'Hacen falta **circunstancias excepcionales** en el interesado.', 8.5)
espacio(4)

dobl = tabla(doc, 1, 2, [16.5, 11.6])
lc, rc = dobl.rows[0].cells
for cel in (lc, rc):
    sombra(cel, 'FFFFFF')
    bordes(cel, top=(4, 'DDD8C9'), bottom=(4, 'DDD8C9'), left=(4, 'DDD8C9'), right=(4, 'DDD8C9'))
    margen(cel, 60, 60, 120, 120)
p = par(lc, '', primero=True, despues=2)
r = p.add_run('D · POR RESIDENCIA: LA ESCALERA')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(13), 'Arial Narrow', rgb(MARINO)
r = p.add_run('    Art. 22 · legal, continuada e inmediatamente anterior a la petición')
r.font.size, r.font.color.rgb = Pt(7.5), rgb('5B6478')
esc = lc.add_table(rows=1, cols=4)
fija(esc, [3.2, 3.2, 4.6, 5.0])
altura(esc.rows[0], 3.2)
colores = [HONDO, MARINO, AZUL, '5E86C8']
textos = [('10', 'AÑOS', '**Regla general**'), ('5', 'AÑOS', '**Refugiados**'),
          ('2', 'AÑOS', '**Iberoamérica, Andorra, Filipinas, G. Ecuatorial, Portugal** y **sefardíes**\n==Mónaco NO está=='),
          ('1', 'AÑO', 'Nacido en España · **no ejerció la opción** a tiempo · tutela o acogimiento 2 años · casado 1 año · viudo · nieto de español')]
for cel, col, (n, u, tx) in zip(esc.rows[0].cells, colores, textos):
    sombra(cel, col)
    bordes(cel, left=(14, 'FFFFFF'))
    margen(cel, 50, 50, 90, 70)
    p = par(cel, '', primero=True, despues=0)
    r = p.add_run(n + ' ')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(28), 'Arial Narrow', rgb(ORO_CL)
    r = p.add_run(u)
    r.bold, r.font.size, r.font.color.rgb = True, Pt(8), rgb('FFFFFF')
    par(cel, tx, 7.8, 'FFFFFF', despues=0, c_negrita='FFFFFF')
vacio_final(lc)
p = par(lc, '', antes=4, despues=2)
r = p.add_run('Y LUEGO, SIEMPRE (ART. 23)')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(10.5), 'Arial Narrow', rgb(ORO_OSC)
rq = lc.add_table(rows=1, cols=4)
fija(rq, [4.2, 4.2, 3.4, 3.7])
for cel, (n, tx, col) in zip(rq.rows[0].cells, [('1', 'Jurar o prometer fidelidad al **Rey** y obediencia a la CE y a las leyes (≥14 años)', MARINO), ('2', '**Renunciar** a la anterior (salvo los de la lista del 24.1 y sefardíes)', MARINO), ('3', '**Inscribir** en el Registro Civil', MARINO), ('180', 'días para comparecer, o **caduca** (21.4)', FUEGO_OSC)]):
    sombra(cel, col)
    bordes(cel, left=(14, 'FFFFFF'))
    margen(cel, 40, 40, 70, 60)
    p = par(cel, '', primero=True, despues=0)
    r = p.add_run(n + ' ')
    r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(14), 'Arial Narrow', rgb(ORO_CL if col == MARINO else 'FFFFFF')
    runs(p, tx, 7.8, 'FFFFFF', c_negrita=ORO_CL if col == MARINO else 'FFFFFF')
vacio_final(lc)

p = par(rc, '', primero=True, despues=2)
r = p.add_run('PERDER Y RECUPERAR')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(13), 'Arial Narrow', rgb(MARINO)
r = p.add_run('    Arts. 24 a 26')
r.font.size, r.font.color.rgb = Pt(7.5), rgb('5B6478')
for tx in [
    '⏳ **3 años** viviendo fuera, siendo emancipado y **adquiriendo otra nacionalidad voluntariamente** (o usando solo la extranjera) → **se pierde**… salvo que se **declare conservarla** en ese plazo.',
    '⛔ **No originarios:** 3 años usando solo la anterior, o servir en armas / cargo político extranjero **contra la prohibición del Gobierno**.',
    '🛡 ==En guerra no se pierde== (24.4). Ningún español **de origen** puede ser privado de ella (art. 11 CE).',
    '↩ **Recuperar (26):** residir legalmente · **declararlo ante el Registro Civil** (cayó en 2021) · inscribirlo.',
]:
    p = par(rc, tx, 8.8, antes=3, despues=3)
espacio(4)

ts = tabla(doc, 1, 3, [4.0, 16.4, 7.7])
altura(ts.rows[0], 2.3)
for cel in ts.rows[0].cells:
    sombra(cel, MARINO)
    bordes(cel, bottom=(24, ORO))
    margen(cel, 60, 60, 120, 100)
    cel.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
a, b, c = ts.rows[0].cells
p = par(a, '', primero=True, despues=0)
r = p.add_run('TEST RELÁMPAGO')
r.bold, r.font.size, r.font.name, r.font.color.rgb = True, Pt(14), 'Arial Narrow', rgb(ORO_CL)
par(a, 'Contesta sin mirar.', 7, 'C9D4EE', despues=0)
for i, tx in enumerate([
    'Un joven de 20 años, adoptado por españoles el año pasado, ¿cuánto tiempo tiene para optar? **(A)** 1 año **(B)** 2 años **(C)** 10 años',
    '¿Qué país de la lista tiene derecho a los 2 años de residencia? **(A)** Mónaco **(B)** Filipinas **(C)** Italia',
    'Concedida la residencia, ¿cuántos días hay para comparecer? **(A)** 90 **(B)** 180 **(C)** 365',
    '¿Cuántos años fuera, con otra nacionalidad voluntaria, para perder la española (sin declarar)? **(A)** 3 **(B)** 5 **(C)** 10',
], 1):
    par(b, f'{i}. ' + tx, 8.2, 'E8EEFC', primero=(i == 1), despues=1.5, c_negrita=ORO_CL)
par(c, '**Soluciones:**\n1-B (art. 19.2) · 2-B (art. 22.1)\n3-B (art. 21.4) · 4-A (art. 24.1)', 8, ORO_CL, primero=True, despues=0, c_negrita=ORO_CL)

pie('**ALPHAPOL** · Centro de formación · Málaga | campus.alphapol.es — Fuente: Código Civil (BOE-A-1889-4763), texto consolidado y Constitución española, art. 11.', 2)

doc.core_properties.title = 'Alphapol · Tema 1 · Esquema (editable)'
doc.core_properties.author = 'Alphapol'
doc.save(salida)
print('DOCX', salida)

"""
DOCX del tema completo, con la marca de Alphapol. Lo llama tema-completo.mjs con
el contenido en JSON:

    python3 -I tema_completo_docx.py contenido.json salida.docx logo.jpg
"""
import json
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_BREAK, WD_COLOR_INDEX, WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Cm, RGBColor, Emu

MARINO = RGBColor(0x14, 0x29, 0x5A)
HONDO = '0C1A3D'
ORO = RGBColor(0xC5, 0xA7, 0x38)
ORO_OSCURO = RGBColor(0x8A, 0x6D, 0x12)
ORO_CLARO = RGBColor(0xE2, 0xC9, 0x77)
AZUL = RGBColor(0x2A, 0x5D, 0xB0)
FUEGO = RGBColor(0xD9, 0x53, 0x1E)
TEXTO = RGBColor(0x1A, 0x22, 0x38)
SUAVE = RGBColor(0x5B, 0x64, 0x78)
ANCHO_CM = 17.0  # ancho útil de la página
FUENTE = 'Calibri'

datos = json.load(open(sys.argv[1], encoding='utf-8'))
salida = sys.argv[2]
logo = sys.argv[3] if len(sys.argv) > 3 else None
meta, secciones, reales, test = datos['meta'], datos['secciones'], datos['realesPorAnio'], datos['test']
LETRAS = 'ABC'

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2)
sec.top_margin, sec.bottom_margin = Cm(1.8), Cm(2)
sec.different_first_page_header_footer = True  # la portada sin pie


def hexcolor(c):
    return '%02X%02X%02X' % (c[0], c[1], c[2])


def estilo(nombre, tam, color=TEXTO, negrita=False, fuente=FUENTE):
    st = doc.styles[nombre]
    st.font.name = fuente
    st.element.rPr.rFonts.set(qn('w:eastAsia'), fuente)
    st.font.size = Pt(tam)
    st.font.bold = negrita
    st.font.color.rgb = color
    return st


normal = estilo('Normal', 10.5)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.18
h1 = estilo('Heading 1', 20, MARINO, True, 'Arial Narrow')
h1.paragraph_format.space_before = Pt(0)
h1.paragraph_format.space_after = Pt(9)
h1.paragraph_format.keep_with_next = True
h2 = estilo('Heading 2', 13, AZUL, True, 'Arial Narrow')
h2.paragraph_format.space_before = Pt(11)
h2.paragraph_format.space_after = Pt(3)
h2.paragraph_format.keep_with_next = True
lb = estilo('List Bullet', 10.5)
lb.paragraph_format.space_after = Pt(2.5)


def sombreado(celda, hexa):
    tcPr = celda._tc.get_or_add_tcPr()
    for e in tcPr.findall(qn('w:shd')):
        tcPr.remove(e)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hexa)
    tcPr.append(shd)


def bordes(celda, **lados):
    """lados: top/left/bottom/right = (grosor_en_octavos, hexcolor) o None para quitar."""
    tcPr = celda._tc.get_or_add_tcPr()
    b = tcPr.find(qn('w:tcBorders'))
    if b is None:
        b = OxmlElement('w:tcBorders')
        tcPr.append(b)
    for lado in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{lado}')
        v = lados.get(lado)
        if v:
            el.set(qn('w:val'), 'single')
            el.set(qn('w:sz'), str(v[0]))
            el.set(qn('w:color'), v[1])
        else:
            el.set(qn('w:val'), 'nil')
        b.append(el)


def margenes_celda(celda, arriba=70, abajo=70, izq=110, der=110):
    tcPr = celda._tc.get_or_add_tcPr()
    m = OxmlElement('w:tcMar')
    for lado, v in (('top', arriba), ('left', izq), ('bottom', abajo), ('right', der)):
        e = OxmlElement(f'w:{lado}')
        e.set(qn('w:w'), str(v))
        e.set(qn('w:type'), 'dxa')
        m.append(e)
    tcPr.append(m)


def ancho_total(tabla, cm=None):
    """Ancho de la tabla entera y reparto fijo del ancho: sin esto Word y LibreOffice la encogen."""
    cm = cm or ANCHO_CM
    tblPr = tabla._tbl.tblPr
    for e in tblPr.findall(qn('w:tblW')):
        tblPr.remove(e)
    w = OxmlElement('w:tblW')
    w.set(qn('w:w'), str(int(cm * 567)))
    w.set(qn('w:type'), 'dxa')
    tblPr.append(w)
    lay = OxmlElement('w:tblLayout')
    lay.set(qn('w:type'), 'fixed')
    tblPr.append(lay)


def ancho_columnas(tabla, porcentajes):
    tabla.autofit = False
    ancho_total(tabla)
    grid = tabla._tbl.tblGrid
    for col, pc in zip(grid.findall(qn('w:gridCol')), porcentajes):
        col.set(qn('w:w'), str(int(ANCHO_CM * 567 * pc / 100)))
    for fila in tabla.rows:
        for celda, pc in zip(fila.cells, porcentajes):
            celda.width = Cm(ANCHO_CM * pc / 100)


def no_partir_fila(fila):
    trPr = fila._tr.get_or_add_trPr()
    e = OxmlElement('w:cantSplit')
    trPr.append(e)


def repetir_cabecera(fila):
    trPr = fila._tr.get_or_add_trPr()
    e = OxmlElement('w:tblHeader')
    trPr.append(e)


PARTES = re.compile(r'(\*\*.+?\*\*|==.+?==)')


def runs(par, texto, tam=None, color=None, cursiva=False, base_negrita=False, color_negrita=MARINO):
    """Escribe `texto` con **negrita** y ==subrayado amarillo== en el párrafo."""
    for trozo in PARTES.split(texto):
        if not trozo:
            continue
        negrita = base_negrita
        marca = False
        if trozo.startswith('**') and trozo.endswith('**'):
            trozo, negrita = trozo[2:-2], True
        elif trozo.startswith('==') and trozo.endswith('=='):
            trozo, negrita, marca = trozo[2:-2], True, True
        r = par.add_run(trozo)
        r.bold = negrita
        r.italic = cursiva and not (negrita and not marca)
        if tam:
            r.font.size = Pt(tam)
        if marca:
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            r.font.color.rgb = RGBColor(0x0C, 0x1A, 0x3D)
        elif negrita and color_negrita is not None:
            r.font.color.rgb = color_negrita
        elif color is not None:
            r.font.color.rgb = color


def salto_pagina():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def parrafo_vacio(pts=3):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.line_spacing = Pt(pts)
    return p


# ───────────── Portada ─────────────
t = doc.add_table(rows=1, cols=1)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
c = t.rows[0].cells[0]
sombreado(c, '14295A')
bordes(c)
margenes_celda(c, 500, 500, 520, 520)
ancho_columnas(t, [100])
t.rows[0].height = Cm(24.6)
p = c.paragraphs[0]
if logo:
    p.add_run().add_picture(logo, width=Cm(7.2))
p = c.add_paragraph()
p.paragraph_format.space_before = Pt(4)
r = p.add_run(meta['escala'].upper())
r.font.size, r.bold, r.font.color.rgb = Pt(9), True, ORO_CLARO
for _ in range(2):
    c.add_paragraph()
p = c.add_paragraph()
r = p.add_run('  APUNTES COMPLETOS  ')
r.font.size, r.bold, r.font.color.rgb = Pt(10), True, RGBColor(0x0C, 0x1A, 0x3D)
r.font.highlight_color = WD_COLOR_INDEX.YELLOW
p = c.add_paragraph()
r = p.add_run('TEMA ')
r.font.name, r.font.size, r.bold, r.font.color.rgb = 'Arial Narrow', Pt(34), True, ORO_CLARO
r = p.add_run(str(meta['numero']))
r.font.name, r.font.size, r.bold, r.font.color.rgb = 'Arial Narrow', Pt(96), True, RGBColor(255, 255, 255)
p = c.add_paragraph()
r = p.add_run(meta['titulo'].upper())
r.font.name, r.font.size, r.bold, r.font.color.rgb = 'Arial Narrow', Pt(44), True, ORO_CLARO
p = c.add_paragraph()
r = p.add_run(meta['subtitulo'])
r.font.size, r.font.color.rgb = Pt(13), RGBColor(0xCF, 0xD9, 0xF2)
for _ in range(2):
    c.add_paragraph()
p = c.add_paragraph()
for cifra, texto in (('11', 'preguntas reales 2021-2025'), ('16', 'preguntas de autoevaluación'), ('167', 'preguntas en el Campus')):
    r = p.add_run(cifra + ' ')
    r.font.name, r.font.size, r.bold, r.font.color.rgb = 'Arial Narrow', Pt(26), True, RGBColor(255, 255, 255)
    r = p.add_run(texto + '      ')
    r.font.size, r.font.color.rgb = Pt(9), RGBColor(0xCF, 0xD9, 0xF2)
c.add_paragraph()
p = c.add_paragraph()
r = p.add_run('ALPHAPOL · Centro de formación · Málaga')
r.font.size, r.bold, r.font.color.rgb = Pt(8.5), True, ORO_CLARO
p = c.add_paragraph()
r = p.add_run(meta['fuente'])
r.font.size, r.font.color.rgb = Pt(8), RGBColor(0xAA, 0xB7, 0xD8)
PRIMERA_PAGINA_APARTE = True


# ───────────── Pie con numeración (no en la portada) ─────────────
def campo(par, instr):
    for tipo, txt in (('begin', None), (None, instr), ('end', None)):
        r = par.add_run()
        r.font.size, r.font.color.rgb = Pt(8), SUAVE
        if tipo:
            f = OxmlElement('w:fldChar')
            f.set(qn('w:fldCharType'), tipo)
            r._r.append(f)
        else:
            it = OxmlElement('w:instrText')
            it.set(qn('xml:space'), 'preserve')
            it.text = txt
            r._r.append(it)


fp = sec.footer.paragraphs[0]
fp.text = ''
pPr = fp._p.get_or_add_pPr()
bd = OxmlElement('w:pBdr')
top = OxmlElement('w:top')
for k, v in (('val', 'single'), ('sz', '8'), ('space', '4'), ('color', 'C5A738')):
    top.set(qn(f'w:{k}'), v)
bd.append(top)
pPr.append(bd)
r = fp.add_run('ALPHAPOL ')
r.bold, r.font.size, r.font.color.rgb = True, Pt(8), MARINO
r = fp.add_run(f"· Tema {meta['numero']} · {meta['titulo']}\t\t")
r.font.size, r.font.color.rgb = Pt(8), SUAVE
campo(fp, 'PAGE')
fp.paragraph_format.tab_stops.add_tab_stop(Cm(17), alignment=2)


# ───────────── Piezas ─────────────
def etiquetada(color_fondo, color_borde, etiqueta, color_etiqueta, textos, lista=False, cursiva=False, texto_blanco=False):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]
    ancho_columnas(t, [100])
    sombreado(c, color_fondo)
    bordes(c, left=(36, color_borde), top=(4, color_borde) if not texto_blanco else None,
           bottom=(4, color_borde) if not texto_blanco else None, right=(4, color_borde) if not texto_blanco else None)
    margenes_celda(c, 80, 60, 160, 140)
    no_partir_fila(t.rows[0])
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(etiqueta)
    r.bold, r.font.size, r.font.color.rgb = True, Pt(8), color_etiqueta
    for tx in textos:
        p = c.add_paragraph(style='List Bullet') if lista else c.add_paragraph()
        p.paragraph_format.space_after = Pt(2)
        runs(p, tx, 9.8 if cursiva else 10, color=RGBColor(0xE8, 0xEE, 0xFC) if texto_blanco else None, cursiva=cursiva,
             color_negrita=ORO_CLARO if texto_blanco else MARINO)
        if texto_blanco:
            for rr in p.runs:
                if rr.font.color.rgb is None:
                    rr.font.color.rgb = RGBColor(0xE8, 0xEE, 0xFC)
    parrafo_vacio(5)


def tabla(cols, filas, anchos):
    t = doc.add_table(rows=1, cols=len(cols))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(cols):
        c = t.rows[0].cells[i]
        sombreado(c, '14295A')
        bordes(c)
        margenes_celda(c, 60, 60, 100, 100)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(re.sub(r'\*\*', '', h))
        r.bold, r.font.size, r.font.color.rgb = True, Pt(9), RGBColor(255, 255, 255)
    repetir_cabecera(t.rows[0])
    for n, fila in enumerate(filas):
        cells = t.add_row().cells
        no_partir_fila(t.rows[-1])
        for i, txt in enumerate(fila):
            c = cells[i]
            bordes(c, bottom=(4, 'DDD8C9'))
            margenes_celda(c, 60, 60, 100, 100)
            if n % 2:
                sombreado(c, 'F3F0E6')
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            runs(p, txt, 9.5)
    ancho_columnas(t, anchos or [100 / len(cols)] * len(cols))
    parrafo_vacio(6)


def bloque(b):
    k = b['t']
    if k == 'h3':
        doc.add_paragraph(b['texto'], style='Heading 2')
    elif k == 'p':
        runs(doc.add_paragraph(), b['texto'])
    elif k in ('ul', 'ol'):
        for it in b['items']:
            runs(doc.add_paragraph(style='List Bullet'), it)
    elif k == 'tabla':
        tabla(b['cols'], b['filas'], b.get('anchos'))
    elif k == 'clave':
        etiquetada('F7F4EC', 'C5A738', b['titulo'].upper(), ORO_OSCURO, [b['texto']], cursiva=True)
    elif k == 'examen':
        etiquetada('FFF5EE', 'D9531E', f"🔥 CAYÓ EN EL EXAMEN · {b['anio']}", FUEGO, [b['texto']])
    elif k == 'ojo':
        etiquetada('FFF9E0', 'E0A800', '⚠ ' + b.get('titulo', 'OJO').upper(), RGBColor(0x7A, 0x4A, 0x00), [b['texto']])
    elif k == 'ejemplo':
        etiquetada('EEF3FB', '2A5DB0', 'EJEMPLO', AZUL, [b['texto']])
    elif k == 'resumen':
        etiquetada('14295A', '14295A', '💡 EN RESUMEN', ORO_CLARO, b['items'], lista=True, texto_blanco=True)
    else:
        raise ValueError(k)


def titulo_seccion(texto, salto=False):
    p = doc.add_paragraph(texto.upper(), style='Heading 1')
    if salto:
        p.paragraph_format.page_break_before = True
    else:
        p.paragraph_format.space_before = Pt(20)
    pPr = p._p.get_or_add_pPr()
    bd = OxmlElement('w:pBdr')
    bt = OxmlElement('w:bottom')
    for k, v in (('val', 'single'), ('sz', '14'), ('space', '2'), ('color', 'C5A738')):
        bt.set(qn(f'w:{k}'), v)
    bd.append(bt)
    pPr.append(bd)


# ───────────── Índice ─────────────
titulo_seccion('Índice', salto=True)
lista = [s['titulo'] for s in secciones] + ['12. Las preguntas reales de 2021 a 2025', '13. Test de autoevaluación', 'Soluciones del test']
for tx in lista:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    r = p.add_run(tx)
    r.bold, r.font.size, r.font.color.rgb = True, Pt(12), MARINO
parrafo_vacio(8)
etiquetada('F7F4EC', 'C5A738', 'PROGRAMA OFICIAL', ORO_OSCURO, [meta['programa']], cursiva=True)

# ───────────── Secciones ─────────────
for s in secciones:
    titulo_seccion(s['titulo'], salto=s['id'] in ('guia', 'nacionalidad'))
    for b in s['bloques']:
        bloque(b)

# ───────────── Preguntas reales ─────────────
titulo_seccion('12. Las preguntas reales de 2021 a 2025', salto=True)
runs(doc.add_paragraph(), 'Estas son las **11 preguntas** de este tema que han caído en los cinco últimos exámenes oficiales de Escala Básica. Léelas con la respuesta delante: los enunciados cambian, pero **los datos que se piden se repiten**.')
tabla(['Año', 'Parte', 'Qué se preguntaba', 'Respuesta'], [[f"**{r['anio']}**", r['parte'], r['pregunta'], r['respuesta']] for r in reales], [9, 13, 40, 38])
etiquetada('FFF9E0', 'E0A800', '⚠ LO QUE DICEN LOS DATOS', RGBColor(0x7A, 0x4A, 0x00), ['De 11 preguntas, **7 son de nacionalidad**, 2 de vecindad, 1 de la persona y 1 de la norma jurídica. En cambio **jerarquía normativa, fuentes, domicilio, capacidad y personas jurídicas no han caído** en estos cinco exámenes: apréndelas, pero reparte el tiempo en función de lo que cae.'])

# ───────────── Test ─────────────
titulo_seccion('13. Test de autoevaluación', salto=True)
runs(doc.add_paragraph(), 'Dieciséis preguntas con tres opciones, como en el examen. Contesta sin mirar el tema y comprueba en la página de soluciones. Si fallas más de tres, vuelve al apartado que corresponda.')
for i, q in enumerate(test, 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(7)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(f'{i}.  ')
    r.bold, r.font.color.rgb = True, ORO_OSCURO
    runs(p, q['q'], base_negrita=True)
    for j, o in enumerate(q['o']):
        po = doc.add_paragraph()
        po.paragraph_format.left_indent = Cm(0.9)
        po.paragraph_format.space_after = Pt(1)
        po.paragraph_format.keep_with_next = j < 2
        r = po.add_run(f'{LETRAS[j]})  ')
        r.bold, r.font.color.rgb = True, ORO_OSCURO
        runs(po, o)

titulo_seccion('Soluciones del test', salto=True)
tabla(['N.º', 'Respuesta', 'Por qué'], [[f'**{i}**', f"**{LETRAS[q['c']]}**", q['e']] for i, q in enumerate(test, 1)], [8, 12, 80])
parrafo_vacio(8)
etiquetada('14295A', '14295A', 'SIGUE PRACTICANDO ESTE TEMA EN EL CAMPUS', ORO_CLARO,
           ['Entrena con **167 preguntas del Tema 1**, corregidas al momento y con explicación de cada respuesta: **campus.alphapol.es**'], texto_blanco=True)

doc.core_properties.title = f"Alphapol · Tema {meta['numero']} · {meta['titulo']}"
doc.core_properties.author = 'Alphapol'
doc.save(salida)
print('DOCX', salida)

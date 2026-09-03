'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Save, Loader2, PenLine, Upload, FileSpreadsheet, Download,
  CheckCircle2, AlertTriangle, Trash2,
} from 'lucide-react';
import { Modal, Button } from '../../ui';
import { createManualQuestion, importManualQuestions } from '@/actions';
import { OPTION_IDS, DIFFICULTY, DIFFICULTY_DEFAULT, type DifficultyLevel } from '@/app/lib/questions';
import {
  parseQuestionsCsv,
  quitaRepetidas,
  CSV_PLANTILLA,
  MAX_IMPORT,
  type ManualQuestion,
  type ImportIssue,
} from '@/app/lib/question-import';
import type { SyllabusSubject } from '@/app/actions/admin';

/**
 * Alta de preguntas: a mano o desde una hoja de calculo (P2).
 *
 * Hasta ahora solo se podian EDITAR las que ya existian, asi que para tener una
 * pregunta concreta habia que generar varias con IA y reescribir la que mas se
 * acercara. Esto es ademas lo que permite a una academia cargar su banco sin
 * depender del modelo.
 *
 * El CSV se lee AQUI, en el navegador (`app/lib/question-import.ts`): lo que
 * viaja a la Server Action son preguntas ya troceadas y con tipo, no un fichero
 * suelto. El servidor las vuelve a validar de todas formas — una Server Action
 * es un endpoint publico.
 */

const LETRAS = OPTION_IDS.map((o) => o.toUpperCase());

const NIVELES: { valor: DifficultyLevel; nombre: string }[] = [
  { valor: DIFFICULTY.easy, nombre: 'Asequible' },
  { valor: DIFFICULTY.medium, nombre: 'Media' },
  { valor: DIFFICULTY.hard, nombre: 'Alta' },
];

type Pestania = 'manual' | 'csv';

type Resultado =
  | { tipo: 'ok'; texto: string }
  | { tipo: 'error'; texto: string }
  | null;

export default function QuestionComposer({
  subjects,
  onClose,
  onCreated,
}: {
  subjects: SyllabusSubject[];
  onClose: () => void;
  /** Se llama cuando algo ha entrado de verdad en el banco. */
  onCreated: () => void;
}) {
  const [pestania, setPestania] = useState<Pestania>('manual');

  // El tema es comun a las dos pestanias: es lo primero que se elige y no
  // cambia entre una pregunta y la siguiente.
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [resultado, setResultado] = useState<Resultado>(null);

  // --- Formulario de una sola pregunta ---
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(() => OPTION_IDS.map(() => ''));
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DIFFICULTY_DEFAULT);
  const [guardando, setGuardando] = useState(false);
  const [guardadas, setGuardadas] = useState(0);

  // --- Importacion ---
  const [nombreFichero, setNombreFichero] = useState('');
  const [leidas, setLeidas] = useState<ManualQuestion[]>([]);
  const [rechazadas, setRechazadas] = useState<ImportIssue[]>([]);
  const [repetidas, setRepetidas] = useState(0);
  const [importando, setImportando] = useState(false);
  const inputFichero = useRef<HTMLInputElement>(null);

  const temaElegido = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId]
  );

  function limpiaFormulario() {
    // El tema y la dificultad se conservan a proposito: quien escribe diez
    // preguntas de un tema no quiere volver a elegirlo diez veces.
    setQuestion('');
    setOptions(OPTION_IDS.map(() => ''));
    setCorrectIndex(0);
    setExplanation('');
  }

  async function handleGuardar() {
    if (!subjectId) {
      setResultado({ tipo: 'error', texto: 'Elige primero el tema.' });
      return;
    }
    setGuardando(true);
    setResultado(null);

    const res = await createManualQuestion({
      subjectId,
      question,
      options,
      correctIndex,
      explanation,
      difficulty,
    });

    if (res.success) {
      setGuardadas((n) => n + 1);
      setResultado({ tipo: 'ok', texto: 'Pregunta publicada en el banco. Ya se sirve en los tests.' });
      limpiaFormulario();
      onCreated();
    } else {
      // El error se ENSEÑA. Un fallo de escritura que solo va a la consola deja
      // al administrador creyendo que guardo (trampa conocida del repo).
      setResultado({ tipo: 'error', texto: res.error ?? 'No se pudo guardar.' });
    }
    setGuardando(false);
  }

  async function handleFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResultado(null);
    setNombreFichero(file.name);

    const texto = await file.text();
    const { preguntas, rechazadas: malas } = parseQuestionsCsv(texto);
    const { unicas, repetidas: rep } = quitaRepetidas(preguntas);

    setLeidas(unicas);
    setRechazadas(malas);
    setRepetidas(rep);
  }

  function descargaPlantilla() {
    // El BOM delante hace que Excel abra el fichero en UTF-8 y no parta los
    // acentos: sin el, "¿Cuántos?" se ve como "Â¿CuÃ¡ntos?".
    const blob = new Blob(['\uFEFF' + CSV_PLANTILLA], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-preguntas.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportar() {
    if (!subjectId || leidas.length === 0) return;
    setImportando(true);
    setResultado(null);

    const res = await importManualQuestions({ subjectId, questions: leidas });

    if (res.success) {
      const partes = [`${res.insertadas} publicadas`];
      if (res.duplicadas) partes.push(`${res.duplicadas} ya estaban`);
      if (res.rechazadas?.length) partes.push(`${res.rechazadas.length} rechazadas por el servidor`);
      setResultado({ tipo: 'ok', texto: partes.join(' · ') });
      setLeidas([]);
      setNombreFichero('');
      if (inputFichero.current) inputFichero.current.value = '';
      onCreated();
    } else {
      setResultado({ tipo: 'error', texto: res.error ?? 'No se pudo importar.' });
    }
    setImportando(false);
  }

  return (
    <Modal
      title="Nueva pregunta"
      subtitle={`Entra directamente en el banco, sin pasar por moderación${guardadas > 0 ? ` · ${guardadas} en esta sesión` : ''}`}
      width="lg"
      onClose={onClose}
      footer={
        <>
          <p className="text-[11px] text-slate-500 truncate sm:mr-auto sm:self-center">
            {temaElegido ? `Tema ${temaElegido.number} · ${temaElegido.title}` : 'Sin tema elegido'}
          </p>
          {pestania === 'manual' ? (
            <Button
              onClick={handleGuardar}
              disabled={guardando || !subjectId}
              icon={guardando ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            >
              {guardando ? 'Publicando…' : 'Publicar'}
            </Button>
          ) : (
            <Button
              onClick={handleImportar}
              disabled={importando || !subjectId || leidas.length === 0}
              icon={importando ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            >
              {importando ? 'Importando…' : `Importar ${leidas.length || ''}`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* --- Pestañas --- */}
        <div className="flex gap-2">
          {([
            { id: 'manual' as const, icono: <PenLine size={14} />, texto: 'Escribir una' },
            { id: 'csv' as const, icono: <FileSpreadsheet size={14} />, texto: 'Importar una hoja' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setPestania(t.id); setResultado(null); }}
              className={`min-h-[44px] px-4 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                pestania === t.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-800'
              }`}
            >
              {t.icono}{t.texto}
            </button>
          ))}
        </div>

        {/* --- Cuerpo --- */}
        <div className="space-y-5">

          {/* Tema: común a las dos pestañas */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Tema</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none transition-all cursor-pointer"
            >
              <option value="">Elige el tema…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>Tema {s.number}: {s.title}</option>
              ))}
            </select>
          </div>

          {pestania === 'manual' ? (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Enunciado</label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="¿Qué órgano…?"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none min-h-[100px] placeholder:text-slate-700"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  Opciones (marca la válida)
                </label>
                {options.map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2 rounded-2xl border transition-all ${
                      i === correctIndex ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900/30 border-slate-800'
                    }`}
                  >
                    <button
                      onClick={() => setCorrectIndex(i)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                        i === correctIndex
                          ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20 scale-105'
                          : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {LETRAS[i]}
                    </button>
                    <input
                      value={opt}
                      onChange={(e) => {
                        const nuevas = [...options];
                        nuevas[i] = e.target.value;
                        setOptions(nuevas);
                      }}
                      className="flex-1 bg-transparent border-b border-transparent focus:border-indigo-500/50 px-2 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-700"
                      placeholder={`Opción ${LETRAS[i]}`}
                    />
                    {i === correctIndex && <CheckCircle2 size={16} className="text-emerald-500 mr-2" />}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  Justificación <span className="text-slate-600 normal-case tracking-normal font-medium">— es lo que lee el alumno al fallar</span>
                </label>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Artículo 68.1 CE…"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-slate-300 text-xs focus:border-indigo-500 outline-none transition-all resize-none min-h-[80px] placeholder:text-slate-700"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Dificultad</label>
                <div className="flex gap-2">
                  {NIVELES.map((n) => (
                    <button
                      key={n.valor}
                      onClick={() => setDifficulty(n.valor)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                        difficulty === n.valor
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 text-slate-500 border border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      {n.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={() => inputFichero.current?.click()}
                  className="px-5 py-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                >
                  <Upload size={14} /> Elegir fichero
                </button>
                <button
                  onClick={descargaPlantilla}
                  className="px-5 py-3 bg-transparent border border-slate-800 text-slate-400 hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                >
                  <Download size={14} /> Plantilla
                </button>
                <input
                  ref={inputFichero}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  onChange={handleFichero}
                  className="hidden"
                />
                {nombreFichero && (
                  <span className="text-xs font-mono text-slate-500 truncate max-w-[220px]">{nombreFichero}</span>
                )}
              </div>

              <div className="text-xs text-slate-500 leading-relaxed bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-1">
                <p>
                  Columnas: <span className="font-mono text-slate-300">enunciado · A · B · C · correcta</span>
                  {' '}(obligatorias) y <span className="font-mono text-slate-300">explicacion · dificultad</span> (opcionales).
                </p>
                <p>La columna <span className="font-mono text-slate-300">correcta</span> admite A, B, C o 1, 2, 3. Hasta {MAX_IMPORT} preguntas por fichero, todas del tema elegido arriba.</p>
              </div>

              {(leidas.length > 0 || rechazadas.length > 0) && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[120px] bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3">
                      <p className="text-2xl font-black text-emerald-400">{leidas.length}</p>
                      <p className="text-[10px] uppercase tracking-widest text-emerald-200/60 font-bold">listas</p>
                    </div>
                    <div className="flex-1 min-w-[120px] bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
                      <p className="text-2xl font-black text-slate-400">{repetidas}</p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">repetidas</p>
                    </div>
                    <div className="flex-1 min-w-[120px] bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                      <p className="text-2xl font-black text-amber-400">{rechazadas.length}</p>
                      <p className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold">rechazadas</p>
                    </div>
                  </div>

                  {/* Ninguna fila desaparece en silencio: la que no sirve sale
                      aquí con su línea, la misma que se ve en Excel. */}
                  {rechazadas.length > 0 && (
                    <div className="border border-amber-500/20 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2 bg-amber-500/5 flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-400" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          Estas filas no se importan
                        </p>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60">
                        {rechazadas.map((r, i) => (
                          <div key={i} className="px-4 py-2 flex gap-3 text-xs">
                            <span className="font-mono text-slate-600 shrink-0">línea {r.fila}</span>
                            <span className="text-slate-400">{r.motivo}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {leidas.length > 0 && (
                    <div className="border border-slate-800 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2 bg-slate-900/60 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Vista previa
                        </p>
                        <button
                          onClick={() => { setLeidas([]); setRechazadas([]); setRepetidas(0); setNombreFichero(''); if (inputFichero.current) inputFichero.current.value = ''; }}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                          title="Descartar el fichero"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60">
                        {leidas.slice(0, 20).map((p, i) => (
                          <div key={i} className="px-4 py-3">
                            <p className="text-xs text-slate-300 leading-snug">{p.question}</p>
                            <p className="text-[11px] text-emerald-400/80 mt-1 font-mono">
                              {LETRAS[p.correctIndex]} · {p.options[p.correctIndex]}
                            </p>
                          </div>
                        ))}
                        {leidas.length > 20 && (
                          <p className="px-4 py-2 text-[11px] text-slate-600 font-mono">
                            …y {leidas.length - 20} más
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {resultado && (
            <div
              className={`rounded-2xl px-4 py-3 text-xs font-medium border flex items-start gap-2 ${
                resultado.tipo === 'ok'
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/5 border-red-500/20 text-red-300'
              }`}
            >
              {resultado.tipo === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              <span>{resultado.texto}</span>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}

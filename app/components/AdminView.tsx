'use client'

import { useState, useEffect } from 'react';
import {
  getAdminUsersList,
  getGlobalActivity,
  getTopicsList,
  uploadTopicPDF,
  deleteTopic,
  checkDatabaseHealth,
  seedQuestionBank,
} from '../actions';
import {
  Users, Activity, Shield, LogOut, TrendingUp,
  Book, Upload, Trash2, FileText, Loader2, Database, AlertCircle, RefreshCw,
  Layers, CheckCircle2, XCircle
} from 'lucide-react';

export default function AdminView({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'users' | 'activity' | 'topics' | 'debug'>('users');

  const [usersList, setUsersList] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [topicsList, setTopicsList] = useState<any[]>([]);
  const [dbHealth, setDbHealth] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);

    const usersRes = await getAdminUsersList(user.id);
    if (usersRes.success) setUsersList(usersRes.users || []);

    const activityRes = await getGlobalActivity(user.id);
    if (activityRes.success) setActivityLog(activityRes.activity || []);

    await loadTopics();

    setLoading(false);
  }

  async function loadTopics() {
    const topicsRes = await getTopicsList(user.id);
    if (topicsRes.success) setTopicsList(topicsRes.topics || []);
    else console.error("Error cargando temas:", (topicsRes as any).error);
  }

  async function runDiagnosis() {
    setLoading(true);
    const res = await checkDatabaseHealth(user.id);
    setDbHealth(res);
    setLoading(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
      alert("Solo se permiten archivos PDF");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await uploadTopicPDF(user.id, formData);

    setUploading(false);

    if (res.success) {
      alert("✅ " + res.message);
      await loadTopics();
    } else {
      alert("❌ " + res.error);
    }
  }

  async function handleDeleteTopic(topicName: string) {
    if (!confirm(`¿Seguro que quieres borrar todo el contenido de "${topicName}"? Esta acción es irreversible.`)) return;

    const res = await deleteTopic(user.id, topicName);
    if (res.success) await loadTopics();
    else alert("Error al borrar: " + res.error);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 font-sans">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-500/20">
            <Shield className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Centro de Mando</h1>
            <p className="text-xs font-mono text-indigo-400">GOD MODE ACTIVE • {user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Refrescar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Users size={20} /></div>
            <span className="text-xs font-bold bg-blue-500 text-slate-900 px-2 py-0.5 rounded">TOTAL</span>
          </div>
          <p className="text-4xl font-black text-white">{usersList.length}</p>
          <p className="text-sm text-slate-500 font-medium">Usuarios Registrados</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Book size={20} /></div>
            <span className="text-xs font-bold bg-purple-500 text-slate-900 px-2 py-0.5 rounded">TEMARIO</span>
          </div>
          <p className="text-4xl font-black text-white">{topicsList.length}</p>
          <p className="text-sm text-slate-500 font-medium">Leyes / Libros Indexados</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400"><TrendingUp size={20} /></div>
            <span className="text-xs font-bold bg-green-500 text-slate-900 px-2 py-0.5 rounded">GLOBAL</span>
          </div>
          <p className="text-4xl font-black text-white">{activityLog.length}</p>
          <p className="text-sm text-slate-500 font-medium">Actividad Reciente</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 mb-6 bg-slate-800/50 p-1 rounded-xl w-fit border border-slate-700/50">
        <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}>Usuarios</button>
        <button onClick={() => setActiveTab('topics')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'topics' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}>Gestión Temario</button>
        <button onClick={() => setActiveTab('activity')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'activity' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}>Auditoría</button>

        <button
          onClick={() => { setActiveTab('debug'); runDiagnosis(); }}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'debug' ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-slate-700 text-red-400'}`}
        >
          <Database size={14} /> Diagnóstico DB
        </button>
      </div>

      {/* TAB: USERS */}
      {activeTab === 'users' && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden animate-in fade-in">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-500">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4 text-center">Tests</th>
                <th className="px-6 py-4 text-center">Efectividad</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {usersList.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${u.role === 'admin' ? 'bg-yellow-500 text-black' : 'bg-slate-600 text-white'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono">{u.total_tests}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`font-bold ${u.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>{u.win_rate}%</span>
                  </td>
                  <td className="px-6 py-4 text-green-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div> Activo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: TOPICS */}
      {activeTab === 'topics' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Upload */}
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 border-dashed text-center">
            {uploading ? (
              <div className="flex flex-col items-center gap-3 animate-pulse">
                <Loader2 className="animate-spin text-indigo-500" size={40} />
                <p className="text-slate-400">
                  Procesando PDF, leyendo artículos e indexando en IA...<br />
                  <span className="text-xs opacity-70">(Esto puede tardar un poco si el archivo es grande)</span>
                </p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="text-indigo-400" size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Añadir Nueva Ley o Temario</h3>
                <p className="text-slate-500 mb-6 text-sm max-w-md mx-auto">
                  Sube un PDF. El sistema detectará automáticamente si es una <b>Ley</b> (corta por Artículos) o un <b>Libro</b> (corta por bloques de texto).
                </p>

                <div className="relative inline-block">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <button className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">
                    Seleccionar PDF
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Seed Bank */}
          <SeedBankPanel />

          {/* Topics List */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-700 font-bold text-sm text-slate-400 uppercase flex justify-between items-center">
              <span>Documentos Indexados ({topicsList.length})</span>
              <button onClick={loadTopics} className="hover:text-white" title="Recargar lista"><RefreshCw size={14} /></button>
            </div>
            <div className="divide-y divide-slate-700">
              {topicsList.map((t: any) => (
                <div key={t.name} className="p-6 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">{t.name}</p>
                      <p className="text-slate-500 text-sm">{t.count} fragmentos procesados</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTopic(t.name)}
                    className="p-3 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded-lg transition-colors group"
                    title="Borrar todo este documento"
                  >
                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              ))}
              {topicsList.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  <p className="mb-2">La base de datos parece vacía.</p>
                  <p className="text-xs text-slate-600">
                    ¿Has subido un archivo y no aparece aquí? Revisa la pestaña <span className="text-red-400 font-bold">Diagnóstico DB</span>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="space-y-3 animate-in fade-in">
          <div className="flex justify-end gap-3 mb-2 text-[10px] uppercase font-bold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Test OK</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Test Fallo</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Flashcard</span>
          </div>

          {activityLog.map((log: any) => {
            const isFlashcard = log.error_type === 'flashcard';
            const isCorrect = log.is_correct;

            return (
              <div key={log.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between group hover:border-slate-600 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl border ${isFlashcard
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : (isCorrect ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')
                    }`}>
                    {isFlashcard ? <Layers size={18} /> : (isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />)}
                  </div>

                  <div>
                    <p className="text-white font-medium text-sm line-clamp-1">
                      {log.question_text?.replace('[FLASHCARD] ', '') || "Pregunta sin texto"}
                    </p>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${isFlashcard ? 'bg-purple-900/30 text-purple-300 border-purple-500/30' : 'bg-blue-900/30 text-blue-300 border-blue-500/30'}`}>
                        {isFlashcard ? 'MEMORIA' : 'TEST'}
                      </span>
                      <span className="text-slate-500 text-xs font-bold uppercase">{log.topic}</span>
                      <span className="text-slate-600 text-xs">•</span>
                      <span className="text-indigo-400 text-xs font-mono">{log.profiles?.email}</span>
                    </div>
                  </div>
                </div>
                <span className="text-slate-600 text-xs font-mono whitespace-nowrap bg-slate-900 px-2 py-1 rounded border border-white/5">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}

          {activityLog.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Activity size={40} className="mx-auto mb-3 opacity-20" />
              <p>No hay actividad registrada aún.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB: DEBUG */}
      {activeTab === 'debug' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-slate-800 p-6 rounded-2xl border border-red-900/50 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-900/30 rounded-lg text-red-400"><AlertCircle size={24} /></div>
              <div>
                <h3 className="text-red-400 font-bold text-xl">Inspección de Base de Datos</h3>
                <p className="text-slate-500 text-sm">Visualiza los datos crudos (RAW) almacenados en Supabase.</p>
              </div>
              <button
                onClick={runDiagnosis}
                className="ml-auto bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refrescar
              </button>
            </div>

            {loading && <div className="text-center py-10 text-slate-500">Consultando base de datos...</div>}

            {!loading && dbHealth && (
              <div className="space-y-6">
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Total Filas en 'documents'</p>
                    <p className="text-5xl font-mono text-white tracking-tighter">{dbHealth.total}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Estado de la conexión</p>
                    <div className="text-green-400 font-bold flex items-center justify-end gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      CONECTADO
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-slate-500 text-xs uppercase font-bold mb-3 flex items-center gap-2">
                    <Database size={12} /> Últimos 5 registros insertados (Raw Data)
                  </p>
                  <div className="space-y-2 font-mono text-xs">
                    {dbHealth.lastRows?.map((row: any) => (
                      <div key={row.id} className="bg-black/40 p-4 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
                        <div className="flex gap-4 text-slate-400 mb-2 border-b border-white/5 pb-2">
                          <span><span className="text-slate-600">ID:</span> {row.id}</span>
                          <span className="text-indigo-300"><span className="text-slate-600">REF:</span> {row.article_ref}</span>
                        </div>
                        <p className="text-slate-300 line-clamp-2 leading-relaxed opacity-80">{row.content}</p>
                      </div>
                    ))}
                    {dbHealth.lastRows?.length === 0 && (
                      <div className="p-4 bg-red-900/10 border border-red-900/30 rounded-lg text-red-400 text-center">
                        La tabla 'documents' está completamente vacía.
                      </div>
                    )}
                  </div>
                </div>

                {dbHealth.error && (
                  <div className="bg-red-950 p-4 rounded-lg border border-red-500 text-red-200 text-sm font-bold flex items-center gap-3">
                    <AlertCircle /> Error de Supabase: {dbHealth.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Panel para generar preguntas en lote y guardarlas en question_bank */
function SeedBankPanel() {
  const [subjectId, setSubjectId] = useState<number>(1);
  const [topic, setTopic] = useState<string>('CONSTITUCION');
  const [count, setCount] = useState<number>(50);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setRunning(true);
    setResult(null);

    const res = await seedQuestionBank({
      subjectId,
      topic,
      count,
      difficulty: 2,
      concurrency: 2,
      retries: 3,
    });

    setResult(res);
    setRunning(false);
  }

  return (
    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-white">Generar banco de preguntas</h3>
          <p className="text-slate-400 text-sm mt-1">
            Genera en lote con IA + RAG y guarda en <span className="font-mono">question_bank</span> (sin duplicados por hash).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="text-xs font-bold text-slate-400">subject_id</label>
          <input
            type="number"
            value={subjectId}
            onChange={(e) => setSubjectId(Number(e.target.value))}
            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400">topic (etiqueta)</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400">cantidad</label>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={run}
          disabled={running}
          className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-black hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {running ? 'Generando…' : 'Generar y guardar'}
        </button>
        <span className="text-xs text-slate-500">
          Consejo: empieza con 20 para probar, luego 200–500.
        </span>
      </div>

      {result && (
        <pre className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs text-slate-200 overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

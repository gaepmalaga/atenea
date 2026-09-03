'use client';

import { useState, useEffect } from 'react';
import type { AuthUser } from '@/app/lib/auth';
import {
  Shield, Save, Brain,
  Briefcase, AlertTriangle, CheckCircle2,
  Loader2, User, Activity,
  Target, ArrowLeft 
} from 'lucide-react';
import { getBiodata, saveBiodata } from '@/actions';

interface BiodataManagerProps {
  user: AuthUser;
  onExit?: () => void; // Prop opcional para cerrar si se usa como modal/pantalla completa
}

type BiodataForm = {
  // BIODATA
  family_background: string;
  studies_motivation: string;
  work_history: string;
  leisure_activities: string;
  police_motivation: string;
  fears_concerns: string;
  strengths_weaknesses: string;
  legal_issues: string;
  // TEST (Métrico)
  psych_answers: Record<string, number>;
  psych_profile: {
      sincerity: number;
      stability: number;
      normativity: number;
      leadership: number;
  };
};

const INITIAL_DATA: BiodataForm = {
  family_background: '', studies_motivation: '', work_history: '',
  leisure_activities: '', police_motivation: '', fears_concerns: '',
  strengths_weaknesses: '', legal_issues: '',
  psych_answers: {},
  psych_profile: { sincerity: 5, stability: 5, normativity: 5, leadership: 5 }
};

const SECTIONS = [
  { id: 'personal', label: 'I. Entorno Personal', icon: User, color: 'text-blue-500', bg: 'bg-blue-500' },
  { id: 'academic', label: 'II. Trayectoria', icon: Briefcase, color: 'text-indigo-500', bg: 'bg-indigo-500' },
  { id: 'psycho', label: 'III. Motivación', icon: Brain, color: 'text-purple-500', bg: 'bg-purple-500' },
  { id: 'legal', label: 'IV. Conducta', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500' },
  { id: 'test', label: 'V. Test Psicotécnico', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500' },
];

// --- TEST PSICOMÉTRICO "VIP" (30 ITEMS + LÓGICA DE CONTROL) ---
// type: 'control' invierte la lógica: Si dices que NO a un defecto universal, mientes.
const TEST_QUESTIONS = [
    // SINCERIDAD (CONTROL / DESEABILIDAD SOCIAL)
    { id: 's1', text: "Nunca he dicho una mentira, ni siquiera piadosa.", factor: 'sincerity', type: 'control' }, 
    { id: 's2', text: "Nunca he llegado tarde a una cita.", factor: 'sincerity', type: 'control' },
    { id: 's3', text: "A veces me enfado cuando las cosas no salen como quiero.", factor: 'sincerity', type: 'normal', reverse: false }, // Admitir esto es sincero
    { id: 's4', text: "He cogido cosas que no eran mías (bolígrafos, etc.) alguna vez.", factor: 'sincerity', type: 'normal', reverse: false }, // Admitir es sincero
    { id: 's5', text: "Nunca he hablado mal de nadie a sus espaldas.", factor: 'sincerity', type: 'control' },
    { id: 's6', text: "Siempre cumplo mis promesas, sin excepción.", factor: 'sincerity', type: 'control' },

    // ESTABILIDAD EMOCIONAL (NEUROTICISMO)
    { id: 'e1', text: "A menudo me siento triste sin motivo aparente.", factor: 'stability', type: 'normal', reverse: true },
    { id: 'e2', text: "Mantengo la calma en situaciones de emergencia.", factor: 'stability', type: 'normal', reverse: false },
    { id: 'e3', text: "Los pequeños contratiempos me irritan mucho.", factor: 'stability', type: 'normal', reverse: true },
    { id: 'e4', text: "Soy una persona con un estado de ánimo muy estable.", factor: 'stability', type: 'normal', reverse: false },
    { id: 'e5', text: "A veces siento que no puedo con todo.", factor: 'stability', type: 'normal', reverse: true },
    { id: 'e6', text: "Duermo mal cuando tengo preocupaciones.", factor: 'stability', type: 'normal', reverse: true },
    { id: 'e7', text: "Me afectan mucho las críticas de los demás.", factor: 'stability', type: 'normal', reverse: true },
    { id: 'e8', text: "Rara vez pierdo los nervios.", factor: 'stability', type: 'normal', reverse: false },

    // NORMATIVIDAD (RESPONSABILIDAD / CONCIENCIA)
    { id: 'n1', text: "Creo que las normas son necesarias para la convivencia.", factor: 'normativity', type: 'normal', reverse: false },
    { id: 'n2', text: "A veces es necesario saltarse una norma para hacer lo correcto.", factor: 'normativity', type: 'normal', reverse: true },
    { id: 'n3', text: "Siempre reviso mi trabajo para asegurarme de que está perfecto.", factor: 'normativity', type: 'normal', reverse: false },
    { id: 'n4', text: "Me molesta la gente que no respeta la autoridad.", factor: 'normativity', type: 'normal', reverse: false },
    { id: 'n5', text: "Si encuentro una cartera con dinero y DNI, intento devolverla.", factor: 'normativity', type: 'normal', reverse: false },
    { id: 'n6', text: "A veces dejo las tareas para el último momento.", factor: 'normativity', type: 'normal', reverse: true },
    { id: 'n7', text: "Creo que el fin justifica los medios.", factor: 'normativity', type: 'normal', reverse: true },
    { id: 'n8', text: "Soy muy puntual.", factor: 'normativity', type: 'normal', reverse: false },

    // LIDERAZGO (DOMINANCIA / EXTRAVERSIÓN)
    { id: 'l1', text: "Me gusta tomar decisiones difíciles.", factor: 'leadership', type: 'normal', reverse: false },
    { id: 'l2', text: "Prefiero pasar desapercibido en las reuniones.", factor: 'leadership', type: 'normal', reverse: true },
    { id: 'l3', text: "Suelo convencer a los demás de mis opiniones.", factor: 'leadership', type: 'normal', reverse: false },
    { id: 'l4', text: "Me cuesta decir que no a la gente.", factor: 'leadership', type: 'normal', reverse: true },
    { id: 'l5', text: "No me importa hablar en público.", factor: 'leadership', type: 'normal', reverse: false },
    { id: 'l6', text: "Prefiero seguir instrucciones a darlas.", factor: 'leadership', type: 'normal', reverse: true },
    { id: 'l7', text: "Me considero una persona con carácter fuerte.", factor: 'leadership', type: 'normal', reverse: false },
    { id: 'l8', text: "Suelo evitar los conflictos.", factor: 'leadership', type: 'normal', reverse: true },
];

export default function BiodataManager({ user, onExit }: BiodataManagerProps) {
  const [formData, setFormData] = useState<BiodataForm>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('personal');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // CARGA DE DATOS
  useEffect(() => {
    const load = async () => {
      try {
        const res = await getBiodata();
        if (res.success && res.data) {
          const merged = { ...INITIAL_DATA, ...res.data };
          if (!merged.psych_answers) merged.psych_answers = {};
          if (!merged.psych_profile) merged.psych_profile = INITIAL_DATA.psych_profile;
          setFormData(merged);
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    load();
  }, [user.id]);

  // CÁLCULO DE PERFIL (PSICOMETRÍA REAL)
  useEffect(() => {
      const answers = formData.psych_answers;
      const scores = { sincerity: 0, stability: 0, normativity: 0, leadership: 0 };
      const counts = { sincerity: 0, stability: 0, normativity: 0, leadership: 0 };

      TEST_QUESTIONS.forEach(q => {
          const rawVal = answers[q.id];
          if (rawVal !== undefined) {
              let score = rawVal;

              if (q.factor === 'sincerity' && q.type === 'control') {
                  // LÓGICA DE CONTROL (SINCERIDAD):
                  // Si dices "Muy de acuerdo" (5) a "Nunca he mentido" -> Eres FALSO (Puntuación baja).
                  // Si dices "Muy en desacuerdo" (1) -> Eres SINCERO (Puntuación alta).
                  // Por tanto, invertimos el valor.
                  score = (6 - rawVal); 
              } else if (q.reverse) {
                  // Pregunta inversa normal (ej: "Me altero fácil" -> 5 es baja estabilidad)
                  score = (6 - rawVal);
              }
              
              scores[q.factor as keyof typeof scores] += score;
              counts[q.factor as keyof typeof counts]++;
          }
      });

      // El perfil se compone DENTRO del actualizador, partiendo de `prev`.
      //
      // `formData` es el del cierre y este efecto solo se dispara con
      // `psych_answers`: leerlo fuera partiria de un perfil que puede estar ya
      // obsoleto y pisaria cambios (regla 13). Aqui dentro no hay efectos, solo
      // aritmetica, asi que sigue siendo puro y StrictMode lo puede ejecutar dos
      // veces sin consecuencias (regla 14).
      //
      // Devolver `prev` sin tocar evita el render cuando no hay cambio.
      setFormData(prev => {
          const newProfile = { ...prev.psych_profile };
          (Object.keys(scores) as Array<keyof typeof scores>).forEach(key => {
              if (counts[key] > 0) {
                  newProfile[key] = Math.round((scores[key] / counts[key]) * 20) / 10;
              }
          });

          return JSON.stringify(newProfile) !== JSON.stringify(prev.psych_profile)
              ? { ...prev, psych_profile: newProfile }
              : prev;
      });
  }, [formData.psych_answers]);

  const handleSave = async () => {
    setSaving(true);
    const res = await saveBiodata(formData);
    setSaving(false);
    if (res.success) setLastSaved(new Date());
    else alert("Error: " + res.error);
  };

  const handleChange = (field: keyof BiodataForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTestAnswer = (qId: string, value: number) => {
      setFormData(prev => ({
          ...prev,
          psych_answers: { ...prev.psych_answers, [qId]: value }
      }));
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400"/></div>;

  return (
    <div className="max-w-6xl mx-auto pb-12 animate-in fade-in duration-500">
      
      {/* HEADER CON BOTÓN DE SALIDA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 pt-4 px-2">
        <div className="flex items-center gap-4">
            {/* BOTÓN VOLVER (NUEVO) */}
            {onExit && (
                <button onClick={onExit} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-slate-500"/>
                </button>
            )}
            <div>
                <div className="flex items-center gap-2 mb-1 text-indigo-600 dark:text-indigo-400">
                    <Shield size={18}/>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Expediente C.I.B.</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Perfil Táctico</h2>
            </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-70 transition-all">
          {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
          {saving ? 'GUARDANDO...' : 'GUARDAR DATOS'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* NAVEGACIÓN */}
        <div className="md:col-span-3 space-y-2">
           {SECTIONS.map((section) => {
             const Icon = section.icon;
             const isActive = activeSection === section.id;
             return (
               <button key={section.id} onClick={() => setActiveSection(section.id)} className={`w-full text-left p-4 rounded-xl flex items-center gap-3 transition-all border ${isActive ? 'bg-white dark:bg-slate-900 border-indigo-600 shadow-md scale-105' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-500'}`}>
                 <div className={`p-2 rounded-lg transition-colors ${isActive ? section.bg + ' text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}><Icon size={18}/></div>
                 <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? 'text-slate-900 dark:text-white' : ''}`}>{section.label}</span>
               </button>
             );
           })}
        </div>

        {/* CONTENIDO */}
        <div className="md:col-span-9">
           {/*
             `min-h-[600px]` fijo dejaba a las pestañas con menos texto (p.ej.
             "Personal", dos textareas) con mucho hueco en blanco debajo antes
             de llegar a nada mas: el mismo patron que la caja de temario del
             examen. Se reduce el minimo en movil.
           */}
           <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 shadow-sm min-h-[320px] md:min-h-[600px] relative">
              
              {/* TEXTO (Formularios normales) */}
              {activeSection !== 'test' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase mb-6 flex items-center gap-2">
                          {SECTIONS.find(s=>s.id===activeSection)?.label}
                      </h3>
                      
                      {activeSection === 'personal' && (
                          <div className="space-y-4">
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Antecedentes Familiares *</label><textarea value={formData.family_background} onChange={(e)=>handleChange('family_background',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"/></div>
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Ocio</label><textarea value={formData.leisure_activities} onChange={(e)=>handleChange('leisure_activities',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"/></div>
                          </div>
                      )}
                      {activeSection === 'academic' && (
                          <div className="space-y-4">
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Estudios</label><textarea value={formData.studies_motivation} onChange={(e)=>handleChange('studies_motivation',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"/></div>
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Trabajo</label><textarea value={formData.work_history} onChange={(e)=>handleChange('work_history',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"/></div>
                          </div>
                      )}
                      {activeSection === 'psycho' && (
                          <div className="space-y-4">
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Motivación Policial *</label><textarea value={formData.police_motivation} onChange={(e)=>handleChange('police_motivation',e.target.value)} className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm resize-none"/></div>
                              <div className="grid md:grid-cols-2 gap-4">
                                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Virtudes/Defectos</label><textarea value={formData.strengths_weaknesses} onChange={(e)=>handleChange('strengths_weaknesses',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm resize-none"/></div>
                                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Miedos</label><textarea value={formData.fears_concerns} onChange={(e)=>handleChange('fears_concerns',e.target.value)} className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm resize-none"/></div>
                              </div>
                          </div>
                      )}
                      {activeSection === 'legal' && (
                          <div className="space-y-4">
                              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl text-xs text-red-700 dark:text-red-300 font-medium">Sinceridad absoluta obligatoria.</div>
                              {/* El alumno tiene derecho a saber qué sale de aquí antes de
                                  escribirlo. Ver `buildInterviewProfile` en app/lib/interview.ts. */}
                              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                  <b className="text-slate-900 dark:text-white">Lo que escribas aquí no sale de la aplicación.</b>{' '}
                                  El simulador de entrevista solo recibe si has declarado
                                  incidencias o no, para saber que tiene que preguntarte por
                                  ellas. El texto se queda guardado en tu perfil.
                              </div>
                              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Incidentes Legales *</label><textarea value={formData.legal_issues} onChange={(e)=>handleChange('legal_issues',e.target.value)} className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm resize-none"/></div>
                          </div>
                      )}
                  </div>
              )}

              {/* TEST PSICOTÉCNICO AMPLIADO (30 Items Scrollable) */}
              {activeSection === 'test' && (
                  <div className="animate-in fade-in zoom-in duration-300 grid md:grid-cols-2 gap-8 h-full">
                      <div className="overflow-y-auto pr-2 h-[60vh] md:h-[550px] scrollbar-hide space-y-4 pb-10">
                          <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase mb-4 sticky top-0 bg-white dark:bg-slate-900 z-10 py-2 border-b border-slate-100 dark:border-slate-800">Cuestionario (30 Ítems)</h3>
                          {TEST_QUESTIONS.map((q, i) => (
                              <div key={q.id} className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{i + 1}. {q.text}</p>
                                  <div className="flex justify-between items-center gap-2">
                                      <span className="text-[10px] font-bold text-slate-400">NO</span>
                                      {[1, 2, 3, 4, 5].map((val) => (
                                          <button key={val} onClick={() => handleTestAnswer(q.id, val)} className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${formData.psych_answers[q.id] === val ? 'bg-emerald-500 text-white scale-110 shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-400 border hover:border-emerald-500'}`}>{val}</button>
                                      ))}
                                      <span className="text-[10px] font-bold text-slate-400">SÍ</span>
                                  </div>
                              </div>
                          ))}
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col justify-center h-fit sticky top-0">
                          <div className="text-center mb-6">
                              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"><Target size={32}/></div>
                              <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase">Perfil Táctico</h4>
                              <p className="text-xs text-slate-500 mt-2">Métricas corregidas por deseabilidad social.</p>
                          </div>
                          <div className="space-y-6">
                              {[
                                  { k: 'sincerity', l: 'Sinceridad', d: 'Detecta manipulación' },
                                  { k: 'stability', l: 'Estabilidad', d: 'Resistencia presión' },
                                  { k: 'normativity', l: 'Normatividad', d: 'Apego a normas' },
                                  { k: 'leadership', l: 'Liderazgo', d: 'Mando y decisión' }
                              ].map((metric) => {
                                  const val = formData.psych_profile[metric.k as keyof typeof formData.psych_profile];
                                  let color = "bg-indigo-500";
                                  if (val < 4) color = "bg-red-500"; else if (val > 8) color = "bg-emerald-500";
                                  return (
                                      <div key={metric.k}>
                                          <div className="flex justify-between items-end mb-1">
                                              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">{metric.l}</span>
                                              <span className={`text-xs font-bold ${val < 4 ? 'text-red-500' : 'text-slate-500'}`}>{val}/10</span>
                                          </div>
                                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                              <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${val * 10}%` }}></div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>
              )}
           </div>
           <div className="mt-4 flex justify-between items-center px-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                  {lastSaved ? <><CheckCircle2 size={14} className="text-emerald-500"/><span>Guardado: {lastSaved.toLocaleTimeString()}</span></> : <span>Cambios sin guardar...</span>}
              </div>
              <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">NIVEL 3</div>
           </div>
        </div>
      </div>
    </div>
  );
}
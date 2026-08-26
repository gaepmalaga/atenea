'use client';

import { useState } from 'react';
import { ChevronRight, Dumbbell, MapPin, Activity } from 'lucide-react';
import { normalizeProfileInput, type PhysicalProfile } from '@/app/lib/physical';

interface SetupWizardProps {
    initialData?: PhysicalProfile | null;
    /** Recibe el perfil ya normalizado: numeros, o `null` si el campo va vacio. */
    onSave: (data: PhysicalProfile) => void;
    saving?: boolean;
    error?: string | null;
}

export default function SetupWizard({ initialData, onSave, saving, error }: SetupWizardProps) {
    const [step, setStep] = useState(1);

    // El estado del formulario es de CADENAS a proposito: es lo que devuelve un
    // `<input>`, y forzarlo a numero aqui haria que borrar el campo saltara a 0.
    // La conversion ocurre una sola vez, al guardar, con `normalizeProfileInput`.
    const [formData, setFormData] = useState({
        height: initialData?.height?.toString() ?? '',
        weight: initialData?.weight?.toString() ?? '',
        gender: initialData?.gender ?? 'male',
        birth_year: initialData?.birth_year?.toString() ?? '',
        availability: initialData?.availability ?? 5,
        equipment: initialData?.equipment ?? 'gym',
    });

    const handleNext = () => {
        if (step === 1) setStep(2);
        else onSave(normalizeProfileInput(formData));
    };

    return (
        <div className="max-w-xl mx-auto animate-in fade-in py-8">
            {/* Progress Dots */}
            <div className="flex justify-center gap-2 mb-8">
                <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`}/>
                <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`}/>
            </div>

            <div className="text-center mb-8">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase">
                    {step === 1 ? 'Perfil Biométrico' : 'Logística Táctica'}
                </h2>
                <p className="text-slate-500 mt-2">
                    {step === 1 ? 'Datos básicos para calcular cargas.' : 'Adapta el plan a tu realidad.'}
                </p>
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-8">
                
                {/* PASO 1: BIO */}
                {step === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Altura (cm)</label>
                                <input type="number" value={formData.height} onChange={e=>setFormData({...formData, height: e.target.value})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-emerald-500" placeholder="180"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Peso (kg)</label>
                                <input type="number" value={formData.weight} onChange={e=>setFormData({...formData, weight: e.target.value})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-emerald-500" placeholder="75"/>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Año Nac.</label>
                                <input type="number" value={formData.birth_year} onChange={e=>setFormData({...formData, birth_year: e.target.value})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-emerald-500" placeholder="1995"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Género</label>
                                <select value={formData.gender} onChange={e=>setFormData({...formData, gender: e.target.value === 'female' ? 'female' : 'male'})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500">
                                    <option value="male">Hombre</option>
                                    <option value="female">Mujer</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* PASO 2: LOGÍSTICA */}
                {step === 2 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-3">Días Disponibles por Semana</label>
                            <div className="flex gap-2">
                                {[3, 4, 5, 6].map(d => (
                                    <button 
                                        key={d} 
                                        onClick={() => setFormData({...formData, availability: d})} 
                                        className={`flex-1 py-4 rounded-xl font-black text-lg border transition-all ${formData.availability === d ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-105' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-emerald-500'}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                            {formData.availability < 4 && (
                                <p className="text-xs text-orange-500 mt-2 font-bold flex items-center gap-1 justify-center">
                                    <Activity size={12}/> ADVERTENCIA: Se aumentará la intensidad para compensar.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-3">Material Disponible</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={()=>setFormData({...formData, equipment: 'gym'})} 
                                    className={`p-4 rounded-xl border text-left transition-all ${formData.equipment === 'gym' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'}`}
                                >
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1"><Dumbbell size={18}/> GIMNASIO</div>
                                    <p className="text-[10px] opacity-70">Pesas, poleas, máquinas.</p>
                                </button>
                                <button 
                                    onClick={()=>setFormData({...formData, equipment: 'calisthenics'})} 
                                    className={`p-4 rounded-xl border text-left transition-all ${formData.equipment === 'calisthenics' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 ring-1 ring-orange-500' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'}`}
                                >
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1"><MapPin size={18}/> PARQUE / CASA</div>
                                    <p className="text-[10px] opacity-70">Barra, suelo, gomas.</p>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* El error del servidor se pinta aqui: antes la pantalla avanzaba
                    igual y el alumno creia que sus datos estaban guardados. */}
                {error && (
                    <p className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                        No se pudo guardar: {error}
                    </p>
                )}

                {/* BOTÓN NEXT */}
                <button 
                    onClick={handleNext} 
                    disabled={saving}
                    className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl uppercase tracking-widest hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                >
                    {saving ? 'Guardando…' : step === 1 ? 'Siguiente' : 'Guardar Configuración'} <ChevronRight size={18}/>
                </button>
            </div>
        </div>
    );
}
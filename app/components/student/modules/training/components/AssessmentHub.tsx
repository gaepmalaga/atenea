'use client';

import type { ComponentType } from 'react';
import { Dumbbell, Timer, Activity, CheckCircle2, Save, Loader2, Settings, ChevronRight } from 'lucide-react';
import { isTestDone, readMaxPullups, type PhysicalProfile, type TestId } from '@/app/lib/physical';
import { Card, Button, SectionLabel, cx, TEXT } from '../../../../ui';

interface AssessmentHubProps {
    profile?: PhysicalProfile | null;
    onSelectTest: (testId: TestId) => void;
    onGenerate: () => void;
    generating?: boolean;
    onEditBio?: () => void;
    error?: string | null;
    /** Si la academia ha apagado la generación con IA, no se ofrece el botón. */
    aiOn?: boolean;
}

/**
 * Una prueba física, en una fila.
 *
 * ANTES: tres tarjetas de `p-8` con un icono decorativo de 100px de fondo, un
 * titulo de `text-2xl` y una linea de texto. En un movil cada una medía ~300px
 * de alto, asi que este menu de TRES OPCIONES ocupaba 900px de scroll y no
 * cabia entero en ninguna pantalla. Y eran `<div onClick>`: no se podian
 * pulsar con el teclado ni las anunciaba un lector de pantalla.
 */
function FilaPrueba({
    icon: Icon, titulo, descripcion, hecha, marca, onClick, tono,
}: {
    icon: ComponentType<{ size?: number; className?: string }>;
    titulo: string;
    descripcion: string;
    hecha: boolean;
    marca?: string | null;
    onClick: () => void;
    tono: string;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left min-h-[44px] group"
        >
            <Card
                className={cx(
                    'flex items-center gap-3 sm:gap-4 transition-colors',
                    hecha
                        ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-900/10'
                        : 'group-hover:border-indigo-300',
                )}
            >
                <span
                    className={cx(
                        'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                        hecha ? 'bg-emerald-500 text-white' : tono,
                    )}
                >
                    {hecha ? <CheckCircle2 size={22} /> : <Icon size={22} />}
                </span>

                <span className="flex-1 min-w-0">
                    <span className="block font-black text-base text-slate-900 dark:text-white">{titulo}</span>
                    <span className={cx('block', TEXT.muted)}>{descripcion}</span>
                </span>

                {/* La marca conseguida, si la hay. `null` no es `0`: quien no ha
                    hecho la prueba no tiene un cero, no tiene dato (regla 8). */}
                {hecha && marca && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-black text-sm tabular-nums shrink-0">
                        {marca}
                    </span>
                )}
                <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
            </Card>
        </button>
    );
}

export default function AssessmentHub({ profile, onSelectTest, onGenerate, generating, onEditBio, error, aiOn = true }: AssessmentHubProps) {
    const metrics = profile?.baseline_metrics ?? {};
    // "Hecho" es "tiene una marca numerica". Antes bastaba con que la clave
    // existiera, asi que una cadena vacia guardada por el asistente daba la
    // prueba por superada.
    const isForceDone = isTestDone(metrics, 'force');
    const isCooperDone = isTestDone(metrics, 'cooper');
    const isAgilityDone = isTestDone(metrics, 'agility');
    const maxPullups = readMaxPullups(profile);

    const isComplete = isForceDone && isCooperDone; // Agilidad a veces es opcional, pero mejor pedir todo.
    const hechas = [isForceDone, isCooperDone, isAgilityDone].filter(Boolean).length;

    // SIN TITULO PROPIO. `Header` ya pinta "PREP. FÍSICA · PREPARACIÓN FÍSICA";
    // debajo iba un "CENTRO DE EVALUACIÓN" de `text-4xl` que era la segunda
    // cabecera de la misma pantalla, y en movil las dos juntas se comian 300px
    // antes del primer control. Ademas "Editar datos" estaba en la misma fila
    // que la explicacion y se tocaban: `justify-between` sin envolver.
    return (
        <div className="max-w-3xl mx-auto animate-in fade-in space-y-5">
            <SectionLabel
                aside={
                    onEditBio && (
                        <button
                            onClick={onEditBio}
                            className="min-h-[44px] px-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-emerald-500 transition-colors"
                        >
                            <Settings size={15} /> Editar datos
                        </button>
                    )
                }
            >
                {hechas} de 3 pruebas
            </SectionLabel>

            <p className={cx(TEXT.muted, '-mt-2')}>
                Haz las pruebas para que la plataforma pueda escribirte un plan con tus marcas de verdad.
            </p>

            <div className="space-y-2 sm:space-y-3">
                <FilaPrueba
                    icon={Dumbbell}
                    titulo="Fuerza"
                    descripcion="Dominadas estrictas o suspensión."
                    hecha={isForceDone}
                    marca={maxPullups ? `${maxPullups} ${metrics.pullups_method === 'suspension' ? 'seg' : 'reps'}` : null}
                    onClick={() => onSelectTest('force')}
                    tono="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500"
                />
                <FilaPrueba
                    icon={Timer}
                    titulo="Resistencia"
                    descripcion="Test de Cooper (12 minutos)."
                    hecha={isCooperDone}
                    marca={metrics.cooper_distance ? `${metrics.cooper_distance} m` : null}
                    onClick={() => onSelectTest('cooper')}
                    tono="bg-orange-100 dark:bg-orange-900/30 text-orange-500"
                />
                <FilaPrueba
                    icon={Activity}
                    titulo="Agilidad"
                    descripcion="Circuito policial."
                    hecha={isAgilityDone}
                    marca={metrics.agility_time ? `${metrics.agility_time} s` : null}
                    onClick={() => onSelectTest('agility')}
                    tono="bg-red-100 dark:bg-red-900/30 text-red-500"
                />
            </div>

            {error && (
                <p className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    {error}
                </p>
            )}

            {aiOn ? (
                <Button
                    block
                    size="lg"
                    onClick={onGenerate}
                    disabled={!isComplete || generating}
                    icon={generating ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                >
                    {generating
                        ? 'Analizando tus marcas…'
                        : isComplete
                          ? 'Generar mi plan'
                          : 'Faltan pruebas por hacer'}
                </Button>
            ) : (
                <p className={cx(TEXT.muted, 'text-center leading-relaxed bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4')}>
                    Tu academia lleva la preparación física con un plan de grupo. Aquí puedes
                    ir registrando tus marcas; el plan lo verás en cuanto tu preparador lo publique.
                </p>
            )}
        </div>
    );
}

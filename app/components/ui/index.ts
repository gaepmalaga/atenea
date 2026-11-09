/**
 * El sistema de diseño de Atenea.
 *
 * Todo lo que se pinta sale de aquí. Si una pantalla necesita algo que no
 * está, se AÑADE aquí y se usa desde las dos partes (alumno y admin); no se
 * escribe a mano en la pantalla, que es exactamente cómo se llegó a tener
 * nueve radios y trece rellenos distintos conviviendo.
 *
 * Hay un test que lo vigila: `tests/design-system.test.ts`.
 */

export { default as Card } from './Card';
export { default as Button } from './Button';
export { default as PageHeader } from './PageHeader';
export { default as SectionLabel } from './SectionLabel';
export { default as StatTile } from './StatTile';
export { default as Modal } from './Modal';
export { default as EmptyState } from './EmptyState';
export { default as OptionCard, OptionGroup } from './OptionCard';
export { TextField, TextAreaField, SelectField } from './Field';
export { Kicker, HeroMarino, Fichas, Interruptor } from './Marca';
export { default as useAltoDisponible } from './useAltoDisponible';
export { RADIUS, PAD, GAP, ELEVATION, SURFACE, TEXT, TAP, cx } from './tokens';

// El panel de administración (regla 101)
export { HOJA, HUNDIDO, LINEA, TONO_TEXTO, TONO_ETIQUETA, TONO_PUNTO, type Tono } from './panel/estilos';
export { default as PanelTitulo } from './panel/PanelTitulo';
export { default as Pulso, type CifraPulso } from './panel/Pulso';
export { Etiqueta, Estado, Dato } from './panel/Etiqueta';
export { default as Avatar, inicialesDeCorreo, inicialesDeNombre, nombreDeCorreo } from './panel/Avatar';
export { Filtros, FiltroChip } from './panel/Filtros';
export { default as Pestanas, type PestanaItem } from './panel/Pestanas';
export { default as Boton } from './panel/Boton';
export { default as Conmutador } from './panel/Conmutador';
export { Hoja, BloqueTitulo, Rotulo, Aviso, Atras } from './panel/Hoja';
export { default as TablaDual, type Columna } from './panel/TablaDual';
export { default as PanelLateral } from './panel/PanelLateral';
export { default as PanelShell, type PestanaPanel } from './panel/PanelShell';

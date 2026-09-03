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
export { default as useAltoDisponible } from './useAltoDisponible';
export { RADIUS, PAD, GAP, ELEVATION, SURFACE, TEXT, TAP, cx } from './tokens';

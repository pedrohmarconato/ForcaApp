// src/components/ui/index.ts
// Ponto único de importação dos primitivos da identidade "Força sem ruído".
// As telas importam daqui — nunca declaram cor, fonte, raio ou espaçamento
// próprios.

export { default as Button, type ButtonVariant } from './Button';
export { default as TextField } from './TextField';
export { ForcaMark, ForcaLockup } from './Logo';
export { Screen, ScreenTitle, Card, SectionHeader, ListRow, Divider } from './Surface';
export { OptionButton, DayToggle, CheckboxRow, StackHeader } from './Controls';
export { Chip, Metric, MetricGroup, ProgressTrack, EmptyState, Notice, NO_DATA } from './Feedback';

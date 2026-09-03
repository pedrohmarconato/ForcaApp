// src/components/AppOpening.tsx
// Reexporta a implementação — ver src/components/opening/AppOpening.tsx e
// src/components/opening/timeline.ts (coreografia, tempos, decisão de saída
// sincronizada com o boot via `isReady`). Mantido como ponto de importação
// estável (App.tsx importa daqui); rollback = reverter o commit que trocou
// este arquivo por este reexport.
export { AppOpening, default, type AppOpeningProps } from './opening/AppOpening';

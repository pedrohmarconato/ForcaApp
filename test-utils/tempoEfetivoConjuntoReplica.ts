// test-utils/tempoEfetivoConjuntoReplica.ts
//
// Réplica JS fiel da reconstrução de posse do turno feita por
// `_forca_tempo_efetivo_segundos` na migration 0029
// (supabase/migrations/0029_tempo_efetivo_conjunto.sql:139-190 — CTEs
// `turnos`, `posse`, `pares`, `sobreposicoes`, `por_par`). Mesma lógica,
// mesmas fórmulas, só trocando SQL por JS.
//
// Por que fica FORA de __tests__/: o testMatch padrão do Jest
// (`**/__tests__/**/*.[jt]s?(x)`) trata qualquer arquivo .ts sob __tests__/
// como suíte, independente do nome — um módulo de suporte sem `describe`/`it`
// ali dentro quebraria com "Your test suite must contain at least one test".
//
// Compartilhado por dois arquivos de teste, para não duplicar a réplica:
//   - __tests__/turnAdvancedHandoffMigration.test.ts (achado P2 / migration
//     0030): prova o handoff de fila/conclusão sem 'turn_advanced'.
//   - __tests__/tempoEfetivoConjuntoMigration.test.ts (achado P3): prova o
//     núcleo posse/soma/teto da própria 0029 — casos A=9/B=6, borda
//     1206→1200 e a distinção least(sum(secs),1200) vs sum(least(secs,1200)).
//
// Limitação deliberada, registrada e não resolvida aqui: esta réplica não
// gateia o SQL real da 0029 — um Postgres efêmero (pg_temp em CI) gatearia,
// mas está fora do escopo desta remediação. Ver `deviations` do commit que
// introduziu este arquivo.

export type JointEventoTurno = {
  seq: number;
  kind: string;
  createdAtMs: number;
  payload: { next_turn_user_id?: string };
};

export type SegmentoPosse = {
  holder: string;
  desde: number; // ms; -Infinity representa '-infinity'::timestamptz
  ate: number; // ms; +Infinity representa 'infinity'::timestamptz
};

// Espelha a CTE `turnos` + o segmento sintético da CTE `posse` (0029:139-153).
export function reconstruirPosseDoTurno(
  eventos: JointEventoTurno[],
  self: string,
): SegmentoPosse[] {
  const turnosBrutos = eventos
    .filter((e) => e.kind === 'started' || e.kind === 'turn_advanced')
    .slice()
    .sort((a, b) => a.seq - b.seq);

  const turnos: SegmentoPosse[] = turnosBrutos.map((e, i) => ({
    holder: e.payload.next_turn_user_id as string,
    desde: e.createdAtMs,
    ate: i + 1 < turnosBrutos.length ? turnosBrutos[i + 1].createdAtMs : Infinity,
  }));

  // coalesce((select min(desde) from turnos), 'infinity'::timestamptz)
  const minDesde = turnos.length > 0 ? Math.min(...turnos.map((t) => t.desde)) : Infinity;

  const sintetico: SegmentoPosse = { holder: self, desde: -Infinity, ate: minDesde };

  return [sintetico, ...turnos];
}

// Espelha `eventos`/`pares`/`sobreposicoes`/`por_par` (0029:155-190), sem o
// ajuste de cardio (0029:193-199) — fora do escopo dos achados P2/P3, já
// coberto pelo teste estrutural da própria 0029.
//
// O teto é aplicado UMA VEZ por intervalo bruto (ts_a,ts_b), sobre a SOMA das
// sobreposições do próprio dono dentro desse intervalo — `least(sum(secs),
// 1200)`, nunca `sum(least(secs,1200))` por sobreposição isolada. É essa
// ordem de operações — somar primeiro, tetar depois — que o achado P3 cobra
// prova comportamental para.
export function tempoEfetivoPorPosse(
  posse: SegmentoPosse[],
  self: string,
  sessionStartMs: number,
  ownSetCompletionsMs: number[],
  sessionEndMs: number,
): number {
  const eventosBruto = [sessionStartMs, ...ownSetCompletionsMs, sessionEndMs].sort(
    (a, b) => a - b,
  );

  let total = 0;
  for (let i = 0; i < eventosBruto.length - 1; i++) {
    const tsA = eventosBruto[i];
    const tsB = eventosBruto[i + 1];

    let somaSobreposicoes = 0;
    for (const seg of posse) {
      if (seg.holder !== self) continue;
      if (!(seg.desde < tsB && seg.ate > tsA)) continue;
      const secs = Math.max((Math.min(tsB, seg.ate) - Math.max(tsA, seg.desde)) / 1000, 0);
      somaSobreposicoes += secs;
    }
    total += Math.min(somaSobreposicoes, 1200);
  }
  return Math.round(total);
}

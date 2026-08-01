// __tests__/jointSessionMigration.test.ts
// Treino Conjunto 2.0 — Sprint 01. Asserções ESTÁTICAS sobre a 0026.
//
// Não substituem a prova em HML: pegam a classe de erro que só aparece meses
// depois, quando alguém edita a migration e esquece um revoke. O padrão vem de
// recusaDeclarada.test.ts, que já lê a 0020 do disco.
//
// Modos de falha cobertos:
//  1. RPC nova criada e o `revoke ... from anon` esquecido — o furo exato que a
//     0019 revelou (default privileges do Supabase concedem EXECUTE a anon);
//  2. função sem `set search_path` — porta de search_path hijacking;
//  3. policy de escrita aparecendo nas tabelas de domínio;
//  4. `joint_invite_attempts` ganhando policy ou grant;
//  5. função interna exposta a `authenticated`;
//  6. guard removido de planned_sessions/session_logs;
//  7. tabela nova esquecida na publicação de Realtime — ou attempts entrando
//     nela por engano.

import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0026_treino_conjunto.sql'),
  'utf8',
);

/** As 14 RPCs de cliente, com a assinatura exata usada nos grants. */
const RPCS_DE_CLIENTE = [
  'public.create_joint_session()',
  'public.join_joint_session(text)',
  'public.set_joint_session_mode(uuid, text, text)',
  'public.confirm_joint_participant_session(uuid, uuid)',
  'public.materialize_joint_session_copy(uuid)',
  'public.set_joint_participant_ready(uuid, boolean)',
  'public.advance_joint_turn(uuid, text, bigint, uuid)',
  'public.mark_joint_queue_finished(uuid)',
  'public.pause_joint_session(uuid, text)',
  'public.resume_joint_session(uuid)',
  'public.touch_joint_presence(uuid)',
  'public.complete_joint_participant(uuid)',
  'public.abandon_joint_session(uuid)',
  'public.joint_session_partner_profile(uuid)',
];

const INTERNAS = [
  'public._forca_papel_de_cliente()',
  'public._forca_joint_presenca_ttl()',
  'public._forca_joint_payload_valido(jsonb)',
  'public._forca_joint_codigo_novo()',
  'public._forca_joint_papel(uuid, uuid)',
  'public._forca_joint_fila_pendente(uuid)',
];

describe('grants das RPCs de cliente', () => {
  it.each(RPCS_DE_CLIENTE)('%s é revogada de public E de anon', (assinatura) => {
    expect(sql).toContain(`revoke all on function ${assinatura}`);
    const linha = sql
      .split('\n')
      .find((l) => l.includes(`revoke all on function ${assinatura}`));
    expect(linha).toBeDefined();
    // `revoke from public` sozinho NÃO corta anon — aprendizado da 0019.
    expect(linha).toMatch(/from public, anon/);
  });

  it.each(RPCS_DE_CLIENTE)('%s é concedida a authenticated', (assinatura) => {
    expect(sql).toContain(`grant execute on function ${assinatura}`);
  });
});

describe('funções internas ficam fora do alcance do cliente', () => {
  it.each(INTERNAS)('%s é revogada inclusive de authenticated', (assinatura) => {
    const linha = sql
      .split('\n')
      .find((l) => l.includes(`revoke all on function ${assinatura}`));
    expect(linha).toBeDefined();
    expect(linha).toMatch(/from public, anon, authenticated/);
  });

  it('nenhuma interna recebe grant de execute', () => {
    for (const assinatura of INTERNAS) {
      expect(sql).not.toContain(`grant execute on function ${assinatura}`);
    }
  });
});

describe('search_path travado', () => {
  it('toda função criada declara search_path', () => {
    const criacoes = sql.match(/create or replace function [^\n]*\n/g) ?? [];
    expect(criacoes.length).toBeGreaterThan(20);
    // Cada bloco de função até o `as $$` precisa conter o set.
    const blocos = sql.split('create or replace function ').slice(1);
    const semSearchPath = blocos
      .map((b) => {
        const cabecalho = b.slice(0, b.indexOf('as $$'));
        const nome = b.slice(0, b.indexOf('(')).trim();
        return cabecalho.includes('set search_path = public, pg_temp') ? null : nome;
      })
      .filter(Boolean);
    expect(semSearchPath).toEqual([]);
  });
});

describe('RLS das tabelas novas', () => {
  const DOMINIO = ['joint_sessions', 'joint_session_participants', 'joint_session_events'];

  it.each(DOMINIO)('%s tem RLS habilitada', (tabela) => {
    expect(sql).toMatch(
      new RegExp(`alter table public\\.${tabela}\\s+enable row level security`),
    );
  });

  it.each(DOMINIO)('%s só tem policy de SELECT', (tabela) => {
    const policies = sql
      .split('\n')
      .filter((l) => l.includes(`on public.${tabela}`) && l.trim().startsWith('create policy'));
    // As policies são criadas em bloco multi-linha; conferimos pelo `for select`.
    const criadas = sql.match(new RegExp(`create policy "[^"]+" on public\\.${tabela}\\s+for (\\w+)`, 'g')) ?? [];
    expect(criadas.length).toBe(1);
    expect(criadas[0]).toMatch(/for select/);
    expect(policies.length).toBeLessThanOrEqual(1);
  });

  it.each(DOMINIO)('%s não concede escrita direta a authenticated', (tabela) => {
    expect(sql).toMatch(
      new RegExp(`revoke insert, update, delete, truncate on table public\\.${tabela}\\s+from authenticated`),
    );
    expect(sql).toMatch(new RegExp(`grant select on table public\\.${tabela}\\s+to authenticated`));
  });

  it('joint_invite_attempts tem RLS, zero policies e zero grants', () => {
    expect(sql).toMatch(/alter table public\.joint_invite_attempts\s+enable row level security/);
    expect(sql).not.toMatch(/create policy [^\n]* on public\.joint_invite_attempts/);
    expect(sql).toMatch(
      /revoke all on table public\.joint_invite_attempts\s+from public, anon, authenticated/,
    );
    expect(sql).not.toMatch(/grant \w+ on table public\.joint_invite_attempts/);
  });
});

describe('guard das tabelas existentes', () => {
  it('instala o gatilho em planned_sessions e em session_logs', () => {
    expect(sql).toContain('create trigger planned_sessions_guarda_joint');
    expect(sql).toContain('before update or delete on public.planned_sessions');
    expect(sql).toContain('create trigger session_logs_guarda_joint');
    expect(sql).toContain('before insert or update or delete on public.session_logs');
  });

  it('decide por current_user, não por flag de transação spoofável', () => {
    expect(sql).toMatch(/select current_user in \('authenticated', 'anon'\)/);
  });

  // Esta é a trava do bug que a prova em HML pegou: com SECURITY DEFINER,
  // `current_user` dentro do gatilho vira o DONO da função, e
  // `_forca_papel_de_cliente()` responde "não é cliente" para todo mundo — o
  // guard passa a AUTORIZAR exatamente o que existe para barrar, sem erro
  // nenhum aparecer. Se alguém devolver estas funções para DEFINER, este teste
  // quebra antes de o furo voltar para HML.
  it.each([
    '_forca_guarda_planned_session',
    '_forca_guarda_session_log',
    '_forca_joint_evento_imutavel',
  ])('%s é SECURITY INVOKER — DEFINER desligaria o guard em silêncio', (fn) => {
    const bloco = sql.slice(sql.indexOf(`create or replace function public.${fn}()`));
    const cabecalho = bloco.slice(0, bloco.indexOf('as $$'));
    expect(cabecalho).toContain('security invoker');
    expect(cabecalho).not.toContain('security definer');
  });

  it('as leituras do guard passam por helper DEFINER — a RLS não pode cegá-lo', () => {
    for (const helper of [
      '_forca_joint_status',
      '_forca_joint_vinculo_por_sessao',
    ]) {
      const bloco = sql.slice(sql.indexOf(`create or replace function public.${helper}(`));
      expect(bloco.slice(0, bloco.indexOf('as $$'))).toContain('security definer');
    }
    expect(sql).toContain('v_status := public._forca_joint_status(v_vinculo);');
    expect(sql).toContain('public._forca_joint_vinculo_por_sessao(new.planned_session_id)');
  });

  it('append-only recusa o cliente mas deixa o cascade de auth.users passar', () => {
    // Uma trilha de auditoria que impede apagar a conta é retenção indevida
    // disfarçada de integridade — e trava o direito do titular.
    const bloco = sql.slice(sql.indexOf('function public._forca_joint_evento_imutavel()'));
    expect(bloco).toMatch(/if tg_op = 'UPDATE' then[\s\S]{0,200}append-only \(UPDATE recusado\)/);
    expect(bloco).toMatch(/if public\._forca_papel_de_cliente\(\) then[\s\S]{0,200}DELETE recusado/);
  });

  it('sai cedo quando não há vínculo — o fluxo solo não paga nada', () => {
    expect(sql).toContain('if old.joint_session_id is null and new.joint_session_id is null then');
  });

  it('não reescreve nenhuma RPC solo pré-existente', () => {
    for (const fn of [
      'function public.start_session',
      'function public.finish_session',
      'function public.save_set_log',
      'function public.skip_planned_session',
      'function public.unskip_planned_session',
    ]) {
      expect(sql).not.toContain(`create or replace ${fn}`);
    }
  });
});

describe('índices que sustentam os invariantes', () => {
  it.each([
    ['joint_sessions_invite_code_idx', 'código de convite único'],
    ['joint_participants_um_vivo_por_usuario_idx', 'um treino conjunto vivo por pessoa'],
    ['joint_participants_papel_unico_idx', 'um host e um guest'],
    ['joint_participants_sessao_unica_idx', 'uma sessão planejada por treino conjunto'],
    ['joint_events_seq_idx', 'seq único por sessão'],
    ['joint_events_client_id_idx', 'idempotência por client_event_id'],
    ['joint_events_set_log_idx', 'uma série confirma o turno uma vez'],
    ['training_plans_um_container_joint_idx', 'um container joint por usuário'],
  ])('%s existe (%s)', (indice) => {
    expect(sql).toContain(indice);
  });

  it('o unique de pertencimento vivo é parcial em `live`', () => {
    expect(sql).toMatch(
      /joint_participants_um_vivo_por_usuario_idx[\s\S]{0,120}\(user_id\)\s*\n\s*where live/,
    );
  });
});

describe('publicação de Realtime', () => {
  it.each(['joint_sessions', 'joint_session_participants', 'joint_session_events'])(
    'adiciona %s de forma idempotente',
    (tabela) => {
      expect(sql).toContain(`alter publication supabase_realtime add table public.${tabela}`);
      expect(sql).toContain(`and tablename = '${tabela}'`);
    },
  );

  it('NÃO publica o contador de tentativas', () => {
    expect(sql).not.toContain(
      'alter publication supabase_realtime add table public.joint_invite_attempts',
    );
  });
});

describe('coerência do schema', () => {
  it('o turno nunca é de um terceiro (usa is not distinct from, não IN)', () => {
    expect(sql).toContain('current_turn_user_id is not distinct from guest_user_id');
  });

  it('pausa e fim são coerentes com o status', () => {
    expect(sql).toContain('check (pause_reason is null or status = \'paused\')');
    expect(sql).toContain(
      "check ((ended_at is not null) = (status in ('completed','canceled','abandoned')))",
    );
  });

  it('o vínculo em planned_sessions é set null, não restrict', () => {
    expect(sql).toMatch(
      /joint_session_id uuid\s*\n\s*references public\.joint_sessions \(id\) on delete set null/,
    );
  });

  it('a trilha de eventos é append-only por gatilho', () => {
    expect(sql).toContain('create trigger joint_events_imutavel');
    expect(sql).toContain('before update or delete on public.joint_session_events');
  });

  it('terminal é imutável por gatilho, não só por convenção das RPCs', () => {
    expect(sql).toContain('create trigger joint_sessions_terminal_imutavel');
  });

  it('o payload dos eventos tem allowlist e recusa dado privado', () => {
    expect(sql).toContain('joint_events_payload_allowlist');
    for (const proibida of ['notes', 'injury_flags', 'raw_plan', 'target_load_kg']) {
      expect(sql).not.toMatch(new RegExp(`'${proibida}',`));
    }
  });
});

describe('a cópia não leva dado privado do parceiro', () => {
  it('grava notes, name_original e injury_flags zerados', () => {
    expect(sql).toMatch(/null, null, '\{\}'::text\[\], v_ex\.exercise_key, v_ex\.metric/);
  });

  it('nunca copia target_load_kg', () => {
    expect(sql).toMatch(
      /select v_novo_ex, ps\.set_order, ps\.target_reps_min, ps\.target_reps_max,\s*\n\s*null, ps\.target_rir/,
    );
  });

  it('copia exercise_key, metric e os alvos de cardio', () => {
    expect(sql).toContain('v_ex.exercise_key, v_ex.metric');
    expect(sql).toContain('ps.target_duration_seconds, ps.target_distance_m');
  });

  it('o container não carrega raw_plan nem descrição', () => {
    expect(sql).toMatch(/values \(v_uid, 'Treinos conjuntos', null, 'archived', 'user', 'joint', null\)/);
  });
});

describe('bloco final de asserções', () => {
  it('a migration falha se algo prometido não existir', () => {
    expect(sql).toContain('asserção falhou');
    expect(sql).toMatch(/asserção falhou: anon ainda executa/);
    expect(sql).toMatch(/asserção falhou: authenticated escreve direto em/);
    expect(sql).toMatch(/asserção falhou: guard de planned_sessions ausente/);
  });
});

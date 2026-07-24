# backend/services/plan_mapper.py
# Mapeador PURO (sem I/O): JSON do plano gerado pela IA → linhas das tabelas
# training_plans / planned_sessions / planned_exercises / planned_sets.
# Regras importantes:
# - user_id vem SEMPRE do token validado, nunca do payload (anti-spoofing).
# - Datas deterministas: semana N começa na segunda-feira da semana de
#   start_date + (N-1)*7 dias; dia_semana da IA vira offset dentro da semana.
# - Formatos tolerantes: reps "8-12"/"10"/"AMRAP", descanso "60s"/90/"2min".
# - Carga em kg e RIR ficam nulos: o aluno informa a 1ª carga na execução (Fase 4).

import datetime
import re
import uuid
from typing import Any, Dict, List, Optional

from backend.services.exercise_catalog import (
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
    resolver_exercicio,
)

# Faixa padrão INTERNA quando a IA não dá número de reps (ex.: "AMRAP").
# É um alvo de trabalho para o motor de adaptação — a UI exibe reps_raw,
# nunca esta faixa, quando a prescrição original não é numérica.
DEFAULT_REPS_MIN = 8
DEFAULT_REPS_MAX = 12

# Duração de último recurso para cardio/isometria sem prescrição legível.
# Uma série tem de prescrever algo (CHECK planned_sets_alvo_coerente).
DEFAULT_DURACAO_CARDIO_SEGUNDOS = 20 * 60

# Tetos de sanidade contra JSON malicioso/decoerente da IA (achado #6 do review):
# sem eles, "series": 100000000 explodiria a memória do processo.
MAX_SERIES_POR_EXERCICIO = 10
MAX_TOTAL_SETS = 2000

_DIA_SEMANA_OFFSET = {
    "segunda": 0, "segunda-feira": 0,
    "terca": 1, "terça": 1, "terca-feira": 1, "terça-feira": 1,
    "quarta": 2, "quarta-feira": 2,
    "quinta": 3, "quinta-feira": 3,
    "sexta": 4, "sexta-feira": 4,
    "sabado": 5, "sábado": 5,
    "domingo": 6,
}

_PRIORIDADE_MAP = {
    "primario": "primary", "primário": "primary", "primary": "primary",
    "secundario": "secondary", "secundário": "secondary", "secondary": "secondary",
    "acessorio": "accessory", "acessório": "accessory", "accessory": "accessory",
}


def _parse_reps(valor: Any) -> (int, int):
    """'8-12' → (8, 12); '10' → (10, 10); sem número → faixa padrão."""
    if isinstance(valor, int) and valor >= 1:
        return valor, valor
    numeros = [int(n) for n in re.findall(r"\d+", str(valor or ""))]
    numeros = [n for n in numeros if n >= 1]
    if not numeros:
        return DEFAULT_REPS_MIN, DEFAULT_REPS_MAX
    if len(numeros) == 1:
        return numeros[0], numeros[0]
    minimo, maximo = numeros[0], numeros[1]
    if maximo < minimo:
        minimo, maximo = maximo, minimo
    return minimo, maximo


def _parse_duracao_segundos(valor: Any) -> Optional[int]:
    """
    Duração prescrita para cardio/isometria: '20min' → 1200, '45s' → 45,
    '1h' → 3600, '25-30min' → 1500 (usa o piso da faixa), 30 → 1800 (número
    puro em campo de duração é minuto). Sem número legível → None.
    """
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return int(valor * 60) if valor > 0 else None
    texto = str(valor).strip().lower()
    numeros = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", texto)]
    if not numeros:
        return None
    n = numeros[0]  # faixa "25-30min": prescreve o piso
    if "h" in texto and "min" not in texto:
        segundos = n * 3600
    elif re.search(r"\bs\b|seg|\ds\b", texto) and "min" not in texto:
        segundos = n
    else:
        segundos = n * 60  # 'min' explícito ou número puro
    segundos = int(round(segundos))
    return segundos if segundos > 0 else None


def _parse_distancia_metros(valor: Any) -> Optional[float]:
    """'5km' → 5000; '800m' → 800; '5,5 km' → 5500. Sem unidade → None."""
    if valor is None:
        return None
    texto = str(valor).strip().lower()
    achado = re.search(r"(\d+(?:[.,]\d+)?)\s*(km|m)\b", texto)
    if not achado:
        return None
    n = float(achado.group(1).replace(",", "."))
    metros = n * 1000 if achado.group(2) == "km" else n
    return metros if metros > 0 else None


def _parse_descanso_segundos(valor: Any) -> Optional[int]:
    """'60s' → 60; 90 → 90; '2min' → 120; ausente/ilegível → None."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return int(valor) if valor > 0 else None
    texto = str(valor).strip().lower()
    numeros = re.findall(r"\d+", texto)
    if not numeros:
        return None
    n = int(numeros[0])
    if "min" in texto:
        n *= 60
    return n if n > 0 else None


def _observacoes_com_qualificador(observacoes: Any, qualificador: Optional[str]) -> Optional[str]:
    """
    O que vinha entre parênteses no nome ('(Deload)', '(Goblet - Mínimo)') sai
    da identidade do exercício e vira observação — a informação não se perde,
    mas para de quebrar o casamento por nome.
    """
    base = str(observacoes).strip() if observacoes not in (None, "") else ""
    extra = (qualificador or "").strip()
    if not extra:
        return base or None
    if extra.lower() in base.lower():
        return base or None
    return f"{base} ({extra})".strip() if base else extra


def _prioridade(ex: Dict[str, Any]) -> str:
    """Usa a prioridade declarada pela IA; sem ela, fallback por ordem:
    1 → primary, 2-3 → secondary, 4+ → accessory."""
    declarada = str(ex.get("prioridade") or "").strip().lower()
    if declarada in _PRIORIDADE_MAP:
        return _PRIORIDADE_MAP[declarada]
    ordem = ex.get("ordem")
    if isinstance(ordem, int):
        if ordem <= 1:
            return "primary"
        if ordem <= 3:
            return "secondary"
    return "accessory"


def _offset_dia_semana(dia: Any, order_in_week: int) -> int:
    """Offset (0=segunda … 6=domingo) dentro da semana. Sem dia utilizável,
    distribui pela ordem da sessão na semana."""
    if isinstance(dia, int) and 0 <= dia <= 6:
        return dia
    chave = str(dia or "").strip().lower()
    if chave in _DIA_SEMANA_OFFSET:
        return _DIA_SEMANA_OFFSET[chave]
    return min(max(order_in_week - 1, 0), 6)


def _uuid_ou_none(valor: Any) -> Optional[str]:
    try:
        return str(uuid.UUID(str(valor)))
    except (ValueError, TypeError, AttributeError):
        return None


def mapear_plano_ia(
    plano: Dict[str, Any],
    user_id: str,
    start_date: Optional[datetime.date] = None,
) -> Dict[str, Any]:
    """
    Converte o plano da IA em linhas prontas para o PostgREST.
    Retorna {"plan": {...}, "sessions": [...], "exercises": [...], "sets": [...]}.
    Levanta ValueError se o plano não tiver nenhuma sessão utilizável.
    """
    if not isinstance(plano, dict):
        raise ValueError("Plano inválido: esperado objeto JSON.")
    principal = plano.get("plano_principal") or {}
    if not isinstance(principal, dict):
        raise ValueError("Plano inválido: 'plano_principal' ausente.")

    inicio = start_date or datetime.date.today()
    # Semana 1 = semana-calendário de start_date, ancorada na segunda-feira
    segunda_semana1 = inicio - datetime.timedelta(days=inicio.weekday())

    plan_id = str(uuid.uuid4())
    plan_row: Dict[str, Any] = {
        "id": plan_id,
        "user_id": user_id,
        "source_plan_id": _uuid_ou_none(plano.get("treinamento_id")),
        "name": str(principal.get("nome") or "Plano de Treino"),
        "description": principal.get("descricao"),
        "periodization_type": (principal.get("periodizacao") or {}).get("tipo"),
        "duration_weeks": principal.get("duracao_semanas")
        if isinstance(principal.get("duracao_semanas"), int) and principal.get("duracao_semanas") >= 1
        else 12,
        "sessions_per_week": principal.get("frequencia_semanal")
        if isinstance(principal.get("frequencia_semanal"), int) and principal.get("frequencia_semanal") >= 1
        else 3,
        "start_date": inicio.isoformat(),
        "status": "active",
        "raw_plan": plano,
        "created_by": "ai",
    }

    sessions: List[Dict[str, Any]] = []
    exercises: List[Dict[str, Any]] = []
    sets: List[Dict[str, Any]] = []

    for ciclo in principal.get("ciclos") or []:
        if not isinstance(ciclo, dict):
            continue
        for micro in ciclo.get("microciclos") or []:
            if not isinstance(micro, dict):
                continue
            semana = micro.get("semana")
            if not isinstance(semana, int) or semana < 1:
                semana = 1
            sessoes_semana = [s for s in (micro.get("sessoes") or []) if isinstance(s, dict)]
            for ordem_na_semana, sessao in enumerate(sessoes_semana, start=1):
                session_id = str(uuid.uuid4())
                offset = _offset_dia_semana(sessao.get("dia_semana"), ordem_na_semana)
                data_agendada = segunda_semana1 + datetime.timedelta(days=(semana - 1) * 7 + offset)
                # Nunca agendar antes do início do plano (achado #8: gerar numa
                # sexta ancorava a semana 1 na segunda ANTERIOR ao início)
                if data_agendada < inicio:
                    data_agendada = inicio
                grupos = [
                    g.get("nome")
                    for g in (sessao.get("grupos_musculares") or [])
                    if isinstance(g, dict) and g.get("nome")
                ]
                sessions.append({
                    "id": session_id,
                    "plan_id": plan_id,
                    "user_id": user_id,
                    "week_number": semana,
                    "day_of_week": sessao.get("dia_semana") if isinstance(sessao.get("dia_semana"), str) else None,
                    "order_in_week": ordem_na_semana,
                    "title": str(sessao.get("nome") or "Treino"),
                    "session_type": sessao.get("tipo"),
                    "scheduled_date": data_agendada.isoformat(),
                    "estimated_minutes": sessao.get("duracao_minutos")
                    if isinstance(sessao.get("duracao_minutos"), int)
                    else None,
                    "status": "pending",
                    "muscle_groups": grupos,
                })

                exercicios = [e for e in (sessao.get("exercicios") or []) if isinstance(e, dict)]
                if not exercicios:
                    # Achado #5: sessão sem exercício não pode virar treino vazio com 200
                    raise ValueError(
                        "Plano inválido: a sessão '{}' veio sem exercícios.".format(
                            sessao.get("nome") or "sem nome"
                        )
                    )
                for posicao, ex in enumerate(exercicios, start=1):
                    exercise_id = str(uuid.uuid4())
                    series = ex.get("series")
                    if not isinstance(series, int) or series < 1:
                        series = 1
                    series = min(series, MAX_SERIES_POR_EXERCICIO)
                    rm = ex.get("percentual_rm")
                    # Canonização pelo catálogo: nome de academia em PT-BR,
                    # grupo muscular e incremento de carga por exercício. Nome
                    # fora do catálogo passa intacto, com chave/grupo nulos.
                    canonico = resolver_exercicio(ex.get("nome"), ex.get("equipamento"))
                    # Cardio/isometria não se mede em carga × repetição: a
                    # prescrição vira duração (e distância), e %RM/reps ficam
                    # NULOS em vez de virar lixo ("20min" → 20 repetições).
                    eh_tempo = canonico.metrica in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA)
                    if eh_tempo:
                        reps_min = reps_max = None
                        duracao_alvo = (
                            _parse_duracao_segundos(ex.get("duracao_minutos"))
                            or _parse_duracao_segundos(ex.get("repeticoes"))
                            or _parse_duracao_segundos(ex.get("tempo"))
                        )
                        distancia_alvo = None
                        if canonico.metrica == METRICA_TEMPO_DISTANCIA:
                            distancia_km = ex.get("distancia_km")
                            distancia_alvo = (
                                float(distancia_km) * 1000
                                if isinstance(distancia_km, (int, float)) and distancia_km > 0
                                else _parse_distancia_metros(ex.get("repeticoes"))
                            )
                        # Sem duração legível o alvo fica indefinido; a série
                        # ainda precisa prescrever algo (CHECK da 0014).
                        if duracao_alvo is None and distancia_alvo is None:
                            duracao_alvo = DEFAULT_DURACAO_CARDIO_SEGUNDOS
                    else:
                        reps_min, reps_max = _parse_reps(ex.get("repeticoes"))
                        duracao_alvo = None
                        distancia_alvo = None
                    exercises.append({
                        "id": exercise_id,
                        "session_id": session_id,
                        "exercise_order": ex.get("ordem") if isinstance(ex.get("ordem"), int) else posicao,
                        "name": canonico.nome,
                        "exercise_key": canonico.chave,
                        "metric": canonico.metrica,
                        "name_original": canonico.nome_original if canonico.nome_original != canonico.nome else None,
                        "muscle_group": canonico.grupo_muscular,
                        "priority": _prioridade(ex),
                        "equipment": canonico.equipamento,
                        "load_increment_kg": canonico.incremento_kg,
                        "rest_seconds": _parse_descanso_segundos(ex.get("tempo_descanso")),
                        # %RM em cardio é ruído: a IA vinha gravando 2%, 3%, 4%…
                        # por semana (progressão de musculação aplicada a uma
                        # caminhada). Só exercício de carga tem %RM.
                        "target_rm_percent": (
                            rm if not eh_tempo and isinstance(rm, (int, float)) else None
                        ),
                        "sets_planned": series,
                        "reps_raw": str(ex.get("repeticoes")) if ex.get("repeticoes") is not None else None,
                        "method": ex.get("metodo"),
                        "cadence": ex.get("cadencia"),
                        "notes": _observacoes_com_qualificador(ex.get("observacoes"), canonico.qualificador),
                        "injury_flags": [],
                    })
                    for numero_serie in range(1, series + 1):
                        sets.append({
                            "id": str(uuid.uuid4()),
                            "exercise_id": exercise_id,
                            "set_order": numero_serie,
                            "target_reps_min": reps_min,
                            "target_reps_max": reps_max,
                            "target_load_kg": None,
                            "target_rir": None,
                            "target_duration_seconds": duracao_alvo,
                            "target_distance_m": distancia_alvo,
                        })
                    if len(sets) > MAX_TOTAL_SETS:
                        raise ValueError(
                            "Plano inválido: excede o teto de {} séries totais.".format(MAX_TOTAL_SETS)
                        )

    if not sessions:
        raise ValueError("Plano inválido: nenhuma sessão de treino encontrada.")

    # Achado #5: a duração registrada reflete a cobertura REAL do plano gerado,
    # não a declarada — IA que promete 12 semanas e entrega 2 não vira "12".
    semanas_mapeadas = max(s["week_number"] for s in sessions)
    plan_row["duration_weeks"] = semanas_mapeadas

    return {"plan": plan_row, "sessions": sessions, "exercises": exercises, "sets": sets}

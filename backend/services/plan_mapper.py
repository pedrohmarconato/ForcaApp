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
import math
import re
import uuid
from typing import Any, Dict, List, Optional

from backend.services.exercise_catalog import (
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
    normalizar,
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

# Vocabulário livre de lesão → grupos musculares do catálogo. O aluno fala
# "ombro"/"joelho"/"perna"; o catálogo grava "Ombros"/"Quadríceps". Sem esta
# ponte o guardrail de lesão fica ligado e nunca dispara. Chaves normalizadas
# (sem acento, minúsculas) e no singular — `_grupos_do_termo` despluraliza.
_SINONIMOS_GRUPO_MUSCULAR: Dict[str, tuple] = {
    "ombro": ("Ombros",),
    "deltoide": ("Ombros",),
    "manguito": ("Ombros",),
    "manguito rotador": ("Ombros",),
    "peito": ("Peito",),
    "peitoral": ("Peito",),
    "costa": ("Costas",),
    "dorsal": ("Costas",),
    "latissimo": ("Costas",),
    "lombar": ("Lombar",),
    "coluna lombar": ("Lombar",),
    "coluna cervical": ("Trapézio",),
    "trapezio": ("Trapézio",),
    "pescoco": ("Trapézio",),
    "cervical": ("Trapézio",),
    "biceps": ("Bíceps",),
    "triceps": ("Tríceps",),
    "cotovelo": ("Bíceps", "Tríceps"),
    "antebraco": ("Antebraço",),
    "punho": ("Antebraço",),
    "abdomen": ("Abdômen",),
    "abdominal": ("Abdômen",),
    "core": ("Abdômen", "Lombar"),
    "quadriceps": ("Quadríceps",),
    "coxa": ("Quadríceps", "Posterior de Coxa"),
    "joelho": ("Quadríceps", "Posterior de Coxa"),
    "posterior de coxa": ("Posterior de Coxa",),
    "cadeia posterior": ("Posterior de Coxa", "Glúteos", "Lombar"),
    "isquiotibiais": ("Posterior de Coxa",),
    "gluteo": ("Glúteos",),
    "quadril": ("Glúteos", "Adutores"),
    "adutor": ("Adutores",),
    "virilha": ("Adutores",),
    "panturrilha": ("Panturrilha",),
    "tornozelo": ("Panturrilha",),
    "canela": ("Panturrilha",),
    "perna": ("Quadríceps", "Posterior de Coxa", "Glúteos", "Panturrilha", "Adutores"),
    "cardio": ("Cardio",),
    "mobilidade": ("Mobilidade",),
}
# Os próprios rótulos do catálogo continuam casando por igualdade.
for _rotulo in (
    "Abdômen", "Adutores", "Antebraço", "Bíceps", "Cardio", "Costas", "Glúteos",
    "Lombar", "Mobilidade", "Ombros", "Panturrilha", "Peito", "Posterior de Coxa",
    "Quadríceps", "Trapézio", "Tríceps",
):
    _SINONIMOS_GRUPO_MUSCULAR.setdefault(normalizar(_rotulo), (_rotulo,))
del _rotulo

# Estimativa de duração quando a sessão não declara. PADRÃO A VALIDAR por
# profissional de educação física — mesma convenção de src/engine/config.ts.
SEGUNDOS_EXECUCAO_POR_SERIE = 40
DESCANSO_PADRAO_SEGUNDOS = 90

_DIA_SEMANA_OFFSET = {
    "segunda": 0, "segunda-feira": 0,
    "terca": 1, "terça": 1, "terca-feira": 1, "terça-feira": 1,
    "quarta": 2, "quarta-feira": 2,
    "quinta": 3, "quinta-feira": 3,
    "sexta": 4, "sexta-feira": 4,
    "sabado": 5, "sábado": 5,
    "domingo": 6,
}

_NOME_DIA_POR_OFFSET = (
    "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
)

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
    # Horas (com minutos opcionais colados): "1h30min", "1h30", "1 h 30 min",
    # "1.5h", "2 horas". O 2º número, quando existe, são os minutos.
    hm = re.search(r"(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\s*(\d+(?:[.,]\d+)?)?", texto)
    if hm:
        horas = float(hm.group(1).replace(",", "."))
        minutos = float(hm.group(2).replace(",", ".")) if hm.group(2) else 0.0
        segundos = int(round(horas * 3600 + minutos * 60))
        return segundos if segundos > 0 else None
    numeros = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", texto)]
    if not numeros:
        return None
    n = numeros[0]  # faixa "25-30min": prescreve o piso
    if re.search(r"\bs\b|seg|\ds\b", texto) and "min" not in texto:
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


def _dia_da_sessao(sessao: Dict[str, Any], order_in_week: int) -> tuple[int, str]:
    """(offset 0..6, rótulo textual).

    Aceita ``dia_semana`` (str/int) e ``dia_offset`` (int, contrato do molde).
    Sem nenhum dos dois, distribui pela ordem da sessão na semana.
    """
    dia_semana = sessao.get("dia_semana")
    if isinstance(dia_semana, str):
        texto_original = dia_semana.strip()
        chave = texto_original.lower()
        if chave in _DIA_SEMANA_OFFSET:
            return _DIA_SEMANA_OFFSET[chave], texto_original
    if isinstance(dia_semana, int) and not isinstance(dia_semana, bool) and 0 <= dia_semana <= 6:
        return dia_semana, _NOME_DIA_POR_OFFSET[dia_semana]
    dia_offset = sessao.get("dia_offset")
    if isinstance(dia_offset, int) and not isinstance(dia_offset, bool) and 0 <= dia_offset <= 6:
        return dia_offset, _NOME_DIA_POR_OFFSET[dia_offset]
    fallback = min(max(order_in_week - 1, 0), 6)
    return fallback, _NOME_DIA_POR_OFFSET[fallback]


def _estimar_minutos(
    exercicios_mapeados: List[Dict[str, Any]],
    sets_da_sessao: List[Dict[str, Any]],
) -> int:
    """Estima a duração da sessão a partir dos alvos já canonizados."""
    sets_por_exercicio: Dict[str, List[Dict[str, Any]]] = {}
    for serie in sets_da_sessao:
        sets_por_exercicio.setdefault(serie["exercise_id"], []).append(serie)

    total_segundos = 0
    for exercicio in exercicios_mapeados:
        series_exercicio = sets_por_exercicio.get(exercicio["id"], [])
        descanso = exercicio.get("rest_seconds") or DESCANSO_PADRAO_SEGUNDOS
        if exercicio.get("metric") in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA):
            total_segundos += sum(
                int(serie.get("target_duration_seconds") or 0)
                for serie in series_exercicio
            )
            total_segundos += max(len(series_exercicio) - 1, 0) * descanso
        else:
            total_segundos += len(series_exercicio) * (
                SEGUNDOS_EXECUCAO_POR_SERIE + descanso
            )

    return max(1, math.ceil(total_segundos / 60))


def _grupos_do_termo(termo: Any) -> set:
    """
    Grupos musculares do catálogo atingidos por um termo livre de lesão.

    `grupo_afetado` é texto livre da consolidação do chat ("ombro", "joelho",
    "perna"), enquanto o catálogo usa um vocabulário fechado de 16 rótulos no
    plural/canônico ("Ombros", "Quadríceps"). Comparar por igualdade exata faz
    o guardrail de lesão nunca disparar: "ombro" != "ombros". Aqui o termo é
    normalizado, despluralizado e passado por um mapa anatômico explícito.
    """
    if not termo:
        return set()
    bruto = normalizar(termo)
    if not bruto:
        return set()
    def grupos_de(chave: str) -> tuple:
        singular = chave[:-1] if chave.endswith("s") else chave
        return _SINONIMOS_GRUPO_MUSCULAR.get(chave) or _SINONIMOS_GRUPO_MUSCULAR.get(
            singular
        ) or ()

    # 1. A frase inteira vence. "deltoide posterior" precisa casar com Ombros,
    #    não somar "posterior" e marcar Posterior de Coxa junto.
    exatos = grupos_de(bruto)
    if exatos:
        return set(exatos)

    palavras = [token for token in bruto.split() if len(token) > 2]

    # 2. Depois os bigramas, também mais específicos que a palavra solta
    #    ("coluna cervical" é Trapézio, não Lombar + Trapézio).
    for i in range(len(palavras) - 1):
        grupos = grupos_de(" ".join(palavras[i : i + 2]))
        if grupos:
            return set(grupos)

    # 3. Só então as palavras isoladas ("dor no ombro direito" → Ombros).
    atingidos: set = set()
    for palavra in palavras:
        atingidos.update(grupos_de(palavra))
    return atingidos


def _injury_flags(
    canonico: Any,
    restricoes_lesao: Optional[List[Dict[str, Any]]],
) -> List[str]:
    """Casa lesões estruturadas por chave de exercício ou grupo muscular."""
    flags: List[str] = []
    for restricao in restricoes_lesao or []:
        if not isinstance(restricao, dict) or restricao.get("tipo") != "lesao":
            continue
        casou = False
        exercicio_afetado = restricao.get("exercicio_afetado")
        if exercicio_afetado and canonico.chave:
            afetado = resolver_exercicio(exercicio_afetado)
            casou = afetado.chave is not None and afetado.chave == canonico.chave
        grupo_afetado = restricao.get("grupo_afetado")
        if grupo_afetado and canonico.grupo_muscular:
            casou = casou or canonico.grupo_muscular in _grupos_do_termo(grupo_afetado)
        if casou:
            descricao = str(restricao.get("descricao") or "lesao").strip() or "lesao"
            if descricao not in flags:
                flags.append(descricao)
    return flags


def _uuid_ou_none(valor: Any) -> Optional[str]:
    try:
        return str(uuid.UUID(str(valor)))
    except (ValueError, TypeError, AttributeError):
        return None


def mapear_plano_ia(
    plano: Dict[str, Any],
    user_id: str,
    start_date: Optional[datetime.date] = None,
    restricoes_lesao: Optional[List[Dict[str, Any]]] = None,
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
                offset, rotulo_dia = _dia_da_sessao(sessao, ordem_na_semana)
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
                session_row = {
                    "id": session_id,
                    "plan_id": plan_id,
                    "user_id": user_id,
                    "week_number": semana,
                    "day_of_week": rotulo_dia,
                    "order_in_week": ordem_na_semana,
                    "title": str(sessao.get("nome") or "Treino"),
                    "session_type": sessao.get("tipo"),
                    "scheduled_date": data_agendada.isoformat(),
                    "estimated_minutes": sessao.get("duracao_minutos")
                    if isinstance(sessao.get("duracao_minutos"), int)
                    else None,
                    "status": "pending",
                    "muscle_groups": grupos,
                }
                sessions.append(session_row)

                exercicios = [e for e in (sessao.get("exercicios") or []) if isinstance(e, dict)]
                if not exercicios:
                    # Achado #5: sessão sem exercício não pode virar treino vazio com 200
                    raise ValueError(
                        "Plano inválido: a sessão '{}' veio sem exercícios.".format(
                            sessao.get("nome") or "sem nome"
                        )
                    )
                inicio_exercicios = len(exercises)
                inicio_sets = len(sets)
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
                        # A série tem de prescrever reps OU duração (CHECK
                        # planned_sets_alvo_coerente da 0014). Distância sozinha
                        # NÃO satisfaz o CHECK, então todo exercício por tempo
                        # sem duração legível cai no default — mesmo quando há
                        # distância (ex.: "Corrida 5km, ritmo livre"). Sem isso
                        # a RPC save_training_plan aborta e a geração inteira cai.
                        if duracao_alvo is None:
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
                        "injury_flags": _injury_flags(canonico, restricoes_lesao),
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
                if not isinstance(sessao.get("duracao_minutos"), int):
                    session_row["estimated_minutes"] = _estimar_minutos(
                        exercises[inicio_exercicios:],
                        sets[inicio_sets:],
                    )

    if not sessions:
        raise ValueError("Plano inválido: nenhuma sessão de treino encontrada.")

    # Achado #5: a duração registrada reflete a cobertura REAL do plano gerado,
    # não a declarada — IA que promete 12 semanas e entrega 2 não vira "12".
    semanas_mapeadas = max(s["week_number"] for s in sessions)
    plan_row["duration_weeks"] = semanas_mapeadas

    return {"plan": plan_row, "sessions": sessions, "exercises": exercises, "sets": sets}

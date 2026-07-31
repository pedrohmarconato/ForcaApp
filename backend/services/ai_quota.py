# backend/services/ai_quota.py
# Quota diária persistente e teto monetário das chamadas pagas à Anthropic.
# Fecha o RATE-01 do review defensivo de 31/07/2026.
#
# O rate limit de `backend/app.py` continua existindo e continua sendo útil:
# ele é a barreira de burst (N por janela curta), em memória e barato. O que
# ele não faz — e o que este módulo faz — é sobreviver a um restart, valer
# entre réplicas, e limitar o DINHEIRO gasto no dia.
#
# Modelo de uso, em duas etapas por chamada paga:
#
#   1. reservar(...)  ANTES de chamar o modelo, com o custo de pior caso.
#      Se o teto do dia já foi atingido, levanta QuotaExcedida e a chamada
#      paga não acontece.
#   2. ajustar(...)   DEPOIS, com o custo real lido de `response.usage`.
#      Devolve à quota a diferença entre o pior caso reservado e o gasto real.
#
# A ordem importa: reservar depois da chamada deixaria a janela entre a
# decisão e o débito sem proteção, que é exatamente onde uma rajada passa.
#
# Uma tentativa que falha por reprovação semântica (o loop do molde) NÃO é
# devolvida: o modelo gerou tokens e cobrou por eles. Só os retries de rede
# (429/5xx/529 dentro de `criar_mensagem_com_deadline`) ficam de fora, porque
# não retornam `usage` — a API não cobra uma resposta que não entregou.

import os
from typing import Any, Dict, Optional

import requests

REQUEST_TIMEOUT_SECONDS = 10

# Tetos diários por usuário. Valem para o TOTAL do dia somando todas as rotas.
# Padrões deliberadamente folgados para um app de treino de uso pessoal: o
# objetivo é cortar abuso e loop acidental, não atrapalhar o uso legítimo.
AI_DAILY_CALL_LIMIT = int(os.environ.get("AI_DAILY_CALL_LIMIT", "40"))
AI_DAILY_USD_LIMIT = float(os.environ.get("AI_DAILY_USD_LIMIT", "5.00"))

# Preço por 1 milhão de tokens (USD), tabela pública da Anthropic conferida em
# 31/07/2026. Só entra aqui modelo que o app realmente pode usar — ver os
# defaults de CLAUDE_MODEL_NAME / CHAT_MODEL_NAME / PLAN_MODEL_NAME no
# docker-compose.yml. Modelo desconhecido cai no fallback conservador abaixo.
PRECOS_POR_MILHAO_USD = {
    "claude-opus-5":     {"entrada": 5.00, "saida": 25.00},
    "claude-opus-4-8":   {"entrada": 5.00, "saida": 25.00},
    "claude-opus-4-7":   {"entrada": 5.00, "saida": 25.00},
    "claude-sonnet-5":   {"entrada": 3.00, "saida": 15.00},
    "claude-sonnet-4-6": {"entrada": 3.00, "saida": 15.00},
    "claude-haiku-4-5":  {"entrada": 1.00, "saida":  5.00},
}

# Modelo fora da tabela: assume o mais caro que o app usa, em vez de assumir
# barato. Um preço subestimado aqui vira teto que não segura nada.
PRECO_DESCONHECIDO = {"entrada": 5.00, "saida": 25.00}

# Estimativa de tokens de entrada quando o prompt não foi medido. Serve só
# para a reserva; o ajuste pós-chamada substitui pelo valor real de `usage`.
CARACTERES_POR_TOKEN = 4


class QuotaExcedida(RuntimeError):
    """O teto diário do usuário foi atingido — a chamada paga não deve ocorrer."""

    def __init__(self, motivo: str, chamadas_dia: int, custo_dia_usd: float):
        self.motivo = motivo
        self.chamadas_dia = chamadas_dia
        self.custo_dia_usd = custo_dia_usd
        super().__init__(
            "Teto diário de uso de IA atingido ({}): {} chamadas, US$ {:.2f}.".format(
                motivo, chamadas_dia, custo_dia_usd
            )
        )


class QuotaIndisponivel(RuntimeError):
    """Não foi possível consultar a quota (rede, config ou erro da RPC)."""


def _preco(modelo: Optional[str]) -> Dict[str, float]:
    return PRECOS_POR_MILHAO_USD.get(modelo or "", PRECO_DESCONHECIDO)


def custo_estimado_usd(modelo: str, caracteres_prompt: int, max_tokens_saida: int) -> float:
    """
    Custo de PIOR CASO da chamada: o prompt medido em caracteres/4 e a saída
    no seu teto (`max_tokens`). Superestima de propósito — a reserva precisa
    cobrir o gasto máximo, e o ajuste devolve a diferença logo em seguida.
    """
    preco = _preco(modelo)
    tokens_entrada = max(0, int(caracteres_prompt)) / CARACTERES_POR_TOKEN
    tokens_saida = max(0, int(max_tokens_saida))
    return (
        tokens_entrada * preco["entrada"] / 1_000_000
        + tokens_saida * preco["saida"] / 1_000_000
    )


def custo_real_usd(modelo: str, usage: Any) -> Optional[float]:
    """
    Custo efetivo a partir do `usage` da resposta. Devolve None quando a
    resposta não traz contagem utilizável — nesse caso a reserva de pior caso
    permanece, que é o lado seguro do erro.

    Tokens de cache entram como entrada: a leitura é mais barata que o preço
    cheio, então contá-la a preço cheio mantém a estimativa conservadora.
    """
    if usage is None:
        return None
    try:
        entrada = int(getattr(usage, "input_tokens", 0) or 0)
        entrada += int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
        entrada += int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        saida = int(getattr(usage, "output_tokens", 0) or 0)
    except (TypeError, ValueError):
        return None
    if entrada <= 0 and saida <= 0:
        return None
    preco = _preco(modelo)
    return (
        entrada * preco["entrada"] / 1_000_000
        + saida * preco["saida"] / 1_000_000
    )


def _config():
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or ""
    if not base_url or not anon_key:
        raise QuotaIndisponivel(
            "SUPABASE_URL/SUPABASE_ANON_KEY não configurados — quota de IA indisponível."
        )
    return base_url, anon_key


def _chamar_rpc(access_token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    base_url, anon_key = _config()
    if not access_token:
        raise QuotaIndisponivel("Sem token de acesso do usuário para contabilizar a quota.")
    try:
        resposta = requests.post(
            "{}/rest/v1/rpc/register_ai_usage".format(base_url),
            headers={
                "apikey": anon_key,
                "Authorization": "Bearer {}".format(access_token),
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise QuotaIndisponivel("Falha de rede ao consultar a quota de IA: {}".format(exc)) from exc

    if resposta.status_code >= 400:
        raise QuotaIndisponivel(
            "RPC de quota respondeu HTTP {}.".format(resposta.status_code)
        )

    try:
        corpo = resposta.json()
    except ValueError as exc:
        raise QuotaIndisponivel("RPC de quota devolveu corpo não-JSON.") from exc

    if not isinstance(corpo, dict):
        raise QuotaIndisponivel("RPC de quota devolveu formato inesperado.")
    return corpo


def reservar(access_token: str, rota: str, custo_estimado: float) -> Dict[str, Any]:
    """
    Registra uma tentativa paga e devolve os totais do dia.

    Levanta QuotaExcedida se o teto foi atingido (a tentativa NÃO é contada) e
    QuotaIndisponivel se a contabilidade não pôde ser feita.

    Falha FECHADA de propósito: sem contabilidade não há teto, e a rota que
    chama isto já depende do Supabase para persistir o resultado — um banco
    fora do ar não deixaria o fluxo terminar de qualquer forma.
    """
    corpo = _chamar_rpc(
        access_token,
        {
            "p_rota": rota,
            "p_chamadas": 1,
            "p_custo_usd": round(float(custo_estimado), 6),
            "p_limite_chamadas": AI_DAILY_CALL_LIMIT,
            "p_limite_usd": AI_DAILY_USD_LIMIT,
            "p_forcar": False,
        },
    )
    if not corpo.get("permitido"):
        raise QuotaExcedida(
            motivo=str(corpo.get("motivo") or "desconhecido"),
            chamadas_dia=int(corpo.get("chamadas_dia") or 0),
            custo_dia_usd=float(corpo.get("custo_dia_usd") or 0.0),
        )
    return corpo


def ajustar(access_token: str, rota: str, delta_usd: float) -> None:
    """
    Acerta o custo reservado para o valor real, depois da resposta.

    Nunca levanta: o gasto já aconteceu e já está contabilizado pela reserva
    de pior caso. Derrubar a resposta do usuário porque o acerto falhou
    trocaria um erro de centavos por um erro de produto — e o lado do qual
    erramos (custo superestimado) é o seguro.
    """
    if not delta_usd:
        return
    try:
        _chamar_rpc(
            access_token,
            {
                "p_rota": rota,
                "p_chamadas": 0,
                "p_custo_usd": round(float(delta_usd), 6),
                "p_limite_chamadas": None,
                "p_limite_usd": None,
                "p_forcar": True,
            },
        )
    except QuotaIndisponivel:
        # Silêncio deliberado: quem chama loga o contexto se quiser. A reserva
        # já protege o teto; o acerto é refinamento.
        pass


def acertar_custo_real(
    access_token: str, rota: str, modelo: str, reservado_usd: float, usage: Any
) -> None:
    """Conveniência: calcula o delta entre reservado e real e o aplica."""
    real = custo_real_usd(modelo, usage)
    if real is None:
        return
    ajustar(access_token, rota, real - reservado_usd)

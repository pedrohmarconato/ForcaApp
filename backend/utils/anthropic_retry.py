# backend/utils/anthropic_retry.py
"""Retry seletivo com deadline absoluto para chamadas à API Anthropic.

Os clientes são criados com max_retries=0 porque o retry automático do SDK
re-tenta TIMEOUTS (150s x 3 = 450s de thread presa, além do corte do nginx e
do app — achado do review do PR #19). Mas isso também descartava retries
baratos e úteis: um 529 overloaded que se resolve em 1-2s.

Este helper devolve o meio-termo (achado #1 do review externo):
- re-tenta NO MÁXIMO 1 vez, apenas status transitórios (429/500/502/503/529);
- honra retry-after apenas quando curto (cabe no orçamento do usuário);
- impõe deadline ABSOLUTO: a 2ª tentativa herda só o tempo restante;
- NUNCA re-tenta timeout ou erro de conexão — lentidão não é transitória
  dentro do orçamento de uma requisição síncrona.
"""
import time

import anthropic

# Status que a Anthropic documenta como transitórios/re-tentáveis.
STATUS_RETRYAVEIS = {429, 500, 502, 503, 529}

# retry-after acima disso não cabe no orçamento de uma requisição síncrona.
ATRASO_MAXIMO_SEGUNDOS = 5.0

# Só re-tenta se sobrar orçamento para uma tentativa que possa concluir.
ORCAMENTO_MINIMO_SEGUNDOS = 20.0


def _atraso_sugerido(excecao: anthropic.APIStatusError) -> float:
    """Extrai retry-after (segundos) da resposta; default 1s se ausente."""
    try:
        bruto = excecao.response.headers.get("retry-after")
        return float(bruto) if bruto is not None else 1.0
    except (AttributeError, TypeError, ValueError):
        return 1.0


def criar_mensagem_com_deadline(cliente, orcamento_segundos: float, **kwargs):
    """Chama cliente.messages.create com deadline absoluto e retry seletivo.

    O timeout de cada tentativa é o tempo RESTANTE do orçamento, passado como
    request option — a soma das tentativas nunca ultrapassa o orçamento.
    Exceções são propagadas como vieram (o chamador mantém seu tratamento).
    """
    deadline = time.monotonic() + orcamento_segundos
    tentativa = 1
    while True:
        restante = deadline - time.monotonic()
        try:
            return cliente.messages.create(timeout=restante, **kwargs)
        except anthropic.APIStatusError as e:
            if tentativa >= 2 or e.status_code not in STATUS_RETRYAVEIS:
                raise
            atraso = _atraso_sugerido(e)
            if atraso > ATRASO_MAXIMO_SEGUNDOS:
                raise
            if (deadline - time.monotonic()) - atraso < ORCAMENTO_MINIMO_SEGUNDOS:
                raise
            time.sleep(atraso)
            tentativa += 1

# backend/tests/test_anthropic_retry.py
# Achados #1 e #3 do review externo do PR #19: max_retries=0 seco descartava
# retries baratos (529 que resolve em 1s), e o retry do SDK não tinha deadline
# absoluto (re-tentava timeouts). O helper cobre o meio-termo.

import os
import sys
import unittest.mock as mock
from typing import Optional

import anthropic
import httpx
import pytest

os.environ.setdefault("SUPABASE_URL", "https://teste.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-teste")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.utils.anthropic_retry import criar_mensagem_com_deadline  # noqa: E402


def _erro_status(status: int, retry_after: Optional[str] = None) -> anthropic.APIStatusError:
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status, headers=headers, request=request)
    return anthropic.APIStatusError("erro", response=response, body=None)


def _erro_timeout() -> anthropic.APITimeoutError:
    return anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )


def test_529_rapido_re_tenta_uma_vez_e_conclui():
    cliente = mock.Mock()
    cliente.messages.create.side_effect = [_erro_status(529, "1"), "resposta"]
    with mock.patch("backend.utils.anthropic_retry.time.sleep") as dorme:
        out = criar_mensagem_com_deadline(cliente, 150.0, model="m")
    assert out == "resposta"
    assert cliente.messages.create.call_count == 2
    dorme.assert_called_once()


def test_timeout_NUNCA_re_tenta():
    """Timeout = lentidão, não transitoriedade: re-tentar dobraria o tempo de
    thread presa e a cobrança — exatamente o bug original do PR."""
    cliente = mock.Mock()
    cliente.messages.create.side_effect = _erro_timeout()
    with pytest.raises(anthropic.APITimeoutError):
        criar_mensagem_com_deadline(cliente, 150.0, model="m")
    assert cliente.messages.create.call_count == 1


def test_429_com_retry_after_longo_nao_re_tenta():
    cliente = mock.Mock()
    cliente.messages.create.side_effect = _erro_status(429, "60")
    with pytest.raises(anthropic.APIStatusError):
        criar_mensagem_com_deadline(cliente, 150.0, model="m")
    assert cliente.messages.create.call_count == 1


def test_orcamento_insuficiente_nao_re_tenta():
    """Com orçamento curto, a 2ª tentativa não teria tempo de concluir —
    melhor falhar já e devolver o erro ao app."""
    cliente = mock.Mock()
    cliente.messages.create.side_effect = _erro_status(529, "1")
    with pytest.raises(anthropic.APIStatusError):
        criar_mensagem_com_deadline(cliente, 10.0, model="m")
    assert cliente.messages.create.call_count == 1


def test_erro_nao_transitorio_nao_re_tenta():
    cliente = mock.Mock()
    cliente.messages.create.side_effect = _erro_status(400)
    with pytest.raises(anthropic.APIStatusError):
        criar_mensagem_com_deadline(cliente, 150.0, model="m")
    assert cliente.messages.create.call_count == 1


def test_apenas_uma_re_tentativa():
    cliente = mock.Mock()
    cliente.messages.create.side_effect = [_erro_status(529, "1"), _erro_status(529, "1")]
    with mock.patch("backend.utils.anthropic_retry.time.sleep"):
        with pytest.raises(anthropic.APIStatusError):
            criar_mensagem_com_deadline(cliente, 150.0, model="m")
    assert cliente.messages.create.call_count == 2


def test_timeout_da_segunda_tentativa_e_o_restante_do_orcamento():
    """Deadline ABSOLUTO (achado #3): a 2ª tentativa herda só o que sobrou,
    a soma das tentativas nunca ultrapassa o orçamento."""
    cliente = mock.Mock()
    cliente.messages.create.side_effect = [_erro_status(529, "1"), "resposta"]
    with mock.patch("backend.utils.anthropic_retry.time.sleep"):
        criar_mensagem_com_deadline(cliente, 150.0, model="m")
    primeira = cliente.messages.create.call_args_list[0].kwargs["timeout"]
    segunda = cliente.messages.create.call_args_list[1].kwargs["timeout"]
    assert primeira <= 150.0
    assert segunda <= primeira

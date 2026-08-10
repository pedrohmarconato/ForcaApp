# backend/tests/test_molde_garantias_perdidas.py
# Garantias que a derivação do schema da API tirou da ORIGEM e que precisam
# continuar valendo em outro lugar. Escritos antes das correções — cada um
# reproduz um modo de falha observado na revisão do PR #49.
#
# Modos de falha que estes testes reproduzem:
#   - `dia_offset` virou obrigatório no schema da API sem `minimum`/`maximum`
#     (a API não aceita restrição numérica) e sem NENHUMA regra de unicidade.
#     O modelo, agora obrigado a preencher o campo e sem pista de faixa,
#     devolve o mesmo offset em todas as sessões da semana; a validação local
#     passa, o expansor passa, o mapper passa, e o aluno recebe a semana
#     inteira empilhada num único dia. Não há constraint em planned_sessions
#     que barre isso — é dado errado publicado em silêncio, não retry;
#   - `grupos_musculares` virou obrigatório para caber no teto de 24 opcionais,
#     e o commit registra isso como conserto do muscle_group nulo da migration
#     0013. `required` garante a CHAVE, não o conteúdo: uma lista vazia é
#     completação legal e barata na gramática, e chega ao mapper como o mesmo
#     grupo vazio de antes. `minItems` é justamente o que a API não aceita, e
#     por isso a restrição tem de viver no schema LOCAL;
#   - `effort` injetado sem olhar o modelo: `_EFFORTS_VALIDOS` valida o valor e
#     nunca o destino. O HML roda o molde em Haiku por custo, e Haiku rejeita
#     `effort` com 400 na request inteira — o mesmo modo de falha que
#     `_thinking_config_para_modelo` já existe para evitar;
#   - mensagem do `anyOf` no retry dirigido: com o refinamento removido do
#     schema da API, o modelo pode devolver exercício sem alvo de prescrição.
#     O jsonschema descreve isso como "is not valid under any of the given
#     schemas", que não diz o que falta — e com structured output ligado o
#     schema não está mais no prompt para o modelo consultar. As duas
#     tentativas pagas queimam sem informação suficiente.

import datetime
import json
import os
import sys
import types
from unittest import mock

import jsonschema
import pytest

os.environ.setdefault("SUPABASE_URL", "https://teste.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-teste")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app  # noqa: E402
from backend.schemas.molde_schema import MOLDE_SCHEMA, MOLDE_SCHEMA_API  # noqa: E402
from backend.services.molde_normalizer import normalizar_molde  # noqa: E402
from backend.services.plan_mapper import mapear_plano_ia  # noqa: E402

USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
START = datetime.date(2026, 7, 20)  # segunda-feira


def _exercicio(nome, ordem=1):
    return {
        "nome": nome,
        "ordem": ordem,
        "series": 3,
        "repeticoes": "8-12",
        "tempo_descanso": "60s",
        "prioridade": "primario",
    }


def _plano_com_offsets(offsets):
    """Plano de 1 semana com uma sessão por offset informado."""
    return {
        "plano_principal": {
            "nome": "Teste",
            "periodizacao": {"tipo": "Linear"},
            "ciclos": [
                {
                    "nome": "Fase 1",
                    "ordem": 1,
                    "microciclos": [
                        {
                            "semana": 1,
                            "sessoes": [
                                {
                                    "nome": f"Treino {i}",
                                    "tipo": "Hipertrofia",
                                    "dia_offset": offset,
                                    "grupos_musculares": [{"nome": "Peito"}],
                                    "exercicios": [_exercicio(f"Supino {i}")],
                                }
                                for i, offset in enumerate(offsets, start=1)
                            ],
                        }
                    ],
                }
            ],
        }
    }


def _molde_minimo(sessao_extra=None):
    sessao = {
        "nome": "A",
        "tipo": "Hipertrofia",
        "exercicios": [_exercicio("Supino Reto com Barra")],
    }
    sessao.update(sessao_extra or {})
    return {
        "semanas_tipo": [{"id": "tipo_a", "sessoes": [sessao]}],
        "calendario": ["tipo_a"] * 12,
        "progressao": {"regras": []},
    }


# ------------------------------------------------------------------
# 1. dia_offset repetido não pode empilhar a semana num dia só
# ------------------------------------------------------------------


def test_dia_offset_repetido_nao_empilha_sessoes_na_mesma_data():
    """4 sessões com dia_offset 0 = a semana inteira na segunda-feira.

    Nada a jusante barra isso: o schema local não tem unicidade, o expansor
    não olha, e planned_sessions não tem constraint. O mapper é o último
    ponto onde dá para desempatar de forma determinística.
    """
    mapeado = mapear_plano_ia(_plano_com_offsets([0, 0, 0, 0]), USER_ID, start_date=START)
    datas = [s["scheduled_date"] for s in mapeado["sessions"]]
    assert len(set(datas)) == 4, f"sessões empilhadas na mesma data: {datas}"


def test_dia_offset_repetido_preserva_a_intencao_da_primeira_sessao():
    """O desempate não pode reescrever o dia que o modelo pediu de verdade.

    A primeira sessão fica no offset pedido; as seguintes é que andam.
    """
    mapeado = mapear_plano_ia(_plano_com_offsets([2, 2]), USER_ID, start_date=START)
    datas = sorted(s["scheduled_date"] for s in mapeado["sessions"])
    assert datas[0] == (START + datetime.timedelta(days=2)).isoformat()
    assert datas[0] != datas[1]


def test_dia_offset_distinto_continua_intacto():
    """Sem colisão, o mapper não pode mexer em nada."""
    mapeado = mapear_plano_ia(_plano_com_offsets([0, 3, 5]), USER_ID, start_date=START)
    datas = sorted(s["scheduled_date"] for s in mapeado["sessions"])
    esperado = sorted(
        (START + datetime.timedelta(days=d)).isoformat() for d in (0, 3, 5)
    )
    assert datas == esperado


def test_dia_offset_volta_a_ser_opcional_no_schema_da_api():
    """Obrigar o modelo a inventar o dia foi o que criou a colisão.

    Opcional, vale o fallback determinístico do mapper, que distribui por
    construção. Cabe no teto de 24 — a folga medida é de 9.
    """
    sessao = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert "dia_offset" not in sessao["required"]
    assert "dia_offset" in sessao["properties"]


def test_alvos_de_prescricao_vem_antes_dos_demais_campos_do_exercicio():
    """A gramática do structured output percorre as properties na ordem
    declarada e o modelo não volta atrás. Com `duracao_minutos` depois de
    `series`, TODA geração medida saiu com o exercício de cardio sem alvo de
    prescrição — e o retry repetia o erro mesmo sabendo qual campo faltava,
    o que perdia a geração inteira. Declarados primeiro, nenhuma saiu sem alvo.
    """
    exercicio = (
        MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
        ["properties"]["exercicios"]["items"]
    )
    ordem = list(exercicio["properties"])
    assert ordem[0] == "nome"
    for alvo in ("repeticoes", "duracao_minutos", "distancia_km"):
        assert ordem.index(alvo) < ordem.index("series"), (
            f"{alvo} precisa ser declarado antes de `series`: ordem atual {ordem}"
        )


def test_reordenacao_nao_perdeu_nem_inventou_propriedade():
    """Reordenar não pode virar oportunidade de sumir com um campo."""
    local = (
        MOLDE_SCHEMA["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
        ["properties"]["exercicios"]["items"]["properties"]
    )
    api = (
        MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
        ["properties"]["exercicios"]["items"]["properties"]
    )
    assert set(api) == set(local)


# ------------------------------------------------------------------
# 2. grupos_musculares: required não basta, precisa de conteúdo
# ------------------------------------------------------------------


def test_grupos_musculares_vazio_reprova_na_validacao_local():
    """`[]` satisfaz `required` e chega ao banco como grupo nulo.

    Quem tem de barrar é o schema local, porque `minItems` não é expressável
    em structured outputs.
    """
    molde = _molde_minimo({"grupos_musculares": []})
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_grupos_musculares_preenchido_continua_valido():
    molde = _molde_minimo({"grupos_musculares": [{"nome": "Peito"}]})
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_normalizador_remove_lista_vazia_antes_de_a_validacao_ver():
    """O schema da API EXIGE `grupos_musculares` mas não consegue exigir
    conteúdo, então o modelo cumpre o obrigatório com `[]` — observado em
    geração real, numa sessão de cardio puro. Sem este reparo, o minItems
    reprova o molde inteiro e a geração paga é perdida por um campo que não
    carrega informação. Lista vazia é idêntica a ausência para o mapper.
    """
    molde = normalizar_molde(_molde_minimo({"grupos_musculares": []}))
    assert "grupos_musculares" not in molde["semanas_tipo"][0]["sessoes"][0]
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_normalizador_nao_toca_em_grupos_preenchidos():
    molde = normalizar_molde(_molde_minimo({"grupos_musculares": [{"nome": "Peito"}]}))
    assert molde["semanas_tipo"][0]["sessoes"][0]["grupos_musculares"] == [{"nome": "Peito"}]


def test_normalizador_limpa_lista_vazia_tambem_nas_semanas_avulsas():
    molde = _molde_minimo()
    molde["semanas_avulsas"] = {
        "semana_4": {
            "semana": 4,
            "sessoes": [
                {
                    "nome": "Deload",
                    "tipo": "Recuperação",
                    "grupos_musculares": [],
                    "exercicios": [_exercicio("Supino Reto com Barra")],
                }
            ],
        }
    }
    normalizado = normalizar_molde(molde)
    assert "grupos_musculares" not in normalizado["semanas_avulsas"]["semana_4"]["sessoes"][0]
    jsonschema.validate(instance=normalizado, schema=MOLDE_SCHEMA)


# ------------------------------------------------------------------
# 3. effort só vai para modelo que aceita effort
# ------------------------------------------------------------------


@pytest.mark.parametrize("modelo", ["claude-haiku-4-5", "claude-sonnet-4-5"])
def test_effort_nao_vai_para_modelo_que_rejeita_effort(monkeypatch, modelo):
    """Haiku/Sonnet devolvem 400 na request inteira, e o aluno vê
    "Falha na comunicação com o serviço de IA" — a geração some por um
    parâmetro que nem era essencial."""
    monkeypatch.setenv("PLAN_EFFORT", "medium")
    config = app._output_config_da_geracao(None, modelo)
    assert "effort" not in config


@pytest.mark.parametrize("modelo", ["claude-opus-5", "claude-fable-5"])
def test_effort_continua_valendo_no_modelo_que_suporta(monkeypatch, modelo):
    monkeypatch.setenv("PLAN_EFFORT", "medium")
    config = app._output_config_da_geracao(None, modelo)
    assert config["effort"] == "medium"


def test_effort_nao_apaga_o_formato_do_structured_output(monkeypatch):
    """Os dois moram no MESMO parâmetro: o formato não pode se perder."""
    monkeypatch.setenv("PLAN_EFFORT", "high")
    formato = {"format": {"type": "json_schema", "schema": {"type": "object"}}}
    config = app._output_config_da_geracao(formato, "claude-opus-5")
    assert config["format"] == formato["format"]
    assert config["effort"] == "high"


# ------------------------------------------------------------------
# 4. mensagem do retry precisa dizer o que corrigir
# ------------------------------------------------------------------


def test_falha_de_anyof_vira_mensagem_acionavel():
    """"is not valid under any of the given schemas" não diz o que falta.

    Com structured output ligado o schema saiu do prompt, então o modelo não
    tem onde consultar: a mensagem do retry é a ÚNICA informação que ele
    recebe, e é a única tentativa que sobra.
    """
    molde = _molde_minimo()
    del molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["repeticoes"]
    try:
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
        pytest.fail("molde sem alvo de prescrição deveria reprovar")
    except jsonschema.exceptions.ValidationError as e:
        detalhe = app._detalhe_da_falha_de_schema(e)

    assert "repeticoes" in detalhe
    assert "duracao_minutos" in detalhe
    assert "distancia_km" in detalhe
    assert "is not valid under any of the given schemas" not in detalhe


def _molde_valido_json():
    return json.dumps({
        "nome": "Plano", "descricao": "", "periodizacao": {"tipo": "Linear"},
        "duracao_semanas": 12, "frequencia_semanal": 2,
        "semanas_tipo": [{
            "id": "tipo_a", "nome": "A",
            "sessoes": [{
                "nome": "Treino A", "tipo": "Hipertrofia", "duracao_minutos": 60,
                "grupos_musculares": [{"nome": "Peito"}],
                "exercicios": [_exercicio("Supino Reto com Barra")],
            }],
        }],
        "calendario": ["tipo_a"] * 12,
        "progressao": {"regras": []},
    })


def _molde_sem_alvo_json():
    molde = json.loads(_molde_valido_json())
    del molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["repeticoes"]
    return json.dumps(molde)


def test_retry_desliga_a_gramatica_e_devolve_o_schema_ao_texto(monkeypatch):
    """A garantia "todo exercício precisa de um alvo de prescrição" não é
    expressável em structured outputs: a API rejeita `anyOf` com irmãos
    estruturais, e duplicar o objeto por alvo estoura a gramática (medido:
    400 "compiled grammar is too large") ou o teto de opcionais (400, 29).

    Sem rede, o modelo reincidia no MESMO erro na 2ª tentativa mesmo lendo a
    mensagem que nomeava o campo faltante — 4 de 9 gerações reais perderam o
    plano. Com o schema de volta no texto, esse erro não aparece.
    """
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    monkeypatch.setenv("FORCA_USE_MOLDE_ARCHITECTURE", "true")
    monkeypatch.setattr(app, "FORCA_STRUCTURED_OUTPUT", True)
    monkeypatch.setattr(app, "FORCA_PROMPT_MOLDE_V2", True)

    import backend.services.job_manager as jm

    respostas = [
        types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=_molde_sem_alvo_json())], stop_reason="end_turn"),
        types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=_molde_valido_json())], stop_reason="end_turn"),
    ]
    chamadas = []

    def falso(cliente, orcamento, **kwargs):
        chamadas.append(kwargs)
        return respostas[len(chamadas) - 1]

    job, _ = jm.criar_job(user_id="user-retry")
    with mock.patch("backend.utils.anthropic_retry.criar_mensagem_com_deadline", side_effect=falso), \
         mock.patch("backend.app.persistir_plano", return_value="db-plan-retry"):
        with app.app.app_context():
            app._executar_geracao_molde(
                job,
                questionnaire_data={"nivelExperiencia": "iniciante"},
                diretrizes={"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
                user_id="user-retry",
                access_token="fake-token",
            )

    assert len(chamadas) == 2, "deveria ter havido exatamente um retry"
    # 1ª tentativa: gramática ligada, schema fora do texto (é o ganho da flag)
    assert "format" in chamadas[0]["output_config"]
    assert "SCHEMA COMPLETO DO MOLDE" not in chamadas[0]["messages"][-1]["content"]
    # 2ª tentativa: gramática desligada e schema de volta ao texto
    assert "format" not in (chamadas[1].get("output_config") or {})
    assert "SCHEMA COMPLETO DO MOLDE" in chamadas[1]["messages"][-1]["content"]
    # o prefixo estável não pode mudar entre as tentativas, senão o cache não casa
    assert chamadas[0]["system"] == chamadas[1]["system"]
    assert job.status == jm.JobStatus.SALVO


def test_falha_comum_preserva_a_mensagem_do_jsonschema_e_ganha_o_caminho():
    """O diagnóstico do jsonschema não é reescrito — só endereçado.

    "12 is greater than the maximum of 10" já diz o que está errado, mas não
    diz em qual exercício.
    """
    molde = _molde_minimo()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["series"] = 12
    try:
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
        pytest.fail("series=12 deveria reprovar")
    except jsonschema.exceptions.ValidationError as e:
        # `e` some do escopo ao sair do except em Python 3 — guardar aqui.
        original = e.message
        detalhe = app._detalhe_da_falha_de_schema(e)

    assert original in detalhe
    assert "maximum of 10" in detalhe
    assert "semanas_tipo.0.sessoes.0.exercicios.0.series" in detalhe


def test_lista_vazia_diz_QUAL_lista_esta_vazia():
    """"[] should be non-empty" sozinho pode ser exercicios, sessoes,
    calendario ou grupos_musculares. Observado em geração real: o retry
    recebia a mensagem e não tinha como saber o que corrigir."""
    molde = _molde_minimo()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"] = []
    try:
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
        pytest.fail("exercicios vazio deveria reprovar")
    except jsonschema.exceptions.ValidationError as e:
        detalhe = app._detalhe_da_falha_de_schema(e)

    assert "exercicios" in detalhe
    assert "non-empty" in detalhe

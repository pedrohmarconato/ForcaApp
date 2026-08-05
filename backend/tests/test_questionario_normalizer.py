# backend/tests/test_questionario_normalizer.py
# Testes do normalizador: converte ambos os formatos (app novo e legado)
# para um dicionário canônico.

import datetime
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.services.questionario_normalizer import normalizar_questionario  # noqa: E402


class TestNormalizadorPayloadApp:
    """Testa o formato novo vindo do app (QuestionnaireScreen.tsx)."""

    def test_payload_app_exato_com_dias_completos(self):
        """Reproduz o payload exato que o app envia com todos os dias marcados."""
        payload = {
            "usuario_id": "user-123",
            "data_nascimento": "1990-05-15",
            "genero": "masculino",
            "peso_kg": 80.5,
            "altura_cm": 180,
            "experiencia_treino": "intermediario",
            "objetivo": "hipertrofia",
            "tem_lesoes": False,
            "lesoes_detalhes": None,
            "dias_treino": ["mon", "tue", "wed", "thu", "fri"],
            "inclui_cardio": True,
            "inclui_alongamento": True,
            "tempo_medio_treino_min": 60,
            "nome": "João Silva",
        }
        result = normalizar_questionario(payload)

        # Dias devem ser convertidos para português sem acento, em ordem canônica
        assert result["dias_disponiveis"] == ["segunda", "terca", "quarta", "quinta", "sexta"]
        assert result["disponibilidade_semanal"] == 5
        assert result["peso"] == 80.5
        assert result["altura"] == 180
        assert result["nivel"] == "intermediario"
        assert result["tempo_treino"] == 60
        assert result["cardio"] == "sim"
        assert result["alongamento"] == "sim"
        assert result["nome"] == "João Silva"

    def test_payload_app_com_idade_calculada_de_data_nascimento(self):
        """Quando `data_nascimento` é fornecido, calcula `idade`."""
        hoje = datetime.date.today()
        data_nascimento = hoje.replace(year=hoje.year - 25)

        payload = {
            "data_nascimento": data_nascimento.isoformat(),
            "dias_treino": ["mon", "wed", "fri"],
            "tempo_medio_treino_min": 45,
        }
        result = normalizar_questionario(payload)

        assert result["idade"] == 25
        assert result["dias_disponiveis"] == ["segunda", "quarta", "sexta"]
        assert result["disponibilidade_semanal"] == 3

    def test_payload_app_dias_fora_de_ordem_normalizados(self):
        """Dias fora de ordem são normalizados para ordem canônica."""
        payload = {
            "dias_treino": ["fri", "mon", "wed"],
        }
        result = normalizar_questionario(payload)

        assert result["dias_disponiveis"] == ["segunda", "quarta", "sexta"]

    def test_payload_app_dias_com_duplicatas_removidas(self):
        """Duplicatas de dias são removidas."""
        payload = {
            "dias_treino": ["mon", "wed", "mon", "fri"],
        }
        result = normalizar_questionario(payload)

        assert result["dias_disponiveis"] == ["segunda", "quarta", "sexta"]

    def test_payload_app_cardio_e_alongamento_booleano_convertidos(self):
        """Booleanos para cardio/alongamento são convertidos para 'sim'/'não'."""
        payload = {
            "inclui_cardio": True,
            "inclui_alongamento": False,
        }
        result = normalizar_questionario(payload)

        assert result["cardio"] == "sim"
        assert result["alongamento"] == "não"

    def test_payload_app_objetivo_string_convertido_para_lista(self):
        """Campo `objetivo` (string) é convertido para lista de objetivos."""
        payload = {
            "objetivo": "hipertrofia",
        }
        result = normalizar_questionario(payload)

        assert result["objetivos"] == ["hipertrofia"]

    def test_payload_legado_diasPreferenciais(self):
        """Formato legado com `diasPreferenciais` é suportado."""
        payload = {
            "diasPreferenciais": ["mon", "tue", "wed", "thu", "fri"],
            "frequenciaSemanal": 5,
            "nivelExperiencia": "avancado",
            "tempoDisponivelSessao": 90,
            "incluirCardio": "sim",
            "incluirAlongamento": "nao",
        }
        result = normalizar_questionario(payload)

        assert result["dias_disponiveis"] == ["segunda", "terca", "quarta", "quinta", "sexta"]
        assert result["disponibilidade_semanal"] == 5
        assert result["nivel"] == "avancado"
        assert result["tempo_treino"] == 90
        assert result["cardio"] == "sim"
        assert result["alongamento"] == "não"  # normalizado para formato canônico com acento

    def test_payload_app_vence_payload_legado(self):
        """Quando chaves app e legado coexistem, app vence."""
        payload = {
            "dias_treino": ["mon", "wed"],  # app
            "diasPreferenciais": ["fri", "sat"],  # legado
            "tempo_medio_treino_min": 60,  # app
            "tempoDisponivelSessao": 45,  # legado
        }
        result = normalizar_questionario(payload)

        assert result["dias_disponiveis"] == ["segunda", "quarta"]
        assert result["tempo_treino"] == 60

    def test_payload_vazio_nao_levanta_excecao(self):
        """Payload vazio retorna dict com defaults."""
        result = normalizar_questionario({})

        assert result["dias_disponiveis"] is None or result["dias_disponiveis"] == []
        assert result["disponibilidade_semanal"] == 3  # default
        assert result["nivel"] == "iniciante"  # default
        assert result["tempo_treino"] == 60  # default
        assert result["cardio"] == "não"  # default
        assert result["alongamento"] == "não"  # default

    def test_payload_none_nao_levanta_excecao(self):
        """Payload None retorna dict com defaults."""
        result = normalizar_questionario(None)

        assert result is not None
        assert result["disponibilidade_semanal"] == 3

    def test_dias_em_portugues_com_acento_aceitos(self):
        """Dias em português (com ou sem acento) são aceitos."""
        payload = {
            "dias_treino": ["segunda", "terça", "quarta-feira"],
        }
        result = normalizar_questionario(payload)

        # Todos devem ser normalizados para formato canônico sem acento
        assert "segunda" in result["dias_disponiveis"]
        assert "terca" in result["dias_disponiveis"]
        assert "quarta" in result["dias_disponiveis"]

    def test_dias_desconhecidos_ignorados(self):
        """Dias desconhecidos são ignorados, não levantam erro."""
        payload = {
            "dias_treino": ["mon", "invalid_day", "wed"],
        }
        result = normalizar_questionario(payload)

        assert result["dias_disponiveis"] == ["segunda", "quarta"]

    def test_objectivos_lista_preservada(self):
        """Quando `objetivos` já é lista, é preservada."""
        payload = {
            "objetivos": ["hipertrofia", "forca"],
        }
        result = normalizar_questionario(payload)

        assert result["objetivos"] == ["hipertrofia", "forca"]

    def test_restricoes_preservadas(self):
        """Campo `restricoes` é copiado como-é."""
        payload = {
            "restricoes": ["nao_fazer_abdominais", "evitar_pernas"],
        }
        result = normalizar_questionario(payload)

        assert result["restricoes"] == ["nao_fazer_abdominais", "evitar_pernas"]

    def test_lesoes_preservadas(self):
        """Campo `lesoes` é copiado como-é."""
        payload = {
            "lesoes": ["ombro", "joelho"],
        }
        result = normalizar_questionario(payload)

        assert result["lesoes"] == ["ombro", "joelho"]

    def test_disponibilidade_semanal_calculada_de_dias(self):
        """Quando `frequenciaSemanal` ausente, calcula de `len(dias_disponiveis)`."""
        payload = {
            "dias_treino": ["mon", "wed", "fri", "sat"],
        }
        result = normalizar_questionario(payload)

        assert result["disponibilidade_semanal"] == 4

    def test_disponibilidade_semanal_explicita_vence_calculada(self):
        """Quando `frequenciaSemanal` explícito, vence o cálculo."""
        payload = {
            "dias_treino": ["mon", "wed", "fri"],
            "frequenciaSemanal": 5,
        }
        result = normalizar_questionario(payload)

        assert result["disponibilidade_semanal"] == 5

    def test_dias_limites_1_e_7(self):
        """Disponibilidade semanal respeita limites 1-7."""
        payload_1 = {"dias_treino": ["mon"]}
        result_1 = normalizar_questionario(payload_1)
        assert result_1["disponibilidade_semanal"] == 1

        payload_7 = {"dias_treino": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
        result_7 = normalizar_questionario(payload_7)
        assert result_7["disponibilidade_semanal"] == 7

    def test_age_calculated_from_data_nascimento_with_edge_case(self):
        """Calcula idade considerando aniversário ainda não chegado este ano."""
        hoje = datetime.date.today()
        # Aniversário NO FUTURO este ano
        proxima_data_aniversario = hoje.replace(month=12, day=31)
        if proxima_data_aniversario <= hoje:
            # Aniversário já passou
            proxima_data_aniversario = hoje.replace(year=hoje.year + 1, month=1, day=1)

        data_nascimento = proxima_data_aniversario.replace(year=hoje.year - 30)

        payload = {
            "data_nascimento": data_nascimento.isoformat(),
        }
        result = normalizar_questionario(payload)

        # Quando data_nascimento é no futuro este ano, idade é year_diff - 1
        if data_nascimento.month > hoje.month or (data_nascimento.month == hoje.month and data_nascimento.day > hoje.day):
            assert result["idade"] == 29
        else:
            assert result["idade"] == 30

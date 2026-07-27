# O relatório de curadoria não pode contar grafias equivalentes como exercícios
# diferentes nem inventar usuários quando o join vier vazio.

from scripts.exercicios_fora_do_catalogo import agrupar_livres


def test_relatorio_agrupa_nome_normalizado_e_ordena_por_frequencia():
    linhas = [
        {"name": "Rosca Escocesa", "planned_sessions": {"user_id": "u-1"}},
        {"name": "rosca escocesa", "planned_sessions": {"user_id": "u-1"}},
        {"name": "Rósca escocesa", "planned_sessions": {"user_id": "u-2"}},
        {"name": "Movimento raro", "planned_sessions": {"user_id": "u-3"}},
    ]

    resultado = agrupar_livres(linhas)

    assert resultado[0] == {
        "nome": "Rosca Escocesa",
        "nome_normalizado": "rosca escocesa",
        "ocorrencias": 3,
        "usuarios_distintos": 2,
    }
    assert resultado[1]["ocorrencias"] == 1


def test_relatorio_ignora_nome_vazio_e_nao_inventa_usuario():
    resultado = agrupar_livres(
        [
            {"name": "", "planned_sessions": {"user_id": "u-1"}},
            {"name": "Livre", "planned_sessions": None},
        ]
    )

    assert resultado == [
        {
            "nome": "Livre",
            "nome_normalizado": "livre",
            "ocorrencias": 1,
            "usuarios_distintos": 0,
        }
    ]

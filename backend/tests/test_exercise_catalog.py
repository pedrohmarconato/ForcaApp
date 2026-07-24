"""
Catálogo canônico de exercícios.

Cada teste aqui reproduz um defeito REAL observado no plano gerado em
homologação em 23/07/2026 (plano fab9b0b0…, Haiku 4.5): tradução literal do
inglês, estado da semana dentro do nome e ausência de grupo muscular.
"""

import pytest

from backend.services.exercise_catalog import (
    carregar_catalogo,
    catalogo_para_prompt,
    normalizar,
    resolver_exercicio,
    separar_qualificador,
)


# Os 30 nomes distintos que a IA gravou no plano ativo do HML, com o
# equipamento que ela declarou. É a prova de fogo do catálogo.
NOMES_REAIS_DO_HML = [
    ("Agachamento com Halteres (Goblet - Mínimo)", "Haltere"),
    ("Barra Fixa (Deload)", "Barra fixa"),
    ("Barra Fixa (Força)", "Barra fixa"),
    ("Barra Fixa (Strict Pull-up ou Assisted)", "Barra fixa"),
    ("Caminhada em Ritmo Leve", "Nenhum"),
    ("Corrida ou Ciclismo (LISS)", "Esteira/Bicicleta"),
    ("Dead Bug", "Peso corporal"),
    ("Desenvolvimento com Halteres (Deload)", "Halteres"),
    ("Desenvolvimento com Halteres (Overhead Press)", "Halteres"),
    ("Elevação Frontal com Halteres", "Halteres"),
    ("Elevação Lateral (Deload)", "Halteres"),
    ("Elevação Lateral com Halteres", "Halteres"),
    ("Encolhimento de Ombros com Halteres", "Halteres"),
    ("Flexão de Ombro com Barra", "Barra"),
    ("Linha Curvada (Deload)", "Halteres"),
    ("Linha Curvada com Halteres", "Halteres"),
    ("Mergulho Assistido (Força)", "Barra de mergulho/Assistido"),
    ("Prancha", "Peso corporal"),
    ("Rosca Direta Inclinada (Deload)", "Halteres"),
    ("Rosca Direta Inclinada com Halteres", "Halteres"),
    ("Rosca Direta com Barra", "Barra"),
    ("Rosca Direta com Barra (Deload)", "Barra"),
    ("Rosca Direta com Barra (Força)", "Barra"),
    ("Rosca Martelo com Halteres", "Halteres"),
    ("Rosca com Halteres", "Halteres"),
    ("Supino com Barra (Força)", "Barra"),
    ("Supino com Halteres", "Halteres"),
    ("Supino com Halteres (Deload)", "Halteres"),
    ("Tríceps Francês (Deload)", "Haltere"),
    ("Tríceps Francês com Haltere", "Haltere"),
]


class TestIntegridadeDoCatalogo:
    def test_catalogo_carrega_e_tem_campos_obrigatorios(self):
        catalogo = carregar_catalogo()
        assert len(catalogo) >= 50
        for ex in catalogo:
            assert ex.chave and ex.nome, f"entrada sem chave/nome: {ex}"
            assert ex.grupo_muscular, f"{ex.chave} sem grupo muscular"
            assert ex.equipamento, f"{ex.chave} sem equipamento"
            assert ex.incremento_kg > 0, f"{ex.chave} com incremento não-positivo"

    def test_nenhuma_chave_duplicada(self):
        chaves = [ex.chave for ex in carregar_catalogo()]
        assert len(chaves) == len(set(chaves))

    def test_nenhum_alias_aponta_para_dois_exercicios(self):
        """Ambiguidade de alias canonizaria errado para sempre — o índice recusa."""
        vistos = {}
        for ex in carregar_catalogo():
            for forma in (ex.nome, *ex.aliases):
                n = normalizar(forma)
                assert vistos.get(n, ex.chave) == ex.chave, (
                    f"alias '{forma}' colide entre '{vistos.get(n)}' e '{ex.chave}'"
                )
                vistos[n] = ex.chave


class TestTraducaoLiteralDoIngles:
    def test_linha_curvada_vira_remada_curvada(self):
        """'bent-over row' traduzido literalmente virava 'Linha Curvada'."""
        r = resolver_exercicio("Linha Curvada com Halteres", "Halteres")
        assert r.casou
        assert r.nome == "Remada Curvada com Halteres"
        assert r.chave == "remada_curvada_halteres"
        assert r.grupo_muscular == "Costas"
        assert r.nome_original == "Linha Curvada com Halteres"

    def test_mergulho_assistido_vira_paralelas(self):
        r = resolver_exercicio("Mergulho Assistido", "Barra de mergulho/Assistido")
        assert r.casou and r.chave == "paralelas_mergulho"

    def test_flexao_de_ombro_com_barra_vira_elevacao_frontal(self):
        """Termo cinesiológico não é nome de exercício de academia."""
        r = resolver_exercicio("Flexão de Ombro com Barra", "Barra")
        assert r.casou and r.chave == "elevacao_frontal_barra"

    def test_termos_em_ingles_cru_resolvem(self):
        assert resolver_exercicio("Dead Bug").chave == "dead_bug"
        assert resolver_exercicio("Leg Press").chave == "leg_press"
        assert resolver_exercicio("Pull Up").chave == "barra_fixa_pronada"


class TestEstadoDaSemanaNoNome:
    def test_deload_nao_muda_a_identidade(self):
        """O defeito que quebrava a sugestão de carga."""
        base = resolver_exercicio("Supino com Halteres", "Halteres")
        deload = resolver_exercicio("Supino com Halteres (Deload)", "Halteres")
        assert base.chave == deload.chave == "supino_reto_halteres"
        assert base.nome == deload.nome
        assert deload.qualificador == "Deload"

    def test_forca_e_minimo_tambem_saem_do_nome(self):
        assert resolver_exercicio("Rosca Direta com Barra (Força)", "Barra").chave == (
            resolver_exercicio("Rosca Direta com Barra", "Barra").chave
        )
        r = resolver_exercicio("Agachamento com Halteres (Goblet - Mínimo)", "Haltere")
        assert r.chave == "agachamento_goblet"
        assert r.qualificador == "Goblet - Mínimo"

    def test_separar_qualificador(self):
        assert separar_qualificador("Supino com Halteres (Deload)") == (
            "Supino com Halteres",
            "Deload",
        )
        assert separar_qualificador("Prancha") == ("Prancha", None)
        assert separar_qualificador("Barra Fixa (A) (B)") == ("Barra Fixa", "A · B")


class TestDesempatePorEquipamento:
    def test_mesmo_nome_com_implementos_diferentes(self):
        """'Linha Curvada' existe com barra e com halteres — o equipamento decide."""
        com_halteres = resolver_exercicio("Linha Curvada", "Halteres")
        com_barra = resolver_exercicio("Linha Curvada", "Barra")
        assert com_halteres.chave == "remada_curvada_halteres"
        assert com_barra.chave == "remada_curvada_barra"

    def test_equipamento_no_singular_ou_em_ingles_e_equivalente(self):
        assert resolver_exercicio("Tríceps Francês", "Haltere").chave == "triceps_frances"
        assert resolver_exercicio("Supino Reto", "dumbbell").chave == "supino_reto_halteres"


class TestNaoInventa:
    def test_nome_fora_do_catalogo_passa_intacto(self):
        r = resolver_exercicio("Exercício Inventado XPTO", "Halteres")
        assert not r.casou
        assert r.nome == "Exercício Inventado XPTO"
        assert r.chave is None
        assert r.grupo_muscular is None, "grupo muscular errado é pior que ausente"

    def test_nome_ambiguo_nao_e_chutado(self):
        """'Rosca' sozinho serve a meia dúzia de exercícios: não decide."""
        r = resolver_exercicio("Rosca")
        assert not r.casou

    def test_nome_vazio_nao_explode(self):
        r = resolver_exercicio(None)
        assert not r.casou and r.nome == "Exercício"

    def test_nao_troca_o_implemento_declarado(self):
        """Halteres nunca deve virar a variante com barra."""
        r = resolver_exercicio("Rosca Direta com Halteres", "Halteres")
        assert r.chave == "rosca_direta_halteres"


class TestPlanoRealDoHml:
    @pytest.mark.parametrize("nome,equipamento", NOMES_REAIS_DO_HML)
    def test_todo_nome_gerado_pela_ia_e_canonizado(self, nome, equipamento):
        r = resolver_exercicio(nome, equipamento)
        assert r.casou, f"'{nome}' ficou fora do catálogo"
        assert r.grupo_muscular, f"'{nome}' resolveu sem grupo muscular"

    def test_variantes_do_mesmo_exercicio_colapsam_na_mesma_chave(self):
        """Antes: 5 identidades diferentes. Depois: 2 exercícios."""
        supinos = {
            resolver_exercicio(n, e).chave
            for n, e in [
                ("Supino com Halteres", "Halteres"),
                ("Supino com Halteres (Deload)", "Halteres"),
            ]
        }
        roscas = {
            resolver_exercicio(n, e).chave
            for n, e in [
                ("Rosca Direta com Barra", "Barra"),
                ("Rosca Direta com Barra (Força)", "Barra"),
                ("Rosca Direta com Barra (Deload)", "Barra"),
            ]
        }
        assert len(supinos) == 1
        assert len(roscas) == 1


class TestCatalogoParaPrompt:
    def test_lista_agrupada_nao_vazia(self):
        texto = catalogo_para_prompt()
        assert "Peito:" in texto and "Costas:" in texto
        assert "Remada Curvada com Halteres" in texto
        assert "Linha Curvada" not in texto, "o prompt só oferece nome canônico"

    def test_filtro_por_equipamento_preserva_peso_corporal_e_cardio(self):
        texto = catalogo_para_prompt(["Halteres"])
        assert "Flexão de Braço" in texto  # peso corporal nunca é filtrado
        assert "Caminhada" in texto  # cardio nunca é filtrado
        assert "Supino Reto com Halteres" in texto

    def test_filtro_que_esvaziaria_o_catalogo_e_ignorado(self):
        texto = catalogo_para_prompt(["Equipamento Que Não Existe"])
        assert "Supino Reto com Barra" in texto

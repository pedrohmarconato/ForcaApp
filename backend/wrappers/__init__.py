# backend/wrappers/__init__.py

from .distribuidor_treinos import DistribuidorTreinos
from .sistema_adaptacao_treino import SistemaAdaptacaoTreino
from .treinador_especialista import TreinadorEspecialista

__all__ = ['DistribuidorTreinos', 'SistemaAdaptacaoTreino', 'TreinadorEspecialista']
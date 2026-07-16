# backend/wrappers/__init__.py

# TreinadorEspecialista é o único wrapper funcional/importável hoje.
# DistribuidorTreinos e SistemaAdaptacaoTreino referenciam módulos que
# não existem no repositório (utils.path_resolver, wrappers.supabase_client)
# e quebram a importação do pacote inteiro. Importação direta pelo caminho
# do módulo continua possível quando forem corrigidos (ver Fase 2).
from .treinador_especialista import TreinadorEspecialista

__all__ = ['TreinadorEspecialista']

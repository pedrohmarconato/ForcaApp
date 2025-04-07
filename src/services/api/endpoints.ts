// /home/pmarconato/ForcaApp/src/services/api/endpoints.ts

// Centralização dos endpoints da API para fácil manutenção e consistência
export const ENDPOINTS = {
  AUTH: {
      LOGIN: '/auth/login',
      REGISTER: '/auth/register',
      LOGOUT: '/auth/logout',
      RESET_PASSWORD: '/auth/reset-password',
      REFRESH_TOKEN: '/auth/refresh-token', // Endpoint para renovar o token de acesso
  },
  USER: {
      PROFILE: '/user/profile', // Endpoint para buscar o perfil
      UPDATE_PROFILE: '/user/profile', // Endpoint para atualizar o perfil (pode ser o mesmo)
      QUESTIONNAIRE: '/user/questionnaire', // Endpoint para enviar/buscar dados do questionário
  },
  TRAINING: {
      PLANS: '/training/plans', // Endpoint para listar planos de treino
      SESSIONS: '/training/sessions', // Endpoint para sessões de treino
      ADAPTATIONS: '/training/adaptations', // Endpoint para adaptações de treino
      GENERATE_PLAN: '/generate-plan', // Endpoint para solicitar a geração de um novo plano *** ADICIONADO ***
  },
  HEALTH: {
      STATS: '/health/stats', // Endpoint para estatísticas de saúde
      SLEEP: '/health/sleep', // Endpoint para dados de sono
  },
  // Adicione outras categorias e endpoints conforme necessário
};
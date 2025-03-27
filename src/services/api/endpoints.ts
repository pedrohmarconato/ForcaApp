// Centralização dos endpoints da API
export const ENDPOINTS = {
    AUTH: {
      LOGIN: '/auth/login',
      REGISTER: '/auth/register',
      LOGOUT: '/auth/logout',
      RESET_PASSWORD: '/auth/reset-password',
      REFRESH_TOKEN: '/auth/refresh-token',
    },
    USER: {
      PROFILE: '/user/profile',
      UPDATE_PROFILE: '/user/profile',
      QUESTIONNAIRE: '/user/questionnaire',
    },
    TRAINING: {
      PLANS: '/training/plans',
      SESSIONS: '/training/sessions',
      ADAPTATIONS: '/training/adaptations',
    },
    HEALTH: {
      STATS: '/health/stats',
      SLEEP: '/health/sleep',
    },
  };
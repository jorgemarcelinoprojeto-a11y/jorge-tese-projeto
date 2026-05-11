/**
 * Mensagens amigáveis para erros de IA no frontend.
 * Detecta 429/quota/rate limit e informa que a aplicação tentou acessar o modelo (Gemini/OpenAI) e não conseguiu.
 */

const RATE_LIMIT_KEYWORDS = [
  '429',
  'Too Many Requests',
  'quota',
  'Quota exceeded',
  'rate limit',
  'rate_limit',
  'insufficient_quota',
  'limite',
  'exceeded',
  'retry in'
];

/**
 * Verifica se a mensagem indica erro de limite de uso da API (429/quota).
 */
export function isRateLimitOrQuotaError(messageOrError: string | unknown): boolean {
  const msg = typeof messageOrError === 'string'
    ? messageOrError
    : (messageOrError as any)?.message ?? (messageOrError as any)?.error ?? '';
  const lower = String(msg).toLowerCase();
  return RATE_LIMIT_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

/**
 * Retorna mensagem amigável para exibir ao usuário quando o erro for de acesso ao modelo (Gemini/OpenAI/etc).
 * Se for 429/quota, explica que a aplicação tentou acessar o modelo e não está dando certo; caso contrário devolve a mensagem original.
 */
export function getAIErrorMessage(messageOrError: string | unknown, fallback = 'Erro ao acessar o modelo de IA.'): string {
  const raw = typeof messageOrError === 'string'
    ? messageOrError
    : (messageOrError as any)?.message ?? (messageOrError as any)?.error ?? fallback;
  const msg = String(raw).trim();

  if (isRateLimitOrQuotaError(msg)) {
    return 'Limite de uso da API (Gemini, OpenAI, Claude, etc.) excedido. A aplicação tentou acessar o modelo e não obteve resposta. Aguarde alguns minutos e tente novamente, ou verifique plano e faturamento do provedor.';
  }

  return msg || fallback;
}

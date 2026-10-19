export const isRateLimitError=code=>['QUOTA_EXCEEDED','GROQ_QUOTA_EXCEEDED'].includes(code);

/** Fail fast on a bad environment instead of half-working at runtime. */
export function validateEnv(env: Record<string, unknown>) {
  const need = (key: string): string => {
    const v = env[key];
    if (typeof v !== 'string' || !v.trim()) {
      throw new Error(`Thiếu biến môi trường ${key} (xem .env.example)`);
    }
    return v;
  };
  need('MONGODB_URI');
  if (need('JWT_SECRET').length < 32) {
    throw new Error('JWT_SECRET phải dài ít nhất 32 ký tự');
  }
  if (need('COOKIE_SECRET').length < 32) {
    throw new Error('COOKIE_SECRET phải dài ít nhất 32 ký tự');
  }
  return env;
}

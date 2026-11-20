export const TERMS_VERSION = '2026-11-20';
const fail = (code, status = 400) => ({ status, body: { error: { code } } });
const verification = () => ({ status: 200, body: { data: { session: null, verification: 'link' } } });

// All Auth SDK clients are request-local. A signed-in client must never replace
// the service client used for rate limiting, identity lookup or consent writes.
export async function continueAccount(input, { admin, auth, hash, network }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('invalid_request');
  if (input.acceptedTerms !== true || input.termsVersion !== TERMS_VERSION) return fail('terms_required');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = input.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== 'string' || !password.length || password.length > 1024) return fail('invalid_request');
  try {
    for (const [value, limit] of [['network:'+network, 30], ['email:'+email, 6]]) {
      const { data, error } = await admin.rpc('saldo_auth_take_attempt', { p_key_hash: await hash(value), p_limit: limit, p_window_seconds: 60 });
      if (error) throw error;
      if (!data) return fail('over_request_rate_limit', 429);
    }
    const { data: exists, error: lookupError } = await admin.rpc('saldo_auth_email_exists', { p_email: email });
    if (lookupError || typeof exists !== 'boolean') throw lookupError || new Error('Lookup unavailable');
    // Do not fall back to signUp when an existing account has a wrong password.
    const result = exists
      ? await auth.signInWithPassword({ email, password })
      : password.length < 8 ? { error: { code:'weak_password' } }
      : await auth.signUp({ email, password, options: { emailRedirectTo: 'https://saldo.tobmarket.ing/' } });
    if (result.error) {
      if (result.error.code === 'email_not_confirmed') return verification();
      const code = ['weak_password','over_email_send_rate_limit','over_request_rate_limit','signup_disabled'].includes(result.error.code)
        ? result.error.code : 'invalid_credentials';
      return fail(code, code.includes('rate_limit') ? 429 : 400);
    }
    const { user, session } = result.data || {};
    // A raced sign-up can return an obfuscated existing user. Never associate
    // a consent record with that response or claim that a new account exists.
    if (!user?.id || (!exists && !session && !user.identities?.length)) return fail('invalid_credentials');
    const { error: consentError } = await admin.from('saldo_terms_acceptances').upsert({
      user_id:user.id,terms_version:TERMS_VERSION,method:'password',
    }, { onConflict:'user_id,terms_version',ignoreDuplicates:true });
    if (consentError) throw consentError;
    if (!session) return verification();
    return { status:200,body:{data:{session:{access_token:session.access_token,refresh_token:session.refresh_token}}} };
  } catch { return fail('unified_auth_unavailable', 503); }
}

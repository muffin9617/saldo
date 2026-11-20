import { supabaseUrl, supabaseKey } from './supabase-config.js';
import { termsVersion } from './legal.js';

export const client = window.supabase?.createClient(supabaseUrl, supabaseKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: false },
});

export const callbackUrl = location.origin + '/';

export async function continueWithPassword(email, password) {
  const { data, error } = await client.functions.invoke('saldo-auth', {
    body: { email, password, acceptedTerms:true, termsVersion },
  });
  if (error || data?.error) {
    let code = data?.error?.code;
    if (!code && error?.context instanceof Response) {
      try { code = (await error.context.json()).error?.code; } catch {}
    }
    throw Object.assign(new Error('Account continuation failed'), {code:code || 'unified_auth_unavailable'});
  }
  if (data?.data?.session) {
    const session = await client.auth.setSession(data.data.session);
    if (session.error) throw session.error;
    return session;
  }
  return {data:{session:null,verification:data?.data?.verification || 'link'}};
}

export async function hasAcceptedTerms(userId) {
  const {data,error} = await client.from('saldo_terms_acceptances').select('terms_version')
    .eq('user_id',userId).eq('terms_version',termsVersion).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function acceptTerms(method = 'password') {
  const {error} = await client.rpc('saldo_accept_terms',{p_terms_version:termsVersion,p_method:method});
  if (error) throw error;
}

export function rememberGoogleConsent() {
  try { sessionStorage.setItem('saldo.pendingTerms',JSON.stringify({version:termsVersion,at:Date.now()})); } catch {}
}

export async function completeGoogleConsent(session) {
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem('saldo.pendingTerms')); } catch {}
  if (pending?.version !== termsVersion || !(Date.now()-pending.at >= 0 && Date.now()-pending.at < 1800000)
      || session.user.app_metadata?.provider !== 'google') return false;
  await acceptTerms('google');
  try { sessionStorage.removeItem('saldo.pendingTerms'); } catch {}
  return true;
}

export async function completeAuthCallback() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const fragment = new URLSearchParams(url.hash.slice(1));
  const failed = url.searchParams.has('error') || fragment.has('error');

  if (!code && !tokenHash && !failed) return {};
  history.replaceState(null, '', url.pathname);
  if (failed) return { message: '链接已失效或登录已取消，请重试。' };

  if (tokenHash && ['email', 'signup', 'recovery'].includes(type)) {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    return error
      ? { message: '邮件链接已失效，请重新申请。' }
      : { recovery: type === 'recovery', message: '邮箱验证成功。' };
  }

  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    return error
      ? { message: '验证失败。请在发起操作的浏览器打开链接，或重新申请。' }
      : { recovery: type === 'recovery' || data.redirectType === 'recovery' };
  }
  return { message: '验证链接无效，请重新申请。' };
}

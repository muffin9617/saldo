import { supabaseUrl, supabaseKey } from './supabase-config.js';

export const client = window.supabase?.createClient(supabaseUrl, supabaseKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: false },
});

export const callbackUrl = location.origin + '/';

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

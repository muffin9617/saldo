import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { continueAccount } from './handler.js';

const env = (key: string) => Deno.env.get(key) || '';
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const allowed = origin === 'https://saldo.tobmarket.ing';
  const headers = {
    'Access-Control-Allow-Origin':'https://saldo.tobmarket.ing',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Cache-Control':'no-store','Vary':'Origin',
  };
  const respond = (body: unknown, status: number) => Response.json(body,{status,headers});
  if (origin && !allowed) return respond({error:{code:'invalid_origin'}},403);
  if (request.method === 'OPTIONS') return new Response(null,{headers});
  if (request.method !== 'POST') return respond({error:{code:'method_not_allowed'}},405);
  let input;
  try {
    // Bound the streamed request as well as any declared Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return respond({error:{code:'invalid_request'}},400);
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return respond({error:{code:'request_too_large'}},413); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.length; }
    input = JSON.parse(new TextDecoder().decode(buffer));
  } catch { return respond({error:{code:'invalid_request'}},400); }
  const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin = createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
  const auth = createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),options).auth;
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env('SUPABASE_SERVICE_ROLE_KEY')),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
  // The gateway appends its peer; do not trust a caller-prepended first address.
  const peer = (request.headers.get('x-forwarded-for') || '').split(',').at(-1)?.trim() || 'unknown';
  const result = await continueAccount(input,{admin,auth,hash,network:peer.slice(0,100)});
  return respond(result.body,result.status);
});

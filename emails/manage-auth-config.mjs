// Uses only Supabase's documented Management API. Never prints or saves the PAT,
// SMTP secrets, returned full configuration, or email tokens.
import {writeFile} from 'node:fs/promises';
import {authConfigPatch} from './auth-templates.mjs';
import {auditAuthConfig,changedFields} from './auth-config-audit.mjs';

const mode=process.argv[2] || 'audit';
if (!['audit','apply','plan'].includes(mode)) throw new Error('Usage: node emails/manage-auth-config.mjs [plan|audit|apply]');
const project='drmwnngessqqbszhleja';
const patch=authConfigPatch();
if(mode==='plan') {
  console.log(JSON.stringify({project,fields:Object.keys(patch),preserved:'SMTP credentials, callback URLs, providers, all security switches except password-changed. No network request or email.'},null,2));
} else {
  async function readHiddenToken() {
    if(process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
    if(!process.stdin.isTTY) throw new Error('Use an interactive terminal or SUPABASE_ACCESS_TOKEN; do not put tokens in command arguments.');
    process.stdout.write('Supabase personal access token（输入隐藏，不会保存）: ');
    process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
    return await new Promise((resolve,reject)=>{
      let value='';
      function finish(){process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');}
      function onData(chunk){
        for(const char of chunk){
          if(char==='\u0003'){finish();reject(new Error('Cancelled'));return;}
          if(char==='\r'||char==='\n'){finish();resolve(value.trim());return;}
          if(char==='\u007f'||char==='\b')value=value.slice(0,-1);
          else if(char>=' ')value+=char;
        }
      }
      process.stdin.on('data',onData);
    });
  }
  const token=await readHiddenToken();
  if(!token) throw new Error('No token supplied; no changes made.');
  async function request(method,body) {
    const response=await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`,{
      method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Management API ${method} failed (${response.status}); response omitted to protect credentials.`);
    return await response.json();
  }
  try {
    const before=await request('GET');
    if(mode==='apply') {
      const preflight=auditAuthConfig(before);
      if(!preflight.checks.siteUrl || !preflight.checks.signupRequiresVerification || !preflight.checks.smtpHostConfigured || !preflight.checks.noSendEmailHookOverride)
        throw new Error('Preflight failed: check Site URL, signup verification, SMTP and email hook in the audit first. No changes made.');
      const fields=changedFields(before);
      // Back up only fields we change. No SMTP password or other auth secrets.
      if(fields.length){
        const backup=Object.fromEntries(fields.map(key=>[key,before[key] ?? null]));
        const path=`/private/tmp/saldo-auth-template-backup-${Date.now()}.json`;
        await writeFile(path,JSON.stringify(backup,null,2)+'\n',{mode:0o600});
        console.log(`Template-only rollback backup: ${path}`);
        await request('PATCH',Object.fromEntries(fields.map(key=>[key,patch[key]])));
      }
      console.log(`Updated ${fields.length} template/security fields; no test mail sent.`);
    }
    const report=auditAuthConfig(mode==='apply'?await request('GET'):before);
    const reportPath='/private/tmp/saldo-auth-config-audit.json';
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(report,null,2));
    console.log(`Sanitized report: ${reportPath}`);
    if(!report.configurationMatches)process.exitCode=2;
  } catch(error) {
    // Fetch/parse errors can contain upstream text; never print their objects.
    console.error(error.message.startsWith('Management API')||error.message.startsWith('Preflight')?error.message:'Configuration request failed; credentials and server response omitted.');
    process.exitCode=1;
  }
}

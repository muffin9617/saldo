const assert = require('node:assert/strict');
(async () => {
  const {continueAccount,TERMS_VERSION} = await import('../supabase/functions/saldo-auth/handler.js');
  const base = {email:' Person@Example.test ',password:'Valid123!',acceptedTerms:true,termsVersion:TERMS_VERSION};
  function fixture({exists=true,authError=null,limited=false,lookupError=false,signupError=null,consentError=false,raced=false}={}) {
    const calls=[];
    const session={access_token:'fixture-access',refresh_token:'fixture-refresh'};
    const account={user:{id:'own',identities:raced?[]:[{id:'identity'}]},session:exists?session:null};
    const admin={rpc:async(name,args)=>{
      calls.push([name,args]);
      return name==='saldo_auth_email_exists'?{data:exists,error:lookupError}:{data:!limited};
    },from:table=>({upsert:async(row,options)=>{calls.push(['consent',row,options]);return {error:consentError}}})};
    const auth={signInWithPassword:async value=>{calls.push(['login',value]);return {data:account,error:authError}},signUp:async value=>{calls.push(['signup',value]);return {data:account,error:signupError}}};
    return {calls,dependencies:{admin,auth,hash:async x=>'hash:'+x,network:'fixture-network'}};
  }
  let f=fixture(),r=await continueAccount(base,f.dependencies);
  assert.equal(r.status,200);assert.equal(r.body.data.session.access_token,'fixture-access');
  assert.equal(f.calls.find(x=>x[0]==='login')[1].email,'person@example.test');
  assert.equal(f.calls.some(x=>x[0]==='signup'),false);
  assert.equal(f.calls.find(x=>x[0]==='consent')[2].ignoreDuplicates,true);
  f=fixture({authError:{code:'invalid_credentials'}});r=await continueAccount(base,f.dependencies);
  assert.equal(r.body.error.code,'invalid_credentials');assert.equal(f.calls.some(x=>x[0]==='signup'||x[0]==='consent'),false);
  f=fixture({authError:{code:'email_not_confirmed'}});r=await continueAccount(base,f.dependencies);
  assert.equal(r.body.data.verification,'link');assert.equal(f.calls.some(x=>x[0]==='signup'||x[0]==='consent'),false);
  f=fixture({exists:false});r=await continueAccount(base,f.dependencies);
  assert.equal(r.body.data.session,null);assert.equal(r.body.data.verification,'link');
  assert.equal(f.calls.some(x=>x[0]==='login'),false);assert.ok(f.calls.some(x=>x[0]==='consent'));
  for(const change of [{acceptedTerms:false},{termsVersion:'old'},{password:''},{email:'invalid'},null]){
    f=fixture();r=await continueAccount(change===null?null:{...base,...change},f.dependencies);
    assert.equal(r.status,400);assert.equal(f.calls.length,0);
  }
  f=fixture({exists:false});r=await continueAccount({...base,password:'short'},f.dependencies);
  assert.equal(r.body.error.code,'weak_password');assert.equal(f.calls.some(x=>x[0]==='signup'),false);
  f=fixture({limited:true});r=await continueAccount(base,f.dependencies);assert.equal(r.status,429);assert.equal(f.calls.length,1);
  f=fixture({lookupError:true});r=await continueAccount(base,f.dependencies);assert.equal(r.status,503);assert.equal(f.calls.some(x=>x[0]==='signup'||x[0]==='login'),false);
  f=fixture({exists:false,raced:true});r=await continueAccount(base,f.dependencies);assert.equal(r.status,400);assert.equal(f.calls.some(x=>x[0]==='consent'),false);
  f=fixture({consentError:true});r=await continueAccount(base,f.dependencies);assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('fixture-access'));
  console.log('PASS unified account: existing login, wrong password/no signup, pending/no password change, new signup, verified-link UX, consent version, rate limits, lookup failure and signup race.');
})().catch(error=>{console.error(error);process.exitCode=1});

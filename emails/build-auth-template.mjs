import { writeFile } from 'node:fs/promises';
import { authTemplates, renderAuthEmail, authConfigPatch } from './auth-templates.mjs';

// Token-hash verification is supported by Saldo's existing auth callback,
// including opening the confirmation email on a different device.
for (const template of authTemplates) {
  const message = renderAuthEmail(template);
  const stem = 'auth-'+template.key.replaceAll('_','-');
  for (const [suffix,content] of [['.html',message.html],['-source.txt',message.html],['-subject.txt',message.subject],['-text.txt',message.text]]) {
    await writeFile(new URL('./'+stem+suffix, import.meta.url),content+'\n');
  }
}
await writeFile(new URL('./auth-config-patch.json',import.meta.url),JSON.stringify(authConfigPatch(),null,2)+'\n');
console.log('Generated 13 branded Auth templates, copy sources, subjects, text references and configuration patch. No configuration changed; no mail sent.');

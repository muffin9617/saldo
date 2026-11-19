import { writeFile } from 'node:fs/promises';
import { confirmationEmail } from '../supabase/functions/saldo-notifications/email-templates.js';

// Token-hash verification is supported by Saldo's existing auth callback,
// including opening the confirmation email on a different device.
const message = confirmationEmail({ verificationUrl: '{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=signup' });
await writeFile(new URL('./auth-confirmation.html', import.meta.url), message.html+'\n');
await writeFile(new URL('./auth-confirmation-subject.txt', import.meta.url), message.subject+'\n');
console.log('Generated the Supabase confirmation subject and HTML template.');

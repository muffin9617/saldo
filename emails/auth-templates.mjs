import {authTemplates, renderAuthEmail} from '../supabase/functions/saldo-notifications/email-templates.js';
export {authTemplates, renderAuthEmail};

export function authConfigPatch() {
  const patch = {};
  for (const template of authTemplates) {
    const message = renderAuthEmail(template);
    patch[`mailer_subjects_${template.key}`] = message.subject;
    patch[`mailer_templates_${template.key}_content`] = message.html;
  }
  // Preserve other security switches and authentication settings.
  patch.mailer_notifications_password_changed_enabled = true;
  return patch;
}

import {createHash} from 'node:crypto';
import {authTemplates, authConfigPatch} from './auth-templates.mjs';

const hash = value => createHash('sha256').update(String(value ?? '')).digest('hex');
export function auditAuthConfig(config) {
  const expected = authConfigPatch();
  const site = String(config.site_url || '').replace(/\/+$/,'');
  const allow = String(config.uri_allow_list || '').split(',').map(item=>item.trim());
  const checks = {
    siteUrl:site === 'https://saldo.tobmarket.ing',
    callbackAllowList:allow.includes('https://saldo.tobmarket.ing/**') ||
      (allow.includes('https://saldo.tobmarket.ing/') && allow.includes('https://saldo.tobmarket.ing/?type=recovery')),
    signupRequiresVerification:config.mailer_autoconfirm === false,
    smtpHostConfigured:Boolean(config.smtp_host),
    smtpUserConfigured:Boolean(config.smtp_user),
    senderAddress:config.smtp_admin_email === 'noreply@saldo.tobmarket.ing',
    senderName:config.smtp_sender_name === 'Saldo',
    passwordChangedNotice:config.mailer_notifications_password_changed_enabled === true,
    noSendEmailHookOverride:config.hook_send_email_enabled === false,
  };
  const templates = authTemplates.map(item=>{
    const contentKey=`mailer_templates_${item.key}_content`;
    const subjectKey=`mailer_subjects_${item.key}`;
    const notification = item.key.replace(/_notification$/,'');
    return {id:item.id,name:item.label,currentJourney:item.currentJourney,
      enabled:item.security ? config[`mailer_notifications_${notification}_enabled`] ?? 'unknown' : 'event-dependent',
      subjectMatches:config[subjectKey]===expected[subjectKey],htmlMatches:config[contentKey]===expected[contentKey],
      htmlSha256:hash(config[contentKey]),expectedHtmlSha256:hash(expected[contentKey])};
  });
  return {checkedAt:new Date().toISOString(),checks,otpExpirySeconds:config.mailer_otp_exp ?? null,
    rateLimitEmailSent:config.rate_limit_email_sent ?? null,templates,
    configurationMatches:Object.values(checks).every(Boolean)&&templates.every(t=>t.subjectMatches&&t.htmlMatches),
    limitations:['SMTP password validity and Resend tracking require delivery/provider verification.','This report proves configuration, not actual receipt or link behavior.']};
}

export function changedFields(config, patch=authConfigPatch()) {
  return Object.keys(patch).filter(key=>config[key]!==patch[key]);
}

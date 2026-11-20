-- Run after review and deployment of saldo-notifications with JWT verification disabled.
-- Its handler validates user JWTs for status and the dedicated cron bearer for dispatch.
-- Store the deployed function URL in Vault as saldo_reminder_url.
-- Store the same random secret in Vault as saldo_reminder_token and in function secrets
-- as SALDO_REMINDER_TOKEN. Avoid putting either secret value in Git.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- With pg_cron's default UTC time zone, 01:00 UTC is 09:00 Asia/Hong_Kong.
-- Run once daily. Dates are evaluated in each account's saved time zone.
select cron.schedule(
  'saldo-subscription-reminders',
  '0 1 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'saldo_reminder_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'saldo_reminder_token')
    ),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Keep the job inactive until a controlled end-to-end delivery test passes.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'saldo-subscription-reminders'),
  active := false
);
commit;

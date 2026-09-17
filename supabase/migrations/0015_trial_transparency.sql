-- Trial transparency for the Agency AI plan.
--
-- The original table stored only OUR word for the subscription state; nothing
-- recorded when a trial ends, so no reminder could be sent, no countdown
-- rendered, and no cancellation reflected. These columns cache the Stripe
-- subscription's clock and the send-state of the three transparency emails
-- (started / reminder / canceled), so every send is idempotent across webhook
-- redeliveries and the daily reconcile sweep.
--
-- Idempotent throughout, like 0013: IF NOT EXISTS everywhere, and the status
-- constraint is resolved from the catalog rather than guessed by name.

alter table agency_subscriptions
  add column if not exists trial_end               timestamptz,
  add column if not exists current_period_end      timestamptz,
  add column if not exists cancel_at_period_end    boolean not null default false,
  -- First line item's price, cached so emails and the billing page can say
  -- "$197 on March 3" without a Stripe read per render.
  add column if not exists amount                  integer,
  add column if not exists currency                text,
  add column if not exists billing_interval        text,
  -- Email send-state. A timestamp, not a boolean: "when" answers support
  -- questions ("did we warn them before charging?") that "whether" cannot.
  add column if not exists started_email_sent_at   timestamptz,
  add column if not exists reminder_email_sent_at  timestamptz,
  add column if not exists canceled_email_sent_at  timestamptz;

-- Widen status: 'past_due' arrives with invoice.payment_failed. Entitlement
-- code grants past_due a grace period (Stripe smart-retries span days) —
-- access is only revoked on customer.subscription.deleted.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'agency_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table agency_subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

alter table agency_subscriptions add constraint agency_subscriptions_status_check
  check (status in ('trialing','active','past_due','canceled'));

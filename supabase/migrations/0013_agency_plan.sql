-- The $197/mo Agency AI plan, sold on growthable.io, plus a country question
-- in the signup survey.
--
-- The marketing site runs the Stripe checkout (metadata.product =
-- 'agency-plan'); this app's webhook records the subscription here and applies
-- the entitlement to the customer's help centre — at webhook time when the
-- centre already exists, at claim time when they pay first and sign up after.

-- Survey: one more question. Text like its siblings — marketing taxonomy,
-- nothing branches on it.
alter table signups add column country text;

alter table signups drop constraint signups_step_check;
alter table signups add constraint signups_step_check
  check (step in ('details','role','company_size','country','agency_name',
                  'subaccount_count','opt_in','build','claim','done'));

-- One row per $197 subscription. Email is the join key to signups (and from
-- there to the help centre): the marketing checkout knows nothing about this
-- app's ids, but it always knows the customer's email.
create table agency_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,               -- lowercased
  stripe_customer_id      text,
  stripe_subscription_id  text not null unique,
  -- 'trialing' from checkout (card-up-front, $0 today), 'canceled' when the
  -- subscription ends. Deliberately OUR word for it, mirroring
  -- ai_widget_installs.billing_status.
  status                  text not null default 'trialing'
                            check (status in ('trialing','active','canceled')),
  help_center_id          uuid references help_centers(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index agency_subscriptions_email on agency_subscriptions (lower(email));

create trigger agency_subscriptions_updated_at before update on agency_subscriptions
  for each row execute function set_updated_at();

-- Writes all go through server code holding the service role. No anon access.
alter table agency_subscriptions enable row level security;

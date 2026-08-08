-- Billing state for the AI widget upgrade.
--
-- Growthable runs the checkout (our Stripe, our brand); Xovera receives
-- the entitlement via its partner API. These columns are our record of
-- the association between an install and its subscription — enough for
-- the webhook to find the install from a Stripe event, and for support
-- to find the subscription from a help centre.

alter table ai_widget_installs
  add column stripe_customer_id     text,
  add column stripe_subscription_id text,
  -- 'trial' until the first successful checkout, then 'paid', then
  -- 'canceled' when the subscription ends. Deliberately OUR word for it:
  -- Xovera's plan names (starter/growth/scale) stay on Xovera's side of
  -- the API, so a change there cannot silently mean something here.
  add column billing_status text not null default 'trial'
    check (billing_status in ('trial', 'paid', 'canceled'));

-- The webhook resolves events by subscription id.
create index ai_widget_installs_subscription
  on ai_widget_installs (stripe_subscription_id)
  where stripe_subscription_id is not null;

insert into help_centers (slug, name, is_base, primary_hex, secondary_hex, settings)
values (
  'base',
  'Base Help Center',
  true,
  '#1f6feb',
  '#6e7781',
  '{"headline": "How can we help?", "subtitle": "Search our guides or browse by topic."}'
)
on conflict (slug) do nothing;

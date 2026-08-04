-- Per-help-center appearance: hero background, fonts, and category tile density.
--
-- Typed columns with CHECK constraints rather than keys in `settings`, so an
-- invalid value cannot reach the renderer. `font_family` and `collections.icon`
-- already existed unused (0001) and are adopted here rather than duplicated:
-- font_family is the BODY font key, collections.icon is the category emoji.

alter table help_centers
  -- 'solid' paints hero_from_hex flat; 'gradient' runs from -> to at hero_angle.
  add column hero_style text not null default 'gradient'
    check (hero_style in ('solid', 'gradient')),

  -- Null means "use the brand colours" (primary_hex / secondary_hex), which is
  -- what almost every center wants. They exist so a center can set a background
  -- independent of its accents without distorting primary_hex to do it.
  add column hero_from_hex text,
  add column hero_to_hex   text,

  add column hero_angle integer not null default 135
    check (hero_angle between 0 and 360),

  -- Null falls back to font_family, so a center that only picks one font gets it
  -- applied to both headings and body.
  add column heading_font text,

  -- Desktop density only; narrower breakpoints step down in CSS.
  add column tiles_per_row integer not null default 3
    check (tiles_per_row in (2, 3, 4));

comment on column help_centers.font_family is
  'Body font key from lib/fonts/catalog.ts. Null uses the app default.';
comment on column help_centers.heading_font is
  'Heading font key from lib/fonts/catalog.ts. Null falls back to font_family.';
comment on column collections.icon is
  'A single emoji shown on the category tile. Null renders no emoji.';

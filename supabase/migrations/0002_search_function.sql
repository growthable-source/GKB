-- Keyword search within one help center. Phase 3 adds a vector CTE and fuses the
-- two rankings; the signature stays the same.
create or replace function search_help_center(
  p_help_center_id uuid,
  p_query          text,
  p_limit          integer default 20
)
returns table (
  article_id uuid,
  slug       text,
  title      text,
  headline   text,
  rank       real
)
language sql
stable
as $$
  select
    s.article_id,
    a.slug,
    s.title,
    ts_headline(
      'english',
      s.body_text,
      websearch_to_tsquery('english', p_query),
      'MaxFragments=1, MaxWords=32, MinWords=12, StartSel=<mark>, StopSel=</mark>'
    ) as headline,
    ts_rank(s.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from article_search s
  join articles a on a.id = s.article_id
  where s.help_center_id = p_help_center_id
    and p_query <> ''
    and s.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc, s.title asc
  limit least(p_limit, 50);
$$;

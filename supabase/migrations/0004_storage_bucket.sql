insert into storage.buckets (id, name, public)
values ('article-media', 'article-media', true)
on conflict (id) do nothing;

create policy "Public read of article media"
  on storage.objects for select
  using (bucket_id = 'article-media');

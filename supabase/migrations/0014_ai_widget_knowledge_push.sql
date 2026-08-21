-- Per-centre debounce for pushing content changes to Xovera's AI widget
-- knowledge. When a customer publishes/edits an article we ask Xovera to
-- re-crawl (lib/ai-widget/knowledge-push.ts); this timestamp throttles
-- those pushes so a burst of edits doesn't spend the org key's shared
-- 60-writes/10-min budget. NULL = never pushed.
alter table ai_widget_installs
  add column if not exists knowledge_pushed_at timestamptz;

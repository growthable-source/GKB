/**
 * The join key Xovera provisions against.
 *
 * Xovera is idempotent on `externalId`: the same value returns the same
 * workspace, a different value creates a second one and bills the customer
 * twice. So this must be stable for the life of a help centre and must never be
 * regenerated per click.
 *
 * Derived from the help centre id rather than stored-and-read, because a
 * derivation cannot drift: there is no window where a row was written but the
 * id was not, and a lost `ai_widget_installs` row can be recovered by calling
 * Xovera with the same key. The value is still persisted alongside the install
 * (see migration 0011) so support can walk the association backwards.
 *
 * The `hc_` prefix namespaces us inside Xovera, whose keyspace is shared with
 * every other partner integration.
 */
export function externalIdFor(helpCenterId: string): string {
  return `hc_${helpCenterId}`
}

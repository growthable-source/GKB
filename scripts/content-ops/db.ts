/**
 * PostgREST caps selects at 1,000 rows; every whole-catalog read must page
 * through .range() or it silently truncates once the catalog outgrows that.
 */
type RangeQuery<Row> = {
  range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
}

export async function selectAll<Row>(makeQuery: () => RangeQuery<Row>, label: string): Promise<Row[]> {
  const PAGE = 1000
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(`${label} query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

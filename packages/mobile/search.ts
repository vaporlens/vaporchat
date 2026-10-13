/** Whether any of `names` has the query in it, any case. An empty query matches all. */
export function matches(query: string, ...names: string[]) {
  const q = query.trim().toLowerCase();
  return q === '' || names.some((name) => name.toLowerCase().includes(q));
}

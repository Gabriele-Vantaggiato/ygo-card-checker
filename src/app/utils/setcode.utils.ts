/** Low 12 bits identify a family; high bits identify subfamilies. */
export function belongsToSetcode(codes: readonly number[], requested: number): boolean {
  if (!Number.isInteger(requested) || requested <= 0 || requested > 0xffff) return false;
  return codes.some(code => (code & 0xfff) === (requested & 0xfff) &&
    (code & requested & 0xf000) === (requested & 0xf000));
}
export function sharesSetcode(a: readonly number[], b: readonly number[]): boolean {
  return a.some(code => belongsToSetcode(b, code) || b.some(other => belongsToSetcode([code], other)));
}

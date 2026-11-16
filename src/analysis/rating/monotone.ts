/**
 * The closest non-decreasing sequence to `values` (weighted least squares),
 * found by pooling adjacent violators: whenever a value is lower than the one
 * before it, the two are replaced by their weighted mean, repeating backwards
 * until the sequence rises again. Used when building the calibration table so
 * that a higher accuracy never suggests a lower rating.
 */
export function nonDecreasing(values: readonly number[], weights: readonly number[]): number[] {
  if (values.length !== weights.length) {
    throw new Error(`nonDecreasing: ${values.length} values but ${weights.length} weights`);
  }
  const blocks: { sum: number; weight: number; count: number }[] = [];
  values.forEach((value, i) => {
    const weight = weights[i] ?? 0;
    blocks.push({ sum: value * weight, weight, count: 1 });
    for (;;) {
      const last = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      if (!last || !previous) break;
      if (previous.sum / previous.weight <= last.sum / last.weight) break;
      blocks.splice(blocks.length - 2, 2, {
        sum: previous.sum + last.sum,
        weight: previous.weight + last.weight,
        count: previous.count + last.count,
      });
    }
  });
  return blocks.flatMap((b) => Array.from({ length: b.count }, () => b.sum / b.weight));
}

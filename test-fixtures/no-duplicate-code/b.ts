export function secondHeader(): string {
  return "b";
}

export function secondTrailer(): string {
  return "trailer";
}

export function anotherThing(value: number): number {
  return value * 2;
}

export function sumWidths(items: { width: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.width;
  }
  return total;
}

export function sumHeights(items: { height: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.height;
  }
  return total;
}

export function sumDepths(items: { depth: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.depth;
  }
  return total;
}

export function sumWeights(items: { weight: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.weight;
  }
  return total;
}

export function sumPrices(items: { price: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
}

export function sumCounts(items: { count: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.count;
  }
  return total;
}

export function sumScores(items: { score: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.score;
  }
  return total;
}

export function sumAges(items: { age: number }[]): number {
  let total = 0;
  for (const item of items) {
    total += item.age;
  }
  return total;
}

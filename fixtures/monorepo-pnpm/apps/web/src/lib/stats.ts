export interface Stats {
  count: number;
}

export async function loadStats(): Promise<Stats> {
  return { count: 0 };
}

import { Card } from '@mono/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { loadStats } = await import('../../lib/stats');
  const stats = await loadStats();
  return <Card title="Panel">{stats.count}</Card>;
}

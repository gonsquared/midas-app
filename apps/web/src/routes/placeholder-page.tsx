import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

/** Stand-in for screens delivered by later stories. */
export function PlaceholderPage({ title, summary }: { title: string; summary: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Coming soon">{summary}</EmptyState>
    </>
  );
}

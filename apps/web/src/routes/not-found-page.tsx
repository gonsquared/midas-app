import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/** Standard Not found page. Also used for admin routes when the user is not an admin. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-16">
      <PageHeader title="Page not found">
        That page does not exist or you cannot open it.
      </PageHeader>
      <Button asChild>
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}

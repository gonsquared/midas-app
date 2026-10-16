import { Link, Outlet } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';

/** Layout for signed-out screens: 400px column, no navigation. */
export function PublicLayout() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[400px] px-4 py-16">
      <p className="mb-8 font-display text-heading font-semibold">Midas</p>
      <Outlet />
    </main>
  );
}

export function AuthPlaceholder({ title, summary }: { title: string; summary: string }) {
  return (
    <>
      <PageHeader title={title}>{summary}</PageHeader>
      <nav aria-label="Account" className="flex flex-col gap-2 text-body-sm">
        <Link to="/login" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
        <Link to="/register" className="text-primary underline underline-offset-2">
          Create account
        </Link>
        <Link to="/forgot-password" className="text-primary underline underline-offset-2">
          Forgot password
        </Link>
      </nav>
    </>
  );
}

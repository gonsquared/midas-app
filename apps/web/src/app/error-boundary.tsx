import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Generic fallback. Shows no stack trace, message or internal path. */
export function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-[720px] flex-col items-start gap-4 px-4 py-16">
      <h1 tabIndex={-1} className="font-display text-title font-semibold text-ink">
        Something went wrong
      </h1>
      <p className="text-body text-ink-2">
        The page could not be shown. Your data is safe. Try again, or reload the page.
      </p>
      <div className="flex gap-3">
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </div>
  );
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed)
      return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

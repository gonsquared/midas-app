import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  IconButton,
  Skeleton,
  Spinner,
  useToast,
  VisuallyHidden,
} from '@/components/ui';
import { useTheme } from '@/app/theme-provider';
import { THEME_PREFERENCES } from '@/lib/theme';
import { ColorSwatches, TypeScale } from './tokens-showcase';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="font-display text-heading text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-2">
      {THEME_PREFERENCES.map((value) => (
        <Button
          key={value}
          role="radio"
          aria-checked={preference === value}
          variant={preference === value ? 'primary' : 'secondary'}
          onClick={() => setPreference(value)}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </Button>
      ))}
    </div>
  );
}

function ButtonsDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Delete</Button>
      <Button variant="link">Link style</Button>
      <Button disabled>Disabled</Button>
      <Button
        loading={loading}
        onClick={() => {
          setLoading(true);
          window.setTimeout(() => setLoading(false), 1500);
        }}
      >
        Save changes
      </Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
      <IconButton label="Add item" icon={<Plus className="size-5" />} />
    </div>
  );
}

function OverlaysDemo() {
  const { toast } = useToast();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Groceries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="tabular text-body-sm text-ink-2">320.00 of 400.00</p>
          <div className="flex gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent title="Delete this budget?" description="This cannot be undone.">
                <div className="flex justify-end gap-3">
                  <DialogClose asChild>
                    <Button variant="secondary">Keep it</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger">Delete</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="secondary"
              onClick={() => toast({ title: 'Wallet saved', variant: 'success' })}
            >
              Show toast
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card aria-busy="true">
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <p className="flex items-center gap-2 text-body-sm text-ink-2">
            <Spinner />
            <VisuallyHidden>Loading budgets</VisuallyHidden>
            <span aria-hidden="true">Loading</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Dev-only token and component gallery. Registered only when import.meta.env.DEV is true. */
export function DesignSystemPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-8 md:px-8"
    >
      <PageHeader title="Design system">
        Assay tokens and base components. This page exists in development builds only.
      </PageHeader>
      <ThemeSwitch />
      <Section title="Color tokens">
        <ColorSwatches />
      </Section>
      <Section title="Typography">
        <TypeScale />
      </Section>
      <Section title="Buttons">
        <ButtonsDemo />
      </Section>
      <Section title="Fields">
        <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
          <Field label="Wallet name" helper="Up to 60 characters." autoComplete="off" />
          <Field
            label="Email"
            type="email"
            error="Enter an email address like name@example.com."
            defaultValue="kim@"
          />
          <Field label="Archived wallet" disabled defaultValue="Old checking" />
        </div>
      </Section>
      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="success">On track</Badge>
          <Badge variant="warning">Near limit</Badge>
          <Badge variant="danger">Over</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </Section>
      <Section title="Card, dialog, toast, loading">
        <OverlaysDemo />
      </Section>
    </main>
  );
}

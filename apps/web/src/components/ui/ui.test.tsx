import { createRef, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  IconButton,
  Skeleton,
  ToastProvider,
  useToast,
} from '.';

describe('Button', () => {
  it('ignores activation while loading and exposes aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick normally and defaults to type=button', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders its child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/x">Open</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/x');
  });
});

describe('Button asChild', () => {
  it('keeps ref and onClick on the child', async () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button asChild ref={ref} onClick={onClick}>
        <a href="/x">Open</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(ref.current).toBe(link);
    await userEvent.setup().click(link);
    expect(onClick).toHaveBeenCalledOnce();
    expect(link).not.toHaveAttribute('aria-disabled');
  });

  it.each(['disabled', 'loading'] as const)(
    'sets aria-disabled and ignores activation when %s',
    async (flag) => {
      const onClick = vi.fn();
      render(
        <Button asChild onClick={onClick} {...{ [flag]: true }}>
          <a href="/x">Open</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Open' });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      await userEvent.setup().click(link);
      expect(onClick).not.toHaveBeenCalled();
    },
  );
});

describe('IconButton', () => {
  it('uses the label as the accessible name', () => {
    render(<IconButton label="Close panel" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('links label, helper and error to the input', () => {
    render(<Field label="Email" helper="We never share it." error="Enter a valid email." />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby') ?? '';
    expect(described.split(' ')).toHaveLength(2);
    expect(document.getElementById(described.split(' ')[1] ?? '')).toHaveTextContent(
      'Enter a valid email.',
    );
  });

  it('has no axe violations in the error state', async () => {
    const { container } = render(<Field label="Name" error="Required." />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Badge and Skeleton', () => {
  it('pairs status color with an icon and text', () => {
    const { container } = render(<Badge variant="warning">Near limit</Badge>);
    expect(screen.getByText('Near limit')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides skeletons from assistive technology', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Dialog', () => {
  function Demo() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent title="Delete budget?" description="This cannot be undone.">
          <Button>Confirm</Button>
        </DialogContent>
      </Dialog>
    );
  }

  it('is named by its title, closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Delete budget?' });
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the opener when it has no trigger (opened from state or a route)', async () => {
    // E10-F2-S3 (A11Y-01): non-modal Radix only restores focus to a <Dialog.Trigger>.
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <main>
          <h1 tabIndex={-1}>Page</h1>
          <Button onClick={() => setOpen(true)}>Open from state</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent title="Controlled">
              <Button>Inside</Button>
            </DialogContent>
          </Dialog>
        </main>
      );
    }
    const user = userEvent.setup();
    render(<Controlled />);
    const opener = screen.getByRole('button', { name: 'Open from state' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Controlled' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('Dialog makes the background inert', () => {
  function Stack() {
    return (
      <>
        <header>
          <nav aria-label="Main">nav</nav>
        </header>
        <main>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open first</Button>
            </DialogTrigger>
            <DialogContent title="First">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Open second</Button>
                </DialogTrigger>
                <DialogContent title="Second" role="alertdialog">
                  <Button>Inside second</Button>
                </DialogContent>
              </Dialog>
            </DialogContent>
          </Dialog>
        </main>
      </>
    );
  }

  const appRoot = () => screen.getByRole('main').closest('body > *') as HTMLElement;

  it('inerts the app root while open, keeps the dialog live, and restores it on close', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    const root = appRoot();
    expect(root).not.toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    const dialog = await screen.findByRole('dialog', { name: 'First' });
    expect(root).toHaveAttribute('inert');
    expect(dialog.closest('body > *')).not.toHaveAttribute('inert');
    // Browsers drop inert content from the accessibility tree and tab order (jsdom does not
    // model that, so assert the attribute on the landmarks' ancestor).
    expect(screen.getByLabelText('Main').closest('[inert]')).toBe(root);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(root).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('Main').closest('[inert]')).toBeNull();
  });

  it('holds the background until the last of several stacked dialogs closes', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    const root = appRoot();
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    const first = await screen.findByRole('dialog', { name: 'First' });
    const firstRoot = first.closest('body > *') as HTMLElement;
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    await screen.findByRole('alertdialog', { name: 'Second' });
    expect(root).toHaveAttribute('inert');
    expect(firstRoot).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(firstRoot).not.toHaveAttribute('inert');
    expect(root).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(root).not.toHaveAttribute('inert');
  });

  it('restores the background when the open dialog unmounts', async () => {
    const user = userEvent.setup();
    const view = render(<Stack />);
    const root = appRoot();
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await screen.findByRole('dialog', { name: 'First' });
    expect(root).toHaveAttribute('inert');
    view.unmount();
    expect(document.body.querySelector('[inert]')).toBeNull();
  });
});

describe('Toast', () => {
  function Trigger({ count }: { count: number }) {
    const { toast } = useToast();
    return (
      <button
        onClick={() => {
          for (let i = 1; i <= count; i += 1) toast({ title: `Toast ${i}` });
          toast({ title: 'It failed', variant: 'danger' });
        }}
      >
        fire
      </button>
    );
  }

  it('shows at most three toasts, newest last, and announces them', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger count={3} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('fire'));
    expect(await screen.findByText('It failed')).toBeInTheDocument();
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(3);
  });
});

describe('Dialog and the strict style-src CSP', () => {
  function Demo() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent title="Hello">
          <Button>Inside</Button>
        </DialogContent>
      </Dialog>
    );
  }

  it('never creates a <style> element, locks scroll with a body class and unlocks on close', async () => {
    const created: string[] = [];
    const original = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      created.push(tag.toLowerCase());
      return original(tag, options);
    }) as typeof document.createElement);
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.head, { childList: true, subtree: true });

    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hello' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body).toHaveClass('scroll-locked');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).not.toHaveClass('scroll-locked');

    const addedStyles = observer
      .takeRecords()
      .flatMap((record) => [...record.addedNodes])
      .filter((node) => node.nodeName === 'STYLE');
    observer.disconnect();
    spy.mockRestore();
    expect(created).not.toContain('style');
    expect(addedStyles).toHaveLength(0);
    expect(document.querySelector('style')).toBeNull();
  });

  it('closes when the scrim is pressed', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('dialog-scrim'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

import * as RadixToast from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'info' | 'success' | 'danger';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Optional action such as Undo or View. Selecting it dismisses the toast. */
  action?: { label: string; onSelect: () => void };
  /** Milliseconds before auto-dismiss (default 6000). Hover and focus pause it. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** The stack never exceeds three toasts; the oldest is dropped first. */
export const MAX_TOASTS = 3;

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-info',
  success: 'border-success',
  danger: 'border-danger',
};

const variantIcons: Record<ToastVariant, ReactNode> = {
  info: <Info aria-hidden="true" className="size-5 shrink-0 text-info" />,
  success: <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />,
  danger: <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-danger" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const item: ToastItem = { ...input, id: nextId.current };
    setItems((current) => [...current, item].slice(-MAX_TOASTS));
  }, []);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" duration={6000} label="Notifications">
        {children}
        {items.map((item) => {
          const variant = item.variant ?? 'info';
          return (
            <RadixToast.Root
              key={item.id}
              // Failures interrupt (role=alert); information is polite (role=status).
              type={variant === 'danger' ? 'foreground' : 'background'}
              {...(item.duration ? { duration: item.duration } : {})}
              onOpenChange={(open) => {
                if (!open) remove(item.id);
              }}
              className={cn(
                'flex animate-toast-in items-start gap-3 rounded-md border-l-4 border-y border-r',
                'border-y-line border-r-line bg-raised p-3 text-ink shadow-popover',
                variantStyles[variant],
              )}
            >
              {variantIcons[variant]}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <RadixToast.Title className="text-body-sm font-semibold">
                  {item.title}
                </RadixToast.Title>
                {item.description ? (
                  <RadixToast.Description className="text-body-sm text-ink-2">
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              {item.action ? (
                <RadixToast.Action altText={item.action.label} asChild>
                  <button
                    type="button"
                    onClick={item.action.onSelect}
                    className="inline-flex h-8 shrink-0 items-center rounded-sm border border-line-strong px-3 text-body-sm font-medium hover:bg-sunken"
                  >
                    {item.action.label}
                  </button>
                </RadixToast.Action>
              ) : null}
              <RadixToast.Close
                aria-label="Dismiss notification"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-sunken"
              >
                <X aria-hidden="true" className="size-4" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport
          className={cn(
            'fixed right-0 bottom-0 z-70 m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none',
            'max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
          )}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

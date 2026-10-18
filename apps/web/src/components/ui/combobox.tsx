import { ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '@/lib/cn';
import { useAnnounce } from './announcer';
import { Button } from './button';
import { controlBorder, controlClass } from './form-field';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Right-aligned secondary text (for example a wallet balance). */
  secondary?: ReactNode;
  /** Leading decoration (a category chip). Always aria-hidden here. */
  leading?: ReactNode;
  group?: string;
  disabled?: boolean;
  /** Extra text matched by search but never displayed. */
  keywords?: string;
}

export interface ComboboxProps {
  /** Id of the text input; pair with a visible label (FieldFrame supplies it). */
  id: string;
  options: readonly ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Message and retry for a failed load, shown inside the popup. */
  loadError?: string;
  onRetry?: () => void;
  emptyText?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: true | undefined;
  /** Text shown for the committed value when it is not in `options` (for example a retired item). */
  fallbackLabel?: string;
  /** Called on Enter when the list is closed (lets a form submit from the field). */
  onEnterWhenClosed?: () => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * ARIA 1.2 combobox with a list popup (ui-design 18.3.8). Focus never leaves the input; the
 * highlighted option is exposed through aria-activedescendant. Committed value only: on blur
 * without a commit the text reverts. The popup is a non-modal popover (CSP-safe).
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  invalid = false,
  disabled = false,
  loading = false,
  loadError,
  onRetry,
  emptyText = 'No matches.',
  fallbackLabel,
  onEnterWhenClosed,
  className,
  ref,
  ...aria
}: ComboboxProps) {
  const listboxId = useId();
  const announce = useAnnounce();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const selected = options.find((option) => option.value === value);
  const committedLabel = selected?.label ?? (value ? (fallbackLabel ?? '') : '');
  const text = query ?? committedLabel;

  const visible = useMemo(() => {
    const needle = normalize((query ?? '').trim());
    if (!needle) return options;
    return options.filter((option) =>
      normalize(`${option.label} ${option.keywords ?? ''}`).includes(needle),
    );
  }, [options, query]);

  // Announce the result count once typing pauses.
  useEffect(() => {
    if (!open || query === null) return undefined;
    const timer = window.setTimeout(() => {
      announce(visible.length === 0 ? `No results for ${query}` : `${visible.length} results`);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [announce, open, query, visible.length]);

  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const activeOption = active >= 0 ? visible[active] : undefined;

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listboxId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listboxId]);

  const close = (revert: boolean) => {
    setOpen(false);
    setActive(-1);
    if (revert) setQuery(null);
  };

  const commit = (option: ComboboxOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const move = (direction: 1 | -1, from = active) => {
    let next = from;
    for (let step = 0; step < visible.length; step += 1) {
      next += direction;
      if (next < 0 || next >= visible.length) return;
      if (!visible[next]?.disabled) {
        setActive(next);
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          if (!event.altKey) move(1, -1);
        } else if (!event.altKey) {
          move(1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          move(-1, visible.length);
        } else {
          move(-1);
        }
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          move(1, -1);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          move(-1, visible.length);
        }
        break;
      case 'Enter':
        if (open && activeOption) {
          event.preventDefault();
          commit(activeOption);
        } else if (!open) {
          if (onEnterWhenClosed) {
            event.preventDefault();
            onEnterWhenClosed();
          }
        } else {
          event.preventDefault();
        }
        break;
      case 'Escape':
        if (open) {
          // Close the list only; never let Escape also close the surrounding dialog.
          event.preventDefault();
          event.stopPropagation();
          close(false);
        } else if (query !== null) {
          event.preventDefault();
          event.stopPropagation();
          setQuery(null);
        }
        break;
      case 'Tab':
        close(true);
        break;
      default:
        break;
    }
  };

  const groups = useMemo(() => {
    const result: Array<{
      name: string | null;
      items: Array<{ option: ComboboxOption; index: number }>;
    }> = [];
    visible.forEach((option, index) => {
      const name = option.group ?? null;
      let group = result.find((candidate) => candidate.name === name);
      if (!group) {
        group = { name, items: [] };
        result.push(group);
      }
      group.items.push({ option, index });
    });
    return result;
  }, [visible]);

  const leading = selected?.leading && query === null ? selected.leading : null;

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => (next ? setOpen(true) : close(false))}
    >
      <PopoverAnchor asChild>
        <div ref={wrapperRef} className={cn('relative', className)}>
          {leading ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
            >
              {leading}
            </span>
          ) : null}
          <input
            ref={ref}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-busy={loading || undefined}
            disabled={disabled}
            placeholder={placeholder}
            value={text}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onClick={() => {
              if (!disabled) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => close(true)}
            className={cn(
              controlClass,
              controlBorder(invalid),
              'h-10 pr-9 pointer-coarse:h-11',
              leading ? 'pl-12' : '',
            )}
            {...aria}
          />
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="max-h-[min(20rem,40dvh)] w-(--radix-popover-trigger-width) overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (wrapperRef.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <div
          id={listboxId}
          role="listbox"
          aria-label="Options"
          aria-busy={loading || undefined}
          // Keep focus in the input when the pointer presses an option.
          onMouseDown={(event) => event.preventDefault()}
        >
          {loading ? <p className="px-3 py-2 text-body-sm text-ink-3">Loading...</p> : null}
          {loadError ? (
            <div className="flex flex-col items-start gap-2 px-3 py-2 text-body-sm text-ink-2">
              <p>{loadError}</p>
              {onRetry ? (
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          {!loading && !loadError && visible.length === 0 ? (
            <p className="px-3 py-2 text-body-sm text-ink-3">
              {query ? `${emptyText} Nothing matches "${query}".` : emptyText}
            </p>
          ) : null}
          {loadError
            ? null
            : groups.map((group, groupIndex) => {
                const headingId = `${listboxId}-group-${groupIndex}`;
                const items = group.items.map(({ option, index }) => (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    data-active={index === active || undefined}
                    onMouseEnter={() => {
                      if (!option.disabled) setActive(index);
                    }}
                    onClick={() => commit(option)}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 text-body-sm pointer-coarse:min-h-11',
                      'data-[active]:bg-sunken aria-selected:font-semibold',
                      option.disabled && 'cursor-not-allowed text-ink-3',
                    )}
                  >
                    {option.leading ? <span aria-hidden="true">{option.leading}</span> : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.secondary ? (
                      <span className="shrink-0 text-ink-2 tabular">{option.secondary}</span>
                    ) : null}
                    {option.value === value ? <span aria-hidden="true">&#10003;</span> : null}
                  </div>
                ));
                return group.name ? (
                  <div key={group.name} role="group" aria-labelledby={headingId}>
                    <div
                      id={headingId}
                      role="presentation"
                      className="px-2 pt-2 pb-1 text-caption font-medium text-ink-3"
                    >
                      {group.name}
                    </div>
                    {items}
                  </div>
                ) : (
                  <div key="ungrouped">{items}</div>
                );
              })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

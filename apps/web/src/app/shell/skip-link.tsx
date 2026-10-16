export const MAIN_ID = 'main-content';

/** First focusable element. Moves focus to main (hash links alone would fight the router). */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-80 focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-body-sm focus:font-medium focus:text-ink focus:shadow-popover"
    >
      Skip to main content
    </a>
  );
}

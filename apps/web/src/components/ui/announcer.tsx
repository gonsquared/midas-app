import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Politeness = 'polite' | 'assertive';
type Announce = (message: string, politeness?: Politeness) => void;

const AnnouncerContext = createContext<Announce>(() => undefined);

interface Message {
  text: string;
  tick: number;
}

/**
 * One app-level live region pair (ui-design 18.0.1). Regions stay mounted so messages are not
 * dropped; repeating the same sentence still announces because a hidden marker alternates.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState<Message>({ text: '', tick: 0 });
  const [assertive, setAssertive] = useState<Message>({ text: '', tick: 0 });

  const announce = useCallback<Announce>((message, politeness = 'polite') => {
    const update = (previous: Message): Message => ({ text: message, tick: previous.tick + 1 });
    if (politeness === 'assertive') setAssertive(update);
    else setPolite(update);
  }, []);

  const value = useMemo(() => announce, [announce]);
  const marker = (message: Message) => (message.tick % 2 === 0 ? '​' : '');

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {polite.text}
        {polite.text ? marker(polite) : ''}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive.text}
        {assertive.text ? marker(assertive) : ''}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}

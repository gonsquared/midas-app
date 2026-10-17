const CHANNEL_NAME = 'midas-session';
const SIGNED_OUT = 'signed-out';

const hasChannel = (): boolean => typeof BroadcastChannel === 'function';

/** Tells the other tabs of this browser that the user signed out (no data crosses the channel). */
export function broadcastSignOut(): void {
  if (!hasChannel()) return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: SIGNED_OUT });
    channel.close();
  } catch {
    // Cross-tab sync is a nicety; signing out here already worked.
  }
}

/** Calls `onSignOut` when another tab signs out. Returns the cleanup. */
export function listenForSignOut(onSignOut: () => void): () => void {
  if (!hasChannel()) return () => undefined;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown } | null;
    if (data && typeof data === 'object' && data.type === SIGNED_OUT) onSignOut();
  };
  return () => channel.close();
}

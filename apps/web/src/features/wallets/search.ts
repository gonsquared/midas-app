export interface WalletsSearch {
  /** `1` shows the archived section. Unknown values are ignored. */
  archived?: 1;
}

export function parseWalletsSearch(raw: Record<string, unknown>): WalletsSearch {
  const value = raw['archived'];
  return value === 1 || value === '1' || value === true ? { archived: 1 } : {};
}

import { z } from 'zod';

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** ISO timestamp restricted to years 1900-2100, so a forged cursor cannot reach odd date ranges. */
export const boundedTimestamp = z.iso.datetime().refine((value) => {
  const year = new Date(value).getUTCFullYear();
  return year >= MIN_YEAR && year <= MAX_YEAR;
});

/** Calendar date (YYYY-MM-DD) restricted to the same year range. */
export const isBoundedDate = (value: string): boolean => {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
};

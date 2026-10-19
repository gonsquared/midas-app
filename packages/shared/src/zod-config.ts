import { z } from 'zod';

/**
 * Zod 4 probes `new Function` once to pick its JIT path; under a strict CSP that raises a
 * violation report. Importing this module (first, before any schema parses) turns JIT off so the
 * probe never runs. Web-only: the API keeps the default.
 */
z.config({ jitless: true });

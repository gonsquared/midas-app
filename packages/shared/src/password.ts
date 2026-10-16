import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_SCORE = 3;

let checker: ZxcvbnFactory | undefined;

function getChecker(): ZxcvbnFactory {
  checker ??= new ZxcvbnFactory({
    translations: zxcvbnEn.translations,
    graphs: zxcvbnCommon.adjacencyGraphs,
    dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
  });
  return checker;
}

/** zxcvbn score 0..4. `userInputs` (email, name) are penalised as guessable. */
export function passwordScore(password: string, userInputs: string[] = []): number {
  // zxcvbn is O(n^2) in length; the schema caps length before this is called.
  return getChecker().check(password.slice(0, PASSWORD_MAX_LENGTH), userInputs).score;
}

export function isPasswordStrong(password: string, userInputs: string[] = []): boolean {
  return passwordScore(password, userInputs) >= PASSWORD_MIN_SCORE;
}

import { renderTemplate, type Locale } from '@firstcar/core';

import { en, type MessageKey } from './en';
import { fi } from './fi';

const DICTS: Record<Locale, Record<MessageKey, string>> = { en, fi };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function makeT(locale: Locale): Translate {
  const dict = DICTS[locale];
  return (key, params) => renderTemplate(dict[key], params ?? {});
}

export type { MessageKey };

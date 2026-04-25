import crypto from 'crypto';
import { Suggestion } from '../../types';

export const createEntityId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

export const normalizeCaptureInterval = (value: number | undefined) => {
  if (!value || Number.isNaN(value)) {
    return 8;
  }

  return Math.max(5, Math.min(30, Math.round(value)));
};

export const normalizeSqlLimit = (value: number | undefined, fallback: number, max: number) => {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
};

export const parseNumericValue = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const toISOString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const parseSuggestionsJson = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Suggestion[]) : [];
  } catch {
    return [];
  }
};

export const readSingleRouteParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

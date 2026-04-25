import { Response } from 'express';

export interface ApiErrorPayload {
  success?: boolean;
  code: string;
  message: string;
  details?: string;
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: string;

  constructor(status: number, code: string, message: string, details?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const parseErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
};

export const sendApiError = (res: Response, status: number, payload: ApiErrorPayload) =>
  res.status(status).json({
    success: false,
    ...payload,
  });

export const isDuplicateEntryError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { code?: string; errno?: number };
  return record.code === 'ER_DUP_ENTRY' || record.errno === 1062;
};

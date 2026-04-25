import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../../types';
import { UserRow } from './mysql';
import { SESSION_TTL_MS } from './constants';
import { sendApiError } from './errors';

interface TokenPayload {
  accountId: string;
  nickname: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  token?: string;
}

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const encodeBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

export const createSessionToken = (user: AuthUser) => {
  const payload: TokenPayload = {
    accountId: user.accountId,
    nickname: user.nickname,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const verifySessionToken = (token: string): AuthUser | null => {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<TokenPayload>;

    if (
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now() ||
      typeof parsed.accountId !== 'string' ||
      typeof parsed.nickname !== 'string'
    ) {
      return null;
    }

    return {
      accountId: parsed.accountId,
      nickname: parsed.nickname,
      avatar: null,
    };
  } catch {
    return null;
  }
};

const readTokenFromRequest = (req: Request) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
};

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = readTokenFromRequest(req);

  if (!token) {
    return sendApiError(res, 401, {
      code: 'AUTH_REQUIRED',
      message: '缺少登录凭证，请重新登录后再试',
    });
  }

  const user = verifySessionToken(token);

  if (!user) {
    return sendApiError(res, 401, {
      code: 'SESSION_INVALID',
      message: '登录状态已失效，请重新登录',
    });
  }

  req.user = user;
  req.token = token;
  next();
};

export const buildSessionUser = (user: Pick<UserRow, 'account_id' | 'nickname' | 'avatar'>): AuthUser => ({
  accountId: user.account_id,
  nickname: user.nickname,
  avatar: user.avatar,
});

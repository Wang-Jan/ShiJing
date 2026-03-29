import 'dotenv/config';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import * as path from 'path';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { Pool } from 'mysql2/promise';
import { analyzeDesktopImage } from './src/services/gardenService';
import { createMySqlPool, getMySqlConfig, UserRow } from './src/server/mysql';
import { AuthUser } from './types';

interface TokenPayload {
  accountId: string;
  nickname: string;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  token?: string;
}

const PORT = 3000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const encodeBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const createSessionToken = (user: AuthUser) => {
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

const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = readTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: '缺少登录凭证' });
  }

  const user = verifySessionToken(token);

  if (!user) {
    return res.status(401).json({ message: '登录状态已失效，请重新登录' });
  }

  req.user = user;
  req.token = token;
  next();
};

const parseErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
};

const isDuplicateEntryError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { code?: string; errno?: number };
  return record.code === 'ER_DUP_ENTRY' || record.errno === 1062;
};

const buildSessionUser = (user: Pick<UserRow, 'account_id' | 'nickname' | 'avatar'>): AuthUser => ({
  accountId: user.account_id,
  nickname: user.nickname,
  avatar: user.avatar,
});

const getUserByAccountId = async (pool: Pool, accountId: string) => {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT id, account_id, nickname, password, avatar FROM users WHERE account_id = ? LIMIT 1',
    [accountId]
  );

  return rows[0] || null;
};

const registerRoutes = (app: express.Express, pool: Pool) => {
  app.post('/api/register', async (req: Request, res: Response) => {
    const { nickname, password, avatar } = req.body as {
      nickname?: string;
      password?: string;
      avatar?: string | null;
    };
    const normalizedNickname = nickname?.trim();

    if (!normalizedNickname || !password) {
      return res.status(400).json({ message: '昵称和密码是必填项' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: '密码长度至少为 6 位' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const accountId = Math.floor(1000000 + Math.random() * 9000000).toString();

      try {
        await pool.execute(
          'INSERT INTO users (account_id, nickname, password, avatar) VALUES (?, ?, ?, ?)',
          [accountId, normalizedNickname, hashedPassword, avatar ?? null]
        );
        return res.json({ success: true, accountId, nickname: normalizedNickname });
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          continue;
        }

        console.error('注册失败:', parseErrorMessage(error));
        return res.status(500).json({ message: '注册失败，请检查 MySQL 配置或稍后重试' });
      }
    }

    return res.status(500).json({ message: '注册失败，请稍后重试' });
  });

  app.post('/api/login', async (req: Request, res: Response) => {
    const { accountId, password } = req.body as { accountId?: string; password?: string };
    const normalizedAccountId = accountId?.trim();

    if (!normalizedAccountId || !password) {
      return res.status(400).json({ message: '账号和密码是必填项' });
    }

    try {
      const user = await getUserByAccountId(pool, normalizedAccountId);

      if (!user) {
        return res.status(401).json({ message: '账号不存在' });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({ message: '密码错误' });
      }

      const sessionUser = buildSessionUser(user);
      const token = createSessionToken(sessionUser);

      return res.json({
        success: true,
        token,
        user: sessionUser,
      });
    } catch (error) {
      console.error('登录失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '登录失败，请检查 MySQL 服务是否已启动' });
    }
  });

  app.get('/api/session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    try {
      const user = await getUserByAccountId(pool, req.user.accountId);

      if (!user) {
        return res.status(404).json({ message: '账号不存在' });
      }

      return res.json({
        success: true,
        user: buildSessionUser(user),
      });
    } catch (error) {
      console.error('会话恢复失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '会话校验失败，请重新登录' });
    }
  });

  app.patch('/api/account/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { nickname, avatar } = req.body as { nickname?: string; avatar?: string | null };
    const normalizedNickname = nickname?.trim();

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!normalizedNickname) {
      return res.status(400).json({ message: '昵称不能为空' });
    }

    try {
      await pool.execute('UPDATE users SET nickname = ?, avatar = ? WHERE account_id = ?', [
        normalizedNickname,
        avatar ?? null,
        req.user.accountId,
      ]);

      const updatedUser: AuthUser = {
        accountId: req.user.accountId,
        nickname: normalizedNickname,
        avatar: avatar ?? null,
      };
      const token = createSessionToken(updatedUser);

      return res.json({
        success: true,
        user: updatedUser,
        token,
      });
    } catch (error) {
      console.error('更新个人资料失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '更新个人资料失败，请稍后重试' });
    }
  });

  app.patch('/api/account/password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '当前密码和新密码都是必填项' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: '新密码长度至少为 6 位' });
    }

    try {
      const user = await getUserByAccountId(pool, req.user.accountId);

      if (!user) {
        return res.status(404).json({ message: '账号不存在' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(401).json({ message: '当前密码不正确' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.execute('UPDATE users SET password = ? WHERE account_id = ?', [hashedPassword, req.user.accountId]);

      return res.json({ success: true });
    } catch (error) {
      console.error('修改密码失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '修改密码失败，请稍后重试' });
    }
  });

  app.post('/api/analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { image } = req.body as { image?: string };
    const headerApiKey = req.headers['x-garden-api-key'];
    const headerBaseUrl = req.headers['x-garden-base-url'];
    const apiKey = typeof headerApiKey === 'string' && headerApiKey.trim()
      ? headerApiKey.trim()
      : process.env.GARDEN_API_KEY;
    const baseUrl = typeof headerBaseUrl === 'string' && headerBaseUrl.trim()
      ? headerBaseUrl.trim()
      : process.env.GARDEN_API_BASE_URL;

    if (!apiKey) {
      return res.status(500).json({ message: '服务器未配置 GARDEN_API_KEY' });
    }

    if (!baseUrl) {
      return res.status(500).json({ message: '服务器未配置 GARDEN_API_BASE_URL' });
    }

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ message: '缺少图片数据' });
    }

    try {
      const result = await analyzeDesktopImage(image, apiKey, baseUrl);
      return res.json({ success: true, result });
    } catch (error) {
      console.error('桌面分析失败:', parseErrorMessage(error));
      return res.status(502).json({ message: 'Garden 分析失败，请稍后重试' });
    }
  });

  app.get('/api/test-garden', async (req, res) => {
    try {
      const testUrl = process.env.GARDEN_API_BASE_URL + '/v1/models';
      console.log('正在测试访问:', testUrl);
      
      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.GARDEN_API_KEY}`
        }
      });
      
      const data = await response.json();
      console.log('测试成功:', data);
      res.json({ success: true, data });
    } catch (error) {
      console.error('测试失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
};

async function startServer() {
  console.log('正在启动服务...');
  const mySqlConfig = getMySqlConfig();
  console.log(`MySQL 连接: ${mySqlConfig.user}@${mySqlConfig.host}:${mySqlConfig.port}/${mySqlConfig.database}`);
  const pool = await createMySqlPool();
  console.log('MySQL 数据库已连接，users 表已准备就绪');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  registerRoutes(app, pool);

  if (process.env.NODE_ENV !== 'production') {
    console.log('正在开发模式下启动 Vite...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('正在生产模式下启动...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务运行在 http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('服务启动失败:', err);
});

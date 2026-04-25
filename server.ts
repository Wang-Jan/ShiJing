import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { Pool } from 'mysql2/promise';
import * as path from 'path';
import {
  createMySqlPool,
  getMySqlConfig,
  MonitorEventRow,
} from './src/server/mysql';
import { AuthenticatedRequest, buildSessionUser, createSessionToken, requireAuth } from './src/server/auth';
import { DEFAULT_USER_PREFERENCES, PORT } from './src/server/constants';
import { ApiRequestError, isDuplicateEntryError, parseErrorMessage, sendApiError } from './src/server/errors';
import {
  formatMonitorEvent,
  formatMonitorSession,
  normalizeBooleanPreference,
  normalizeTaskPriority,
  normalizeTaskStatus,
  normalizeThemePreference,
} from './src/server/formatters';
import {
  createEntityId,
  normalizeCaptureInterval,
  parseNumericValue,
  readSingleRouteParam,
} from './src/server/utils';
import { buildHealthPayload, runGardenAnalysis } from './src/server/services/gardenAnalysisService';
import {
  buildMonitorEventMeta,
  getRiskLevel,
  shouldCreateCleaningTask,
  shouldSaveSnapshot,
} from './src/server/monitorRules';
import { getUserByAccountId } from './src/server/repositories/userRepository';
import {
  attachTaskToAnalysisRecord,
  createAnalysisRecord,
  deleteAnalysisRecordsByUser,
  getAnalysisRecordsByUser,
  getAnalysisStatsByUser,
} from './src/server/repositories/analysisRepository';
import { createActivityLog, deleteActivityLogsByUser, getActivityLogsByUser } from './src/server/repositories/activityRepository';
import {
  deleteNotificationsByUser,
  getNotificationsByUser,
  getNotificationSummaryByUser,
  markNotificationsAsRead,
} from './src/server/repositories/notificationRepository';
import { normalizeDeleteIds } from './src/server/repositories/deleteHelpers';
import {
  getUserPreferencesByAccountId,
  upsertUserPreferences,
} from './src/server/repositories/preferencesRepository';
import { getDashboardStatsByUser } from './src/server/repositories/dashboardRepository';
import {
  createCleaningTask,
  createCleaningTaskFromAnalysis,
  createTaskVerification,
  deleteCleaningTasksByUser,
  getCleaningTaskById,
  getCleaningTasksByUser,
  getCleaningTaskWithVerificationById,
} from './src/server/repositories/taskRepository';
import {
  getLatestMonitorSessionByUser,
  getMonitorSessionById,
  getMonitorSessionsByUser,
  getRecentMonitorEvents,
  deleteMonitorSessionsByUser,
} from './src/server/repositories/monitorRepository';
import {
  ActivityLogLevel,
  AnalysisRecord,
  AuthUser,
  CleaningTask,
  CleaningTaskPriority,
  CleaningTaskSourceType,
  CleaningTaskStatus,
  MonitorFrameAnalysis,
  Suggestion,
  ThemePreference,
  UserPreferences,
} from './types';

interface MonitorStartRequest {
  deviceName?: string;
  cameraLabel?: string;
  captureIntervalSeconds?: number;
}

interface MonitorFrameRequest {
  sessionId?: string;
  image?: string;
}

interface CleaningTaskCreateRequest {
  title?: string;
  description?: string;
  priority?: CleaningTaskPriority;
  sourceType?: CleaningTaskSourceType;
  sourceId?: string;
  score?: number;
  imageUrl?: string;
  suggestions?: Suggestion[];
}

interface CleaningTaskStatusRequest {
  status?: CleaningTaskStatus;
}

interface CleaningTaskVerifyRequest {
  image?: string;
}

interface PreferencesUpdateRequest {
  themePreference?: ThemePreference;
  defaultMonitorIntervalSeconds?: number;
  autoCreateTaskEnabled?: boolean;
  notificationEnabled?: boolean;
  highRiskAlertEnabled?: boolean;
}

interface RecordDeleteRequest {
  ids?: unknown;
  all?: unknown;
}

const readRecordDeleteRequest = (body: RecordDeleteRequest = {}) => ({
  all: body.all === true,
  ids: normalizeDeleteIds(body.ids),
});

const validateRecordDeleteRequest = (request: ReturnType<typeof readRecordDeleteRequest>) => {
  if (!request.all && request.ids.length === 0) {
    return '请选择要删除的记录，或确认删除全部记录';
  }

  return null;
};

const attachRequestId = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Request-Id', createEntityId('req'));
  next();
};

const handleJsonParseError = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!error) {
    next();
    return;
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  const status = (error as { status?: number }).status === 413 ? 413 : 400;

  sendApiError(res, status, {
    code: status === 413 ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_JSON',
    message: status === 413 ? '请求内容过大，请压缩图片后重试' : '请求体格式不正确，请检查 JSON 数据',
    details: parseErrorMessage(error),
  });
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
        await pool.execute('INSERT INTO users (account_id, nickname, password, avatar) VALUES (?, ?, ?, ?)', [
          accountId,
          normalizedNickname,
          hashedPassword,
          avatar ?? null,
        ]);

        return res.json({ success: true, accountId, nickname: normalizedNickname });
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          continue;
        }

        console.error('注册失败:', parseErrorMessage(error));
        return res.status(500).json({ message: '注册失败，请稍后重试' });
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
      return res.status(500).json({ message: '登录失败，请检查数据库连接' });
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

      await createActivityLog(pool, {
        accountId: req.user.accountId,
        kind: 'account',
        level: 'success',
        title: '个人资料已更新',
        description: `昵称已更新为 ${normalizedNickname}`,
        relatedType: 'profile',
        relatedId: req.user.accountId,
      });

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

      await createActivityLog(pool, {
        accountId: req.user.accountId,
        kind: 'account',
        level: 'success',
        title: '账号密码已修改',
        description: '账号安全设置已更新，可以继续使用当前账户登录',
        relatedType: 'password',
        relatedId: req.user.accountId,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('修改密码失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '修改密码失败，请稍后重试' });
    }
  });

  app.get('/api/health', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payload = await buildHealthPayload(pool, req);
      return res.json(payload);
    } catch (error) {
      console.error('读取系统健康状态失败:', parseErrorMessage(error));
      return sendApiError(res, 500, {
        code: 'HEALTH_CHECK_FAILED',
        message: '读取系统健康状态失败，请稍后重试',
        details: parseErrorMessage(error),
      });
    }
  });

  app.get('/api/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    try {
      const preferences = await getUserPreferencesByAccountId(pool, req.user.accountId);
      return res.json({ success: true, preferences });
    } catch (error) {
      console.error('读取用户偏好失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取用户偏好失败，请稍后重试' });
    }
  });

  app.patch('/api/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const body = req.body as PreferencesUpdateRequest;

    try {
      const currentPreferences = await getUserPreferencesByAccountId(pool, req.user.accountId);
      const nextPreferences: UserPreferences = {
        themePreference: normalizeThemePreference(body.themePreference ?? currentPreferences.themePreference),
        defaultMonitorIntervalSeconds: normalizeCaptureInterval(
          body.defaultMonitorIntervalSeconds ?? currentPreferences.defaultMonitorIntervalSeconds
        ),
        autoCreateTaskEnabled: normalizeBooleanPreference(
          body.autoCreateTaskEnabled,
          currentPreferences.autoCreateTaskEnabled
        ),
        notificationEnabled: normalizeBooleanPreference(body.notificationEnabled, currentPreferences.notificationEnabled),
        highRiskAlertEnabled: normalizeBooleanPreference(
          body.highRiskAlertEnabled,
          currentPreferences.highRiskAlertEnabled
        ),
      };

      const preferences = await upsertUserPreferences(pool, req.user.accountId, nextPreferences);

      await createActivityLog(pool, {
        accountId: req.user.accountId,
        kind: 'account',
        level: 'success',
        title: '使用偏好已更新',
        description: `监控默认频率已设置为每 ${preferences.defaultMonitorIntervalSeconds} 秒分析一次`,
        relatedType: 'preferences',
        relatedId: req.user.accountId,
      });

      return res.json({ success: true, preferences });
    } catch (error) {
      console.error('更新用户偏好失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '更新用户偏好失败，请稍后重试' });
    }
  });

  app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
    const limit = Math.max(1, Math.min(120, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 40));
    const unreadOnly = req.query.status === 'unread';

    try {
      const [notifications, summary] = await Promise.all([
        getNotificationsByUser(pool, req.user.accountId, { limit, unreadOnly }),
        getNotificationSummaryByUser(pool, req.user.accountId),
      ]);

      return res.json({
        success: true,
        notifications,
        unreadCount: summary.unreadCount,
      });
    } catch (error) {
      console.error('读取通知失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取通知失败，请稍后重试' });
    }
  });

  app.patch('/api/notifications/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const { ids } = req.body as { ids?: string[] };

    try {
      await markNotificationsAsRead(pool, req.user.accountId, Array.isArray(ids) ? ids : undefined);
      const summary = await getNotificationSummaryByUser(pool, req.user.accountId);

      return res.json({
        success: true,
        unreadCount: summary.unreadCount,
      });
    } catch (error) {
      console.error('标记通知已读失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '标记通知已读失败，请稍后重试' });
    }
  });

  app.delete('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const deleteRequest = readRecordDeleteRequest(req.body as RecordDeleteRequest);
    const validationMessage = validateRecordDeleteRequest(deleteRequest);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    try {
      const deletedCount = await deleteNotificationsByUser(
        pool,
        req.user.accountId,
        deleteRequest.all ? undefined : deleteRequest.ids
      );
      const summary = await getNotificationSummaryByUser(pool, req.user.accountId);

      return res.json({
        success: true,
        deletedCount,
        unreadCount: summary.unreadCount,
      });
    } catch (error) {
      console.error('删除通知失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '删除通知失败，请稍后重试' });
    }
  });

  app.get('/api/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    try {
      const [stats, activities] = await Promise.all([
        getDashboardStatsByUser(pool, req.user.accountId),
        getActivityLogsByUser(pool, req.user.accountId, 8),
      ]);

      return res.json({
        success: true,
        stats,
        activities,
      });
    } catch (error) {
      console.error('读取首页驾驶舱数据失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取首页驾驶舱数据失败，请稍后重试' });
    }
  });

  app.get('/api/activities', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
    const limit = Math.max(1, Math.min(120, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 40));

    try {
      const activities = await getActivityLogsByUser(pool, req.user.accountId, limit);
      return res.json({ success: true, activities });
    } catch (error) {
      console.error('读取动态记录失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取动态记录失败，请稍后重试' });
    }
  });

  app.delete('/api/activities', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const deleteRequest = readRecordDeleteRequest(req.body as RecordDeleteRequest);
    const validationMessage = validateRecordDeleteRequest(deleteRequest);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    try {
      const deletedCount = await deleteActivityLogsByUser(
        pool,
        req.user.accountId,
        deleteRequest.all ? undefined : deleteRequest.ids
      );

      return res.json({ success: true, deletedCount });
    } catch (error) {
      console.error('删除动态记录失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '删除动态记录失败，请稍后重试' });
    }
  });

  app.get('/api/tasks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const status = typeof req.query.status === 'string' ? normalizeTaskStatus(req.query.status) : null;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 80;
    const limit = Math.max(1, Math.min(120, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 80));

    try {
      const tasks = await getCleaningTasksByUser(pool, req.user.accountId, status, limit);
      return res.json({ success: true, tasks });
    } catch (error) {
      console.error('读取清洁任务失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取清洁任务失败，请稍后重试' });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, priority, sourceType, sourceId, score, imageUrl, suggestions } = req.body as CleaningTaskCreateRequest;

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const normalizedTitle = title?.trim();
    const normalizedDescription = description?.trim();

    if (!normalizedTitle || !normalizedDescription) {
      return res.status(400).json({ message: '任务标题和任务说明不能为空' });
    }

    try {
      const task = await createCleaningTask(pool, {
        accountId: req.user.accountId,
        title: normalizedTitle.slice(0, 180),
        description: normalizedDescription,
        priority: normalizeTaskPriority(priority),
        sourceType: sourceType === 'analysis' || sourceType === 'monitor' ? sourceType : 'manual',
        sourceId: sourceId?.trim() || null,
        score: typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null,
        imageUrl: imageUrl || null,
        suggestions: Array.isArray(suggestions) ? suggestions : [],
      });

      await createActivityLog(pool, {
        accountId: req.user.accountId,
        kind: 'task',
        level: 'info',
        title: '已创建手动任务',
        description: normalizedTitle.slice(0, 180),
        score: task.score ?? null,
        relatedType: 'task',
        relatedId: task.id,
      });

      return res.json({ success: true, task });
    } catch (error) {
      console.error('创建清洁任务失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '创建清洁任务失败，请稍后重试' });
    }
  });

  app.patch('/api/tasks/:id/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const taskId = readSingleRouteParam(req.params.id);
    const { status } = req.body as CleaningTaskStatusRequest;
    const normalizedStatus = normalizeTaskStatus(status);

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!taskId) {
      return res.status(400).json({ message: '缺少任务 ID' });
    }

    if (!normalizedStatus) {
      return res.status(400).json({ message: '任务状态不合法' });
    }

    try {
      const task = await getCleaningTaskById(pool, taskId);

      if (!task || task.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '清洁任务不存在' });
      }

      await pool.execute(
        `UPDATE cleaning_tasks
        SET
          status = ?,
          completed_at = CASE
            WHEN ? = 'completed' THEN CURRENT_TIMESTAMP
            WHEN ? IN ('pending', 'running') THEN NULL
            ELSE completed_at
          END
        WHERE id = ?`,
        [normalizedStatus, normalizedStatus, normalizedStatus, taskId]
      );

      const updatedTask = await getCleaningTaskWithVerificationById(pool, taskId);

      if (!updatedTask) {
        throw new Error('任务状态已更新，但无法重新读取任务信息');
      }

      const activityLog = (
        {
          running: {
            title: '任务开始执行',
            description: `已开始执行任务：${updatedTask.title}`,
            level: 'info' as ActivityLogLevel,
          },
          ignored: {
            title: '任务已暂缓处理',
            description: `任务已被标记为暂不处理：${updatedTask.title}`,
            level: 'warn' as ActivityLogLevel,
          },
          pending: {
            title: '任务重新打开',
            description: `任务已恢复到待处理状态：${updatedTask.title}`,
            level: 'info' as ActivityLogLevel,
          },
        } as Partial<Record<CleaningTaskStatus, { title: string; description: string; level: ActivityLogLevel }>>
      )[normalizedStatus];

      if (activityLog && req.user?.accountId) {
        await createActivityLog(pool, {
          accountId: req.user.accountId,
          kind: 'task',
          level: activityLog.level,
          title: activityLog.title,
          description: activityLog.description,
          score: updatedTask.score ?? null,
          relatedType: 'task',
          relatedId: updatedTask.id,
        });
      }

      return res.json({ success: true, task: updatedTask });
    } catch (error) {
      console.error('更新清洁任务失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '更新清洁任务失败，请稍后重试' });
    }
  });

  app.post('/api/tasks/:id/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const taskId = readSingleRouteParam(req.params.id);
    const { image } = req.body as CleaningTaskVerifyRequest;

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!taskId) {
      return res.status(400).json({ message: '缺少任务 ID' });
    }

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ message: '缺少整理后的图片，请先上传一张对比照片' });
    }

    try {
      const task = await getCleaningTaskById(pool, taskId);

      if (!task || task.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '清洁任务不存在' });
      }

      if (!task.image && parseNumericValue(task.score) === null) {
        return res.status(400).json({ message: '当前任务缺少清洁前基线，暂时无法进行前后对比验证' });
      }

      const result = await runGardenAnalysis(req, image);
      const verification = await createTaskVerification(pool, {
        task,
        accountId: req.user.accountId,
        afterImageUrl: image,
        result,
      });
      const updatedTask = await getCleaningTaskWithVerificationById(pool, taskId);

      if (!updatedTask) {
        throw new Error('任务验证完成，但无法重新读取任务信息');
      }

      const deltaText =
        verification.scoreDelta === null || verification.scoreDelta === undefined
          ? '待比较'
          : verification.scoreDelta > 0
            ? `+${verification.scoreDelta}`
            : `${verification.scoreDelta}`;

      await createActivityLog(pool, {
        accountId: req.user.accountId,
        kind: 'verification',
        level: (verification.scoreDelta ?? 0) > 0 ? 'success' : (verification.scoreDelta ?? 0) < 0 ? 'warn' : 'info',
        title: '任务前后对比已完成',
        description: `${updatedTask.title} 已完成整理验证，分数变化 ${deltaText}`,
        score: verification.afterScore,
        relatedType: 'verification',
        relatedId: verification.id,
      });

      return res.json({
        success: true,
        task: updatedTask,
        verification,
        result,
      });
    } catch (error) {
      console.error('任务前后对比验证失败:', parseErrorMessage(error));

      if (error instanceof ApiRequestError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return res.status(500).json({ message: '任务前后对比验证失败，请稍后重试' });
    }
  });

  app.delete('/api/tasks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const deleteRequest = readRecordDeleteRequest(req.body as RecordDeleteRequest);
    const validationMessage = validateRecordDeleteRequest(deleteRequest);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    try {
      const deletedCount = await deleteCleaningTasksByUser(
        pool,
        req.user.accountId,
        deleteRequest.all ? undefined : deleteRequest.ids
      );

      return res.json({ success: true, deletedCount });
    } catch (error) {
      console.error('批量删除清洁任务失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '批量删除清洁任务失败，请稍后重试' });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const taskId = readSingleRouteParam(req.params.id);

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!taskId) {
      return res.status(400).json({ message: '缺少任务 ID' });
    }

    try {
      const task = await getCleaningTaskById(pool, taskId);

      if (!task || task.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '清洁任务不存在' });
      }

      await pool.execute('DELETE FROM cleaning_tasks WHERE id = ?', [taskId]);
      return res.json({ success: true });
    } catch (error) {
      console.error('删除清洁任务失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '删除清洁任务失败，请稍后重试' });
    }
  });

  app.get('/api/analysis/records', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
    const limit = Math.max(1, Math.min(80, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 30));

    try {
      const [records, stats] = await Promise.all([
        getAnalysisRecordsByUser(pool, req.user.accountId, limit),
        getAnalysisStatsByUser(pool, req.user.accountId),
      ]);

      return res.json({
        success: true,
        records,
        stats,
      });
    } catch (error) {
      console.error('读取分析历史失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取分析历史失败，请稍后重试' });
    }
  });

  app.delete('/api/analysis/records', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const deleteRequest = readRecordDeleteRequest(req.body as RecordDeleteRequest);
    const validationMessage = validateRecordDeleteRequest(deleteRequest);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    try {
      const deletedCount = await deleteAnalysisRecordsByUser(
        pool,
        req.user.accountId,
        deleteRequest.all ? undefined : deleteRequest.ids
      );
      const stats = await getAnalysisStatsByUser(pool, req.user.accountId);

      return res.json({ success: true, deletedCount, stats });
    } catch (error) {
      console.error('删除分析历史失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '删除分析历史失败，请稍后重试' });
    }
  });

  app.post('/api/analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { image } = req.body as { image?: string };

    if (!image || typeof image !== 'string') {
      return sendApiError(res, 400, {
        code: 'IMAGE_MISSING',
        message: '缺少图片数据，请先上传或拍摄一张桌面图片',
      });
    }

    try {
      const result = await runGardenAnalysis(req, image);
      let record: AnalysisRecord | null = null;
      let task: CleaningTask | null = null;

      if (req.user?.accountId) {
        const preferences = await getUserPreferencesByAccountId(pool, req.user.accountId);

        record = await createAnalysisRecord(pool, {
          accountId: req.user.accountId,
          result,
          imageUrl: image,
        });

        await createActivityLog(pool, {
          accountId: req.user.accountId,
          kind: 'analysis',
          level: result.score >= 80 ? 'success' : result.score >= 60 ? 'info' : 'warn',
          title: '已生成桌面诊断报告',
          description: result.event,
          score: result.score,
          relatedType: 'analysis',
          relatedId: record.id,
        });

        if (preferences.autoCreateTaskEnabled && shouldCreateCleaningTask(result.score)) {
          task = await createCleaningTaskFromAnalysis(pool, {
            accountId: req.user.accountId,
            sourceType: 'analysis',
            sourceId: record.id,
            result,
            imageUrl: image,
          });

          record = await attachTaskToAnalysisRecord(pool, record.id, task.id);

          await createActivityLog(pool, {
            accountId: req.user.accountId,
            kind: 'task',
            level: 'warn',
            title: '系统已生成清洁任务',
            description: `${task.title}，建议尽快处理当前桌面问题`,
            score: task.score ?? null,
            relatedType: 'task',
            relatedId: task.id,
          });
        }
      }

      return res.json({
        success: true,
        result,
        task,
        record,
      });
    } catch (error) {
      console.error('桌面分析失败:', parseErrorMessage(error));

      if (error instanceof ApiRequestError) {
        return sendApiError(res, error.status, {
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return sendApiError(res, 502, {
        code: 'ANALYZE_FAILED',
        message: '桌面分析失败，请稍后重试',
        details: parseErrorMessage(error),
      });
    }
  });

  app.post('/api/monitor/session/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { deviceName, cameraLabel, captureIntervalSeconds } = req.body as MonitorStartRequest;

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const sessionId = createEntityId('monitor');
    const normalizedDeviceName = deviceName?.trim() || '当前设备';
    const normalizedCameraLabel = cameraLabel?.trim() || null;
    const normalizedInterval = normalizeCaptureInterval(captureIntervalSeconds);

    try {
      await pool.execute(
        `INSERT INTO monitor_sessions (
          id,
          user_account_id,
          device_name,
          camera_label,
          status,
          capture_interval_seconds
        ) VALUES (?, ?, ?, ?, 'starting', ?)`,
        [sessionId, req.user.accountId, normalizedDeviceName, normalizedCameraLabel, normalizedInterval]
      );

      const session = await getMonitorSessionById(pool, sessionId);

      if (!session) {
        throw new Error('监控会话创建成功，但无法重新读取会话信息');
      }

      return res.json({
        success: true,
        session: formatMonitorSession(session),
      });
    } catch (error) {
      console.error('创建监控会话失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '创建监控会话失败，请稍后重试' });
    }
  });

  app.post('/api/monitor/frame', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, image } = req.body as MonitorFrameRequest;

    if (!req.user?.accountId) {
      return sendApiError(res, 401, {
        code: 'SESSION_INVALID',
        message: '登录状态已失效，请重新登录',
      });
    }

    if (!sessionId) {
      return sendApiError(res, 400, {
        code: 'MONITOR_SESSION_MISSING',
        message: '缺少监控会话 ID',
      });
    }

    if (!image || typeof image !== 'string') {
      return sendApiError(res, 400, {
        code: 'MONITOR_IMAGE_MISSING',
        message: '缺少监控画面，请确认摄像头预览已正常启动',
      });
    }

    try {
      const session = await getMonitorSessionById(pool, sessionId);

      if (!session || session.user_account_id !== req.user.accountId) {
        return sendApiError(res, 404, {
          code: 'MONITOR_SESSION_NOT_FOUND',
          message: '监控会话不存在',
        });
      }

      if (session.status === 'stopped') {
        return sendApiError(res, 400, {
          code: 'MONITOR_SESSION_STOPPED',
          message: '监控会话已结束，请重新开始监控',
        });
      }

      const result = await runGardenAnalysis(req, image);
      const previousScore = parseNumericValue(session.latest_score) ?? parseNumericValue(session.baseline_score);
      const isFirstFrame = previousScore === null;
      const riskLevel = getRiskLevel(result.score);
      const { eventType, changeLabel } = buildMonitorEventMeta(result.score, previousScore, isFirstFrame);
      const snapshot = shouldSaveSnapshot(eventType, isFirstFrame) ? image : null;
      const eventId = createEntityId('event');
      const currentEventCount = Number(session.event_count || 0);
      const currentAlertCount = Number(session.alert_count || 0);
      const currentAverage = parseNumericValue(session.average_score) ?? 0;
      const nextEventCount = currentEventCount + 1;
      const nextAverage = Number(((currentAverage * currentEventCount + result.score) / nextEventCount).toFixed(2));
      const nextAlertCount = currentAlertCount + (riskLevel === 'high' || eventType === 'alert' ? 1 : 0);

      await pool.execute(
        `INSERT INTO monitor_events (
          id,
          session_id,
          score,
          event_type,
          risk_level,
          change_label,
          event,
          action,
          suggestions,
          snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          sessionId,
          result.score,
          eventType,
          riskLevel,
          changeLabel,
          result.event,
          result.action,
          JSON.stringify(result.suggestions),
          snapshot,
        ]
      );

      await pool.execute(
        `UPDATE monitor_sessions
        SET
          status = 'monitoring',
          baseline_score = COALESCE(baseline_score, ?),
          latest_score = ?,
          average_score = ?,
          event_count = ?,
          alert_count = ?,
          latest_event = ?,
          latest_action = ?,
          latest_snapshot = COALESCE(?, latest_snapshot)
        WHERE id = ?`,
        [
          result.score,
          result.score,
          nextAverage,
          nextEventCount,
          nextAlertCount,
          result.event,
          result.action,
          snapshot,
          sessionId,
        ]
      );

      const updatedSession = await getMonitorSessionById(pool, sessionId);

      if (!updatedSession) {
        throw new Error('监控结果已写入，但无法读取最新会话信息');
      }

      const [eventRows] = await pool.query<MonitorEventRow[]>(
        `SELECT
          id,
          session_id,
          score,
          event_type,
          risk_level,
          change_label,
          event,
          action,
          suggestions,
          snapshot,
          created_at
        FROM monitor_events
        WHERE id = ?
        LIMIT 1`,
        [eventId]
      );

      const currentEvent = eventRows[0];

      if (!currentEvent) {
        throw new Error('监控事件已写入，但无法读取事件详情');
      }

      const formattedEvent = formatMonitorEvent(currentEvent);
      const preferences = req.user?.accountId
        ? await getUserPreferencesByAccountId(pool, req.user.accountId)
        : DEFAULT_USER_PREFERENCES;
      const task =
        preferences.autoCreateTaskEnabled && shouldCreateCleaningTask(result.score, eventType) && req.user?.accountId
          ? await createCleaningTaskFromAnalysis(pool, {
              accountId: req.user.accountId,
              sourceType: 'monitor',
              sourceId: eventId,
              result,
              imageUrl: snapshot,
            })
          : null;

      const payload: MonitorFrameAnalysis = {
        session: formatMonitorSession(updatedSession),
        event: formattedEvent,
        result,
      };

      if (
        req.user?.accountId &&
        (eventType === 'baseline' || eventType === 'alert' || eventType === 'declined' || eventType === 'improved')
      ) {
        await createActivityLog(pool, {
          accountId: req.user.accountId,
          kind: 'monitor',
          level: riskLevel === 'high' ? 'warn' : eventType === 'improved' ? 'success' : 'info',
          title:
            eventType === 'baseline'
              ? '已建立桌面监控基线'
              : eventType === 'improved'
                ? '监控发现桌面状态改善'
                : '监控发现桌面风险变化',
          description: result.event,
          score: result.score,
          relatedType: 'monitor_event',
          relatedId: eventId,
        });
      }

      if (task && req.user?.accountId) {
        await createActivityLog(pool, {
          accountId: req.user.accountId,
          kind: 'task',
          level: 'warn',
          title: '监控已触发清洁任务',
          description: `${task.title}，来源于实时监控事件`,
          score: task.score ?? null,
          relatedType: 'task',
          relatedId: task.id,
        });
      }

      return res.json({
        success: true,
        data: payload,
        task,
      });
    } catch (error) {
      console.error('监控抓帧分析失败:', parseErrorMessage(error));

      if (error instanceof ApiRequestError) {
        return sendApiError(res, error.status, {
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return sendApiError(res, 502, {
        code: 'MONITOR_ANALYZE_FAILED',
        message: '实时监控分析失败，请检查 Garden 服务后重试',
        details: parseErrorMessage(error),
      });
    }
  });

  app.post('/api/monitor/session/stop', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.body as { sessionId?: string };

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!sessionId) {
      return res.status(400).json({ message: '缺少监控会话 ID' });
    }

    try {
      const session = await getMonitorSessionById(pool, sessionId);

      if (!session || session.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '监控会话不存在' });
      }

      await pool.execute(
        `UPDATE monitor_sessions
        SET status = 'stopped', ended_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [sessionId]
      );

      const updatedSession = await getMonitorSessionById(pool, sessionId);

      if (!updatedSession) {
        throw new Error('监控会话停止后无法重新读取');
      }

      return res.json({
        success: true,
        session: formatMonitorSession(updatedSession),
      });
    } catch (error) {
      console.error('停止监控会话失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '停止监控失败，请稍后重试' });
    }
  });

  app.get('/api/monitor/session/:id/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = readSingleRouteParam(req.params.id);

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!sessionId) {
      return res.status(400).json({ message: '缺少监控会话 ID' });
    }

    try {
      const session = await getMonitorSessionById(pool, sessionId);

      if (!session || session.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '监控会话不存在' });
      }

      const events = await getRecentMonitorEvents(pool, sessionId, 30);

      return res.json({
        success: true,
        events,
      });
    } catch (error) {
      console.error('读取监控事件失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取监控事件失败，请稍后重试' });
    }
  });

  app.get('/api/monitor/session/:id/summary', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = readSingleRouteParam(req.params.id);

    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    if (!sessionId) {
      return res.status(400).json({ message: '缺少监控会话 ID' });
    }

    try {
      const session = await getMonitorSessionById(pool, sessionId);

      if (!session || session.user_account_id !== req.user.accountId) {
        return res.status(404).json({ message: '监控会话不存在' });
      }

      const events = await getRecentMonitorEvents(pool, sessionId, 80);

      return res.json({
        success: true,
        session: formatMonitorSession(session),
        events,
      });
    } catch (error) {
      console.error('读取监控摘要失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取监控摘要失败，请稍后重试' });
    }
  });

  app.get('/api/monitor/overview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    try {
      const latestSession = await getLatestMonitorSessionByUser(pool, req.user.accountId);

      if (!latestSession) {
        return res.json({
          success: true,
          session: null,
          events: [],
        });
      }

      const events = await getRecentMonitorEvents(pool, latestSession.id, 5);

      return res.json({
        success: true,
        session: formatMonitorSession(latestSession),
        events,
      });
    } catch (error) {
      console.error('读取监控总览失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取监控总览失败，请稍后重试' });
    }
  });

  app.get('/api/monitor/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 20));

    try {
      const sessions = await getMonitorSessionsByUser(pool, req.user.accountId, limit);

      return res.json({
        success: true,
        sessions,
      });
    } catch (error) {
      console.error('读取监控历史失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '读取监控历史失败，请稍后重试' });
    }
  });

  app.delete('/api/monitor/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.accountId) {
      return res.status(401).json({ message: '登录状态已失效，请重新登录' });
    }

    const deleteRequest = readRecordDeleteRequest(req.body as RecordDeleteRequest);
    const validationMessage = validateRecordDeleteRequest(deleteRequest);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    try {
      const deletedCount = await deleteMonitorSessionsByUser(
        pool,
        req.user.accountId,
        deleteRequest.all ? undefined : deleteRequest.ids
      );

      return res.json({ success: true, deletedCount });
    } catch (error) {
      console.error('删除监控历史失败:', parseErrorMessage(error));
      return res.status(500).json({ message: '删除监控历史失败，请稍后重试' });
    }
  });

  app.get('/api/test-garden', async (_req, res) => {
    try {
      const testUrl = `${process.env.GARDEN_API_BASE_URL}/v1/models`;
      const response = await fetch(testUrl, {
        headers: {
          Authorization: `Bearer ${process.env.GARDEN_API_KEY}`,
        },
      });

      const data = await response.json();
      res.json({ success: true, data });
    } catch (error) {
      console.error('测试 Garden 连接失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });
};

async function startServer() {
  console.log('正在启动服务...');
  const mySqlConfig = getMySqlConfig();
  console.log(`MySQL 连接: ${mySqlConfig.user}@${mySqlConfig.host}:${mySqlConfig.port}/${mySqlConfig.database}`);
  const pool = await createMySqlPool();
  console.log(
    'MySQL 数据库已连接，users / notifications / user_preferences / monitor_sessions / monitor_events / analysis_records / cleaning_tasks / task_verifications 表已准备就绪'
  );

  const app = express();
  app.use(cors());
  app.use(attachRequestId);
  app.use(express.json({ limit: '15mb' }));
  app.use(handleJsonParseError);

  registerRoutes(app, pool);

  app.use('/api', (req: Request, res: Response) =>
    sendApiError(res, 404, {
      code: 'API_NOT_FOUND',
      message: '接口不存在，请检查请求路径',
      details: `${req.method} ${req.originalUrl}`,
    })
  );

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

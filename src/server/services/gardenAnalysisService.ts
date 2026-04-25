import { Request } from 'express';
import { Pool } from 'mysql2/promise';
import { analyzeDesktopImage } from '../../services/gardenService';
import { HEALTH_CHECK_SAMPLE_IMAGE } from '../constants';
import { ApiRequestError, parseErrorMessage } from '../errors';
import { AnalysisResultLike } from '../domain';

export interface HealthResponsePayload {
  success: boolean;
  status: 'ok' | 'degraded';
  services: {
    server: { status: 'ok'; message: string };
    database: { status: 'ok' | 'error'; message: string };
    garden: {
      status: 'ok' | 'error' | 'skipped';
      configured: boolean;
      message: string;
    };
  };
}

export const getGardenConfigFromRequest = (
  _req: Request
): {
  apiKey?: string;
  baseUrl?: string;
} => ({
  apiKey: process.env.GARDEN_API_KEY,
  baseUrl: process.env.GARDEN_API_BASE_URL,
});

export const hasGardenConfig = (apiKey?: string, baseUrl?: string) => Boolean(apiKey?.trim() && baseUrl?.trim());

export const runGardenAnalysis = async (req: Request, image: string): Promise<AnalysisResultLike> => {
  const { apiKey, baseUrl } = getGardenConfigFromRequest(req);

  if (!hasGardenConfig(apiKey, baseUrl)) {
    throw new ApiRequestError(
      500,
      'GARDEN_CONFIG_MISSING',
      '当前未配置可用的 Garden 服务，请检查后端 .env 中的 GARDEN_API_KEY 和 GARDEN_API_BASE_URL',
      '缺少 GARDEN_API_KEY 或 GARDEN_API_BASE_URL'
    );
  }

  try {
    return await analyzeDesktopImage(image, apiKey as string, baseUrl as string);
  } catch (error) {
    throw new ApiRequestError(
      502,
      'GARDEN_UNAVAILABLE',
      'Garden 服务当前不可用，请检查后端 .env 配置和模型服务状态',
      parseErrorMessage(error)
    );
  }
};

export const buildHealthPayload = async (pool: Pool, req: Request): Promise<HealthResponsePayload> => {
  let databaseStatus: HealthResponsePayload['services']['database'] = {
    status: 'ok',
    message: 'MySQL 连接正常',
  };

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    databaseStatus = {
      status: 'error',
      message: `MySQL 检查失败：${parseErrorMessage(error)}`,
    };
  }

  const { apiKey, baseUrl } = getGardenConfigFromRequest(req);
  let gardenStatus: HealthResponsePayload['services']['garden'];

  if (!hasGardenConfig(apiKey, baseUrl)) {
    gardenStatus = {
      status: 'skipped',
      configured: false,
      message: 'Garden 配置缺失，请检查后端 .env 中的 GARDEN_API_KEY 和 GARDEN_API_BASE_URL',
    };
  } else {
    try {
      await analyzeDesktopImage(HEALTH_CHECK_SAMPLE_IMAGE, apiKey as string, baseUrl as string);
      gardenStatus = {
        status: 'ok',
        configured: true,
        message: 'Garden 服务可用，实时分析已就绪',
      };
    } catch (error) {
      gardenStatus = {
        status: 'error',
        configured: true,
        message: `Garden 检查失败：${parseErrorMessage(error)}`,
      };
    }
  }

  const status = databaseStatus.status === 'ok' && gardenStatus.status === 'ok' ? 'ok' : 'degraded';

  return {
    success: true,
    status,
    services: {
      server: {
        status: 'ok',
        message: '应用服务运行正常',
      },
      database: databaseStatus,
      garden: gardenStatus,
    },
  };
};

import mysql, { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface UserRow extends RowDataPacket {
  id: number;
  account_id: string;
  nickname: string;
  password: string;
  avatar: string | null;
}

export interface ActivityLogRow extends RowDataPacket {
  id: string;
  user_account_id: string;
  kind: string;
  level: string;
  title: string;
  description: string;
  score: number | null;
  related_type: string | null;
  related_id: string | null;
  created_at: Date;
}

export interface NotificationRow extends RowDataPacket {
  id: string;
  user_account_id: string;
  kind: string;
  level: string;
  title: string;
  description: string;
  related_type: string | null;
  related_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

export interface UserPreferencesRow extends RowDataPacket {
  user_account_id: string;
  theme_preference: string;
  default_monitor_interval_seconds: number;
  auto_create_task_enabled: number;
  notification_enabled: number;
  high_risk_alert_enabled: number;
  updated_at: Date;
}

export interface MonitorSessionRow extends RowDataPacket {
  id: string;
  user_account_id: string;
  device_name: string;
  camera_label: string | null;
  status: string;
  capture_interval_seconds: number;
  baseline_score: number | null;
  latest_score: number | null;
  average_score: number | null;
  event_count: number;
  alert_count: number;
  latest_event: string | null;
  latest_action: string | null;
  latest_snapshot: string | null;
  started_at: Date;
  ended_at: Date | null;
}

export interface MonitorEventRow extends RowDataPacket {
  id: string;
  session_id: string;
  score: number;
  event_type: string;
  risk_level: string;
  change_label: string;
  event: string;
  action: string;
  suggestions: string;
  snapshot: string | null;
  created_at: Date;
}

export interface CleaningTaskRow extends RowDataPacket {
  id: string;
  user_account_id: string;
  source_type: string;
  source_id: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  score: number | null;
  image: string | null;
  suggestions: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface TaskVerificationRow extends RowDataPacket {
  id: string;
  task_id: string;
  user_account_id: string;
  before_score: number | null;
  after_score: number;
  score_delta: number | null;
  before_image: string | null;
  after_image: string;
  before_summary: string | null;
  after_summary: string;
  after_action: string;
  after_suggestions: string;
  created_at: Date;
}

export interface AnalysisRecordRow extends RowDataPacket {
  id: string;
  user_account_id: string;
  score: number;
  event: string;
  action: string;
  suggestions: string;
  image: string | null;
  task_id: string | null;
  created_at: Date;
}

export interface AnalysisRecordStatsRow extends RowDataPacket {
  total_count: number;
  average_score: number | string | null;
  best_score: number | null;
  needs_attention_count: number | string | null;
  task_linked_count: number | string | null;
}

export interface TaskStatusStatsRow extends RowDataPacket {
  pending_count: number | string | null;
  running_count: number | string | null;
  completed_count: number | string | null;
  total_count: number | string | null;
}

export interface VerificationStatsRow extends RowDataPacket {
  verified_count: number | string | null;
  average_delta: number | string | null;
}

export interface NotificationSummaryRow extends RowDataPacket {
  unread_count: number | string | null;
}

export interface DashboardTrendRow extends RowDataPacket {
  stat_date: string;
  average_score: number | string | null;
  analysis_count: number | string | null;
  verification_count: number | string | null;
  average_delta: number | string | null;
}

export interface MySqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const DEFAULT_CONFIG: MySqlConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'Yang-17514',
  database: process.env.MYSQL_DATABASE || 'shijing',
};

const assertDatabaseName = (database: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('MYSQL_DATABASE 只能包含字母、数字和下划线');
  }
};

export const getMySqlConfig = (): MySqlConfig => {
  assertDatabaseName(DEFAULT_CONFIG.database);
  return DEFAULT_CONFIG;
};

const getPoolOptions = (config: MySqlConfig, includeDatabase: boolean): PoolOptions => ({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: includeDatabase ? config.database : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

const ensureColumn = async (pool: Pool, tableName: string, columnName: string, definition: string) => {
  const [rows] = await pool.query<Array<{ column_count: number | string } & RowDataPacket>>(
    `SELECT COUNT(*) AS column_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (Number(rows[0]?.column_count ?? 0) > 0) {
    return;
  }

  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
};

export const createMySqlPool = async (): Promise<Pool> => {
  const config = getMySqlConfig();
  const bootstrapPool = mysql.createPool(getPoolOptions(config, false));

  try {
    await bootstrapPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrapPool.end();
  }

  const pool = mysql.createPool(getPoolOptions(config, true));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(32) NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      avatar LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_account_id (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_account_id VARCHAR(32) NOT NULL,
      kind VARCHAR(24) NOT NULL,
      level VARCHAR(16) NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      score INT NULL,
      related_type VARCHAR(32) NULL,
      related_id VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_activity_logs_user_created (user_account_id, created_at),
      KEY idx_activity_logs_kind (kind),
      KEY idx_activity_logs_related (related_type, related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_account_id VARCHAR(32) NOT NULL,
      kind VARCHAR(24) NOT NULL,
      level VARCHAR(16) NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      related_type VARCHAR(32) NULL,
      related_id VARCHAR(64) NULL,
      read_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notifications_user_read_created (user_account_id, read_at, created_at),
      KEY idx_notifications_kind (kind),
      KEY idx_notifications_related (related_type, related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_account_id VARCHAR(32) NOT NULL PRIMARY KEY,
      theme_preference VARCHAR(16) NOT NULL DEFAULT 'system',
      default_monitor_interval_seconds INT UNSIGNED NOT NULL DEFAULT 8,
      auto_create_task_enabled TINYINT(1) NOT NULL DEFAULT 1,
      notification_enabled TINYINT(1) NOT NULL DEFAULT 1,
      high_risk_alert_enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_preferences_theme (theme_preference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(pool, 'user_preferences', 'auto_create_task_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn(pool, 'user_preferences', 'notification_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn(pool, 'user_preferences', 'high_risk_alert_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_sessions (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_account_id VARCHAR(32) NOT NULL,
      device_name VARCHAR(120) NOT NULL,
      camera_label VARCHAR(255) NULL,
      status VARCHAR(24) NOT NULL,
      capture_interval_seconds INT UNSIGNED NOT NULL DEFAULT 8,
      baseline_score INT NULL,
      latest_score INT NULL,
      average_score DECIMAL(6,2) NULL,
      event_count INT UNSIGNED NOT NULL DEFAULT 0,
      alert_count INT UNSIGNED NOT NULL DEFAULT 0,
      latest_event TEXT NULL,
      latest_action TEXT NULL,
      latest_snapshot LONGTEXT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL DEFAULT NULL,
      KEY idx_monitor_sessions_user (user_account_id),
      KEY idx_monitor_sessions_started_at (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_events (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      score INT NOT NULL,
      event_type VARCHAR(24) NOT NULL,
      risk_level VARCHAR(16) NOT NULL,
      change_label VARCHAR(120) NOT NULL,
      event TEXT NOT NULL,
      action TEXT NOT NULL,
      suggestions LONGTEXT NOT NULL,
      snapshot LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_monitor_events_session (session_id),
      KEY idx_monitor_events_created_at (created_at),
      CONSTRAINT fk_monitor_events_session FOREIGN KEY (session_id) REFERENCES monitor_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_records (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_account_id VARCHAR(32) NOT NULL,
      score INT NOT NULL,
      event TEXT NOT NULL,
      action TEXT NOT NULL,
      suggestions LONGTEXT NOT NULL,
      image LONGTEXT NULL,
      task_id VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_analysis_records_user_created (user_account_id, created_at),
      KEY idx_analysis_records_score (score),
      KEY idx_analysis_records_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cleaning_tasks (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_account_id VARCHAR(32) NOT NULL,
      source_type VARCHAR(24) NOT NULL,
      source_id VARCHAR(64) NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      priority VARCHAR(16) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      score INT NULL,
      image LONGTEXT NULL,
      suggestions LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      KEY idx_cleaning_tasks_user_status (user_account_id, status),
      KEY idx_cleaning_tasks_created_at (created_at),
      KEY idx_cleaning_tasks_source (source_type, source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_verifications (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      user_account_id VARCHAR(32) NOT NULL,
      before_score INT NULL,
      after_score INT NOT NULL,
      score_delta INT NULL,
      before_image LONGTEXT NULL,
      after_image LONGTEXT NOT NULL,
      before_summary TEXT NULL,
      after_summary TEXT NOT NULL,
      after_action TEXT NOT NULL,
      after_suggestions LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_task_verifications_task_created (task_id, created_at),
      KEY idx_task_verifications_user_created (user_account_id, created_at),
      CONSTRAINT fk_task_verifications_task FOREIGN KEY (task_id) REFERENCES cleaning_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  return pool;
};

export const insertUser = async (
  pool: Pool,
  input: { accountId: string; nickname: string; password: string; avatar: string | null }
) => {
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO users (account_id, nickname, password, avatar) VALUES (?, ?, ?, ?)',
    [input.accountId, input.nickname, input.password, input.avatar]
  );

  return result;
};

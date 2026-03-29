import mysql, { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export interface UserRow extends RowDataPacket {
  id: number;
  account_id: string;
  nickname: string;
  password: string;
  avatar: string | null;
}

export interface MySqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const DEFAULT_CONFIG: MySqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "Yang-17514",
  database: process.env.MYSQL_DATABASE || "shijing",
};

const assertDatabaseName = (database: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("MYSQL_DATABASE 只能包含字母、数字和下划线");
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
  charset: "utf8mb4",
});

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

  return pool;
};

export const insertUser = async (
  pool: Pool,
  input: { accountId: string; nickname: string; password: string; avatar: string | null }
) => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO users (account_id, nickname, password, avatar) VALUES (?, ?, ?, ?)",
    [input.accountId, input.nickname, input.password, input.avatar]
  );

  return result;
};

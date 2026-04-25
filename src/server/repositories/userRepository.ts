import { Pool } from 'mysql2/promise';
import { UserRow } from '../mysql';

export const getUserByAccountId = async (pool: Pool, accountId: string) => {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, account_id, nickname, password, avatar FROM users WHERE account_id = ? LIMIT 1',
    [accountId]
  );

  return rows[0] || null;
};

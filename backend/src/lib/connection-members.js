import { query } from '../db.js';

function isMissingCanManageColumn(error) {
  return error?.code === '42703' || /can_manage/i.test(String(error?.message || ''));
}

export async function assignConnectionMember(connectionId, userId, { canManage = false } = {}) {
  try {
    await query(
      `INSERT INTO connection_members (connection_id, user_id, can_view, can_send, can_manage)
       VALUES ($1, $2, true, true, $3)
       ON CONFLICT (connection_id, user_id) DO UPDATE
       SET can_view = true, can_send = true, can_manage = connection_members.can_manage OR EXCLUDED.can_manage`,
      [connectionId, userId, canManage]
    );
  } catch (error) {
    if (!isMissingCanManageColumn(error)) throw error;

    await query(
      `INSERT INTO connection_members (connection_id, user_id, can_view, can_send)
       VALUES ($1, $2, true, true)
       ON CONFLICT (connection_id, user_id) DO UPDATE SET can_view = true, can_send = true`,
      [connectionId, userId]
    );
  }
}

export async function ensureOwnConnectionMemberships(userId) {
  const result = await query(
    `SELECT c.id
       FROM connections c
      WHERE c.user_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM connection_members cm
          WHERE cm.connection_id = c.id AND cm.user_id = $1
        )`,
    [userId]
  );

  for (const row of result.rows) {
    await assignConnectionMember(row.id, userId, { canManage: true });
  }
}
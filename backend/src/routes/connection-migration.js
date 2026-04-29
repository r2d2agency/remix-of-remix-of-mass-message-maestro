// Migrate ALL data from one connection to another (same organization).
// Strategy: change connection_id everywhere. For tables with UNIQUE(connection_id, key),
// merge child rows into the destination row before deleting the source row.

import { Router } from 'express';
import { query, getClient } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

async function getUserOrg(userId) {
  const r = await query(
    `SELECT organization_id, role FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

// Tables with UNIQUE (connection_id, <other>) that need merge-then-update logic
const MERGE_TABLES = [
  // table, unique-key column(s) (besides connection_id), child tables FK referencing it
  { table: 'conversations', keys: ['remote_jid'], pkChildren: [
      // children tables that reference conversations.id and must be re-pointed when merging
      { table: 'chat_messages', fk: 'conversation_id' },
    ] },
  { table: 'chat_contacts', keys: ['phone'], pkChildren: [] },
  { table: 'connection_members', keys: ['user_id'], pkChildren: [] },
  { table: 'ai_agent_connections', keys: ['agent_id'], pkChildren: [] },
  { table: 'connection_lead_distribution', keys: ['user_id'], pkChildren: [] },
];

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name]
  );
  return r.rowCount > 0;
}

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return r.rowCount > 0;
}

router.post('/migrate', async (req, res) => {
  const { from_connection_id, to_connection_id } = req.body || {};
  if (!from_connection_id || !to_connection_id) {
    return res.status(400).json({ error: 'from_connection_id e to_connection_id são obrigatórios' });
  }
  if (from_connection_id === to_connection_id) {
    return res.status(400).json({ error: 'As conexões de origem e destino devem ser diferentes' });
  }

  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Usuário sem organização' });
  if (!['owner', 'admin'].includes(org.role)) {
    return res.status(403).json({ error: 'Apenas owner/admin podem migrar conversas' });
  }

  // Both connections must exist and belong to the same org
  const cs = await query(
    `SELECT id, name, organization_id FROM connections WHERE id = ANY($1::uuid[])`,
    [[from_connection_id, to_connection_id]]
  );
  if (cs.rows.length !== 2) {
    return res.status(404).json({ error: 'Conexão não encontrada' });
  }
  const fromC = cs.rows.find((c) => c.id === from_connection_id);
  const toC = cs.rows.find((c) => c.id === to_connection_id);
  if (!fromC || !toC) return res.status(404).json({ error: 'Conexão não encontrada' });
  if (fromC.organization_id !== org.organization_id || toC.organization_id !== org.organization_id) {
    return res.status(403).json({ error: 'Conexões devem pertencer à sua organização' });
  }

  const client = await getClient();
  const summary = { merged: {}, updated: {}, skipped: [] };

  try {
    await client.query('BEGIN');

    // 1) Process MERGE tables (unique constraint conflicts must be resolved first)
    for (const spec of MERGE_TABLES) {
      if (!(await tableExists(client, spec.table))) {
        summary.skipped.push(`${spec.table} (não existe)`);
        continue;
      }
      const keyCols = spec.keys.join(', ');
      const keyJoin = spec.keys.map((k) => `s.${k} = d.${k}`).join(' AND ');

      // Find rows in source that have a matching destination row (conflict)
      const dupes = await client.query(
        `SELECT s.id AS src_id, d.id AS dst_id
           FROM ${spec.table} s
           JOIN ${spec.table} d
             ON d.connection_id = $2 AND ${keyJoin}
          WHERE s.connection_id = $1`,
        [from_connection_id, to_connection_id]
      );

      // Re-point children of duplicate source rows to the destination row, then delete source row
      let mergedCount = 0;
      for (const row of dupes.rows) {
        for (const child of spec.pkChildren) {
          if (!(await tableExists(client, child.table))) continue;
          await client.query(
            `UPDATE ${child.table} SET ${child.fk} = $1 WHERE ${child.fk} = $2`,
            [row.dst_id, row.src_id]
          );
        }
        await client.query(`DELETE FROM ${spec.table} WHERE id = $1`, [row.src_id]);
        mergedCount++;
      }
      summary.merged[spec.table] = mergedCount;

      // Now safe to UPDATE the remaining source rows
      const upd = await client.query(
        `UPDATE ${spec.table} SET connection_id = $2 WHERE connection_id = $1`,
        [from_connection_id, to_connection_id]
      );
      summary.updated[spec.table] = upd.rowCount;

      // Special case for chat_messages: ensure messages are correctly linked to the new connection
      if (spec.table === 'conversations') {
        const hasMsgConnId = await columnExists(client, 'chat_messages', 'connection_id');
        if (hasMsgConnId) {
          await client.query(
            `UPDATE chat_messages SET connection_id = $2 
             WHERE conversation_id IN (SELECT id FROM conversations WHERE connection_id = $2)`,
            [from_connection_id, to_connection_id]
          );
        }
      }
    }

    // 2) Discover ALL OTHER tables with a connection_id column and update them
    const others = await client.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name='connection_id'
          AND table_name NOT IN (${MERGE_TABLES.map((_, i) => `$${i + 1}`).join(',')})`,
      MERGE_TABLES.map((s) => s.table)
    );

    for (const { table_name } of others.rows) {
      try {
        const r = await client.query(
          `UPDATE ${table_name} SET connection_id = $2 WHERE connection_id = $1`,
          [from_connection_id, to_connection_id]
        );
        if (r.rowCount > 0) summary.updated[table_name] = r.rowCount;
      } catch (e) {
        // Some tables may have unique constraints we don't know about — log and skip
        summary.skipped.push(`${table_name}: ${e.message}`);
      }
    }

    // 3) Also handle alternate columns referencing connections
    if (await columnExists(client, 'asaas_integrations', 'alert_connection_id')) {
      const r = await client.query(
        `UPDATE asaas_integrations SET alert_connection_id = $2 WHERE alert_connection_id = $1`,
        [from_connection_id, to_connection_id]
      );
      if (r.rowCount > 0) summary.updated['asaas_integrations.alert_connection_id'] = r.rowCount;
    }
    if (await columnExists(client, 'group_secretary_config', 'default_connection_id')) {
      const r = await client.query(
        `UPDATE group_secretary_config SET default_connection_id = $2 WHERE default_connection_id = $1`,
        [from_connection_id, to_connection_id]
      );
      if (r.rowCount > 0) summary.updated['group_secretary_config.default_connection_id'] = r.rowCount;
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      from: { id: fromC.id, name: fromC.name },
      to: { id: toC.id, name: toC.name },
      summary,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migration] error', err);
    res.status(500).json({ error: 'Falha ao migrar conversas', detail: err.message });
  } finally {
    client.release();
  }
});

export default router;

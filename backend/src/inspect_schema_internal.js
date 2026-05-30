import { query } from './db.js';

async function inspect() {
  try {
    const res = await query(`
      SELECT 
        conname, 
        confrelid::regclass, 
        confdeltype
      FROM pg_constraint 
      WHERE conrelid = 'conversations'::regclass AND contype = 'f'
    `);
    console.log('Foreign Keys on conversations:');
    res.rows.forEach(r => {
      let action = 'NO ACTION';
      if (r.confdeltype === 'c') action = 'CASCADE';
      if (r.confdeltype === 'n') action = 'SET NULL';
      if (r.confdeltype === 'r') action = 'RESTRICT';
      console.log(`- ${r.conname} references ${r.confrelid}: ON DELETE ${action}`);
    });

    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM connections) as connections,
        (SELECT COUNT(*) FROM conversations) as conversations,
        (SELECT COUNT(*) FROM chat_messages) as messages
    `);
    console.log('\nCounts:', counts.rows[0]);

    const orphaned = await query(`
      SELECT COUNT(*) FROM conversations WHERE connection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM connections WHERE id = connection_id)
    `);
    console.log('Orphaned conversations (pointing to deleted connections):', orphaned.rows[0].count);

  } catch (err) {
    console.error('Inspection failed:', err);
  } finally {
    process.exit(0);
  }
}

inspect();

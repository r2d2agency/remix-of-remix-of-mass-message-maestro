import { query } from './backend/src/db.js';

async function inspect() {
  try {
    console.log('--- Checking tables ---');
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '));

    console.log('\n--- Checking Connections ---');
    const conns = await query("SELECT id, name, provider, phone_number FROM connections");
    console.log('Connections:', conns.rows);

    console.log('\n--- Checking Conversations ---');
    const totalConv = await query("SELECT COUNT(*) FROM conversations");
    const orphanedConv = await query("SELECT COUNT(*) FROM conversations WHERE connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections)");
    console.log('Total Conversations:', totalConv.rows[0].count);
    console.log('Orphaned Conversations:', orphanedConv.rows[0].count);

    if (orphanedConv.rows[0].count > 0) {
      const samples = await query("SELECT id, remote_jid, connection_id FROM conversations WHERE connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections) LIMIT 5");
      console.log('Sample Orphaned:', samples.rows);
    }

    console.log('\n--- Checking Contacts ---');
    const totalContacts = await query("SELECT COUNT(*) FROM chat_contacts");
    const orphanedContacts = await query("SELECT COUNT(*) FROM chat_contacts WHERE connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections)");
    console.log('Total Contacts:', totalContacts.rows[0].count);
    console.log('Orphaned Contacts:', orphanedContacts.rows[0].count);

    console.log('\n--- Checking Messages ---');
    const totalMessages = await query("SELECT COUNT(*) FROM chat_messages");
    const orphanedMessages = await query("SELECT COUNT(*) FROM chat_messages WHERE connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections)");
    console.log('Total Messages:', totalMessages.rows[0].count);
    console.log('Orphaned Messages:', orphanedMessages.rows[0].count);

  } catch (err) {
    console.error('Inspection failed:', err);
  } finally {
    process.exit(0);
  }
}

inspect();

import { query } from './db.js';

async function checkEvents() {
  try {
    const res = await query('SELECT id, connection_id, event_type, status, created_at FROM uazapi_webhook_events ORDER BY created_at DESC LIMIT 10');
    console.log('Last 10 UAZAPI Webhook Events:');
    console.table(res.rows);
    
    const audits = await query('SELECT id, provider, connection_id, event_type, status, processed, process_error FROM inbound_webhook_audit WHERE provider = \'uazapi\' ORDER BY received_at DESC LIMIT 10');
    console.log('Last 10 Inbound Webhook Audits (UAZAPI):');
    console.table(audits.rows);

    const connections = await query('SELECT id, name, provider, status, uazapi_instance_name FROM connections WHERE provider = \'uazapi\'');
    console.log('Active UAZAPI Connections:');
    console.table(connections.rows);

  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    process.exit();
  }
}

checkEvents();

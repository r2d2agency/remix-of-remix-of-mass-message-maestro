import { query } from './src/db.js';

async function fixTable() {
  try {
    console.log('Checking documents table columns...');
    const result = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'documents';
    `);
    
    const columns = result.rows.map(r => r.column_name);
    console.log('Current columns:', columns);

    if (!columns.includes('client_name')) {
      console.log('Adding client_name column...');
      await query('ALTER TABLE documents ADD COLUMN client_name TEXT;');
    }

    if (!columns.includes('client_phone')) {
      console.log('Adding client_phone column...');
      await query('ALTER TABLE documents ADD COLUMN client_phone TEXT;');
    }
    
    if (!columns.includes('deal_id')) {
      console.log('Adding deal_id UUID column...');
      await query('ALTER TABLE documents ADD COLUMN deal_id UUID;');
    }
    
    // Add deleted_at if missing for soft delete
    if (!columns.includes('deleted_at')) {
      console.log('Adding deleted_at column...');
      await query('ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;');
    }

    console.log('Table fixed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error fixing table:', err);
    process.exit(1);
  }
}

fixTable();

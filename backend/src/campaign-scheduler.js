import { query } from './db.js';
import * as whatsappProvider from './lib/whatsapp-provider.js';
// Translation map for common Evolution API errors
const errorTranslations = {
  'not a whatsapp number': 'Número não é WhatsApp',
  'number not on whatsapp': 'Número não é WhatsApp',
  'not on whatsapp': 'Número não é WhatsApp',
  'connection closed': 'Conexão fechada',
  'disconnected': 'Desconectado',
  'instance not connected': 'Instância desconectada',
  'instance not found': 'Instância não encontrada',
  'invalid number': 'Número inválido',
  'number is invalid': 'Número inválido',
  'timeout': 'Tempo esgotado',
  'rate limit': 'Limite de envios excedido',
  'blocked': 'Número bloqueado',
  'chat not found': 'Chat não encontrado',
  'media not found': 'Mídia não encontrada',
  'unauthorized': 'Não autorizado',
  'forbidden': 'Acesso negado',
};

function translateError(error) {
  if (!error) return 'Erro desconhecido';
  const lowerError = error.toLowerCase();
  for (const [key, translation] of Object.entries(errorTranslations)) {
    if (lowerError.includes(key)) {
      return translation;
    }
  }
  return error;
}

// Replace variables in message content
function replaceVariables(text, contact) {
  if (!text) return text;
  
  return text
    .replace(/\{\{nome\}\}/gi, contact.name || '')
    .replace(/\{\{telefone\}\}/gi, contact.phone || '')
    .replace(/\{\{email\}\}/gi, contact.email || '')
    .replace(/\{\{empresa\}\}/gi, contact.company || '')
    .replace(/\{\{cargo\}\}/gi, contact.position || '')
    .replace(/\{\{observacao\}\}/gi, contact.notes || '')
    .replace(/\{\{obs\}\}/gi, contact.notes || '');
}

// Helper to send message via unified WhatsApp provider
async function sendWhatsAppMessage(connection, phone, messageItems, contact) {
  const results = [];
  
  for (const item of messageItems) {
    try {
      const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

      // Support both camelCase (frontend) and snake_case formats
      const mediaUrl = item.mediaUrl || item.media_url;

      // Replace variables in content
      const processedContent = replaceVariables(item.content || item.caption, contact);

      const result = await whatsappProvider.sendMessage(
        connection,
        remoteJid,
        processedContent,
        item.type,
        mediaUrl
      );

      results.push({ success: result.success, item, error: result.error });
      
      // Small delay between items of same message
      if (messageItems.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      console.error('WhatsApp provider error for item:', error);
      results.push({ success: false, item, error: error.message });
    }
  }

  // Message is successful if at least the first item was sent
  const firstResult = results[0];
  return {
    success: firstResult?.success || false,
    error: firstResult?.error,
    results,
  };
}

// Execute pending campaign messages
export async function executeCampaignMessages() {
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    campaignsStarted: 0,
  };

  try {
    // First, auto-start campaigns that have pending messages with scheduled_at <= NOW()
    // and campaign status is 'pending' (scheduled but not started)
    const campaignsToStart = await query(`
      SELECT DISTINCT c.id, c.name
      FROM campaigns c
      JOIN campaign_messages cm ON cm.campaign_id = c.id
      WHERE c.status = 'pending'
        AND cm.status = 'pending'
        AND cm.scheduled_at <= NOW()
    `);

    if (campaignsToStart.rows.length > 0) {
      for (const campaign of campaignsToStart.rows) {
        await query(
          `UPDATE campaigns SET status = 'running', updated_at = NOW() WHERE id = $1`,
          [campaign.id]
        );
        stats.campaignsStarted++;
        console.log(`📤 [CAMPAIGN] Auto-started campaign: ${campaign.name}`);
      }
    }

    // Get pending messages that should be sent now (scheduled_at <= now)
    // Include contact data for variable replacement
    const pendingMessages = await query(`
      SELECT 
        cm.id,
        cm.campaign_id,
        cm.contact_id,
        cm.phone,
        cm.message_id,
        cm.scheduled_at,
        c.status as campaign_status,
        c.connection_id,
        conn.provider,
        conn.api_url,
        conn.api_key,
        conn.instance_name,
        conn.instance_id,
        conn.wapi_token,
        conn.status as connection_status,
        mt.items as message_items,
        co.name as contact_name,
        co.phone as contact_phone,
        co.email as contact_email
      FROM campaign_messages cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN connections conn ON conn.id = c.connection_id
      LEFT JOIN message_templates mt ON mt.id = cm.message_id
      LEFT JOIN contacts co ON co.id = cm.contact_id
      WHERE cm.status = 'pending'
        AND c.status = 'running'
        AND conn.status = 'connected'
        AND cm.scheduled_at <= NOW()
      ORDER BY cm.scheduled_at ASC
      LIMIT 50
    `);

    if (pendingMessages.rows.length === 0) {
      if (stats.campaignsStarted > 0) {
        console.log(`📤 [CAMPAIGN] ${stats.campaignsStarted} campaign(s) started, processing on next cycle.`);
      }
      return stats;
    }

    console.log(`📤 [CAMPAIGN] Found ${pendingMessages.rows.length} messages to process.`);

    for (const msg of pendingMessages.rows) {
      stats.processed++;

      try {
        // Get message items
        const messageItems = msg.message_items || [];
        
        if (messageItems.length === 0) {
          // Mark as failed - no content
          await query(
            `UPDATE campaign_messages 
             SET status = 'failed', error_message = 'Mensagem sem conteúdo', sent_at = NOW()
             WHERE id = $1`,
            [msg.id]
          );
          stats.failed++;
          console.log(`  ✗ [${msg.phone}] Mensagem sem conteúdo`);
          continue;
        }

        // Build connection object with all provider fields
        const connection = {
          provider: msg.provider,
          api_url: msg.api_url,
          api_key: msg.api_key,
          instance_name: msg.instance_name,
          instance_id: msg.instance_id,
          wapi_token: msg.wapi_token,
        };

        // Build contact object for variable replacement
        const contact = {
          name: msg.contact_name || '',
          phone: msg.phone || '',
          email: msg.contact_email || '',
          company: msg.contact_company || '',
          position: msg.contact_position || '',
          notes: msg.contact_notes || '',
        };

        // Send message using unified provider
        const result = await sendWhatsAppMessage(connection, msg.phone, messageItems, contact);

        if (result.success) {
          await query(
            `UPDATE campaign_messages 
             SET status = 'sent', sent_at = NOW()
             WHERE id = $1`,
            [msg.id]
          );
          stats.sent++;
          console.log(`  ✓ [${msg.phone}] Mensagem enviada (${messageItems.length} item(s))`);

          // Update campaign sent_count
          await query(
            `UPDATE campaigns SET sent_count = sent_count + 1, updated_at = NOW() WHERE id = $1`,
            [msg.campaign_id]
          );
        } else {
          const translatedError = translateError(result.error);
          await query(
            `UPDATE campaign_messages 
             SET status = 'failed', error_message = $1, sent_at = NOW()
             WHERE id = $2`,
            [translatedError, msg.id]
          );
          stats.failed++;
          console.log(`  ✗ [${msg.phone}] ${translatedError}`);

          // Update campaign failed_count
          await query(
            `UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1`,
            [msg.campaign_id]
          );
        }
      } catch (error) {
        console.error(`  ✗ [${msg.phone}] Error:`, error);
        const translatedError = translateError(error.message);
        
        await query(
          `UPDATE campaign_messages 
           SET status = 'failed', error_message = $1, sent_at = NOW()
           WHERE id = $2`,
          [translatedError, msg.id]
        );
        stats.failed++;

        await query(
          `UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1`,
          [msg.campaign_id]
        );
      }
    }

    // Check if any campaigns are now complete
    await query(`
      UPDATE campaigns 
      SET status = 'completed', updated_at = NOW()
      WHERE status = 'running'
        AND id IN (
          SELECT campaign_id 
          FROM campaign_messages 
          GROUP BY campaign_id 
          HAVING COUNT(*) FILTER (WHERE status = 'pending') = 0
        )
    `);

    console.log(`📤 [CAMPAIGN] Execution complete:`, stats);
    return stats;
  } catch (error) {
    console.error('📤 [CAMPAIGN] Execution error:', error);
    throw error;
  }
}

import { query } from './db.js';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

// Send message via Evolution API
async function sendEvolutionMessage(connection, phone, content, messageType, mediaUrl) {
  try {
    let endpoint;
    let body;

    if (messageType === 'text') {
      endpoint = `/message/sendText/${connection.instance_name}`;
      body = {
        number: phone,
        text: content,
      };
    } else if (messageType === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${connection.instance_name}`;
      body = {
        number: phone,
        audio: mediaUrl,
        delay: 1200,
      };
    } else {
      // image, video, document
      endpoint = `/message/sendMedia/${connection.instance_name}`;
      body = {
        number: phone,
        mediatype: messageType,
        media: mediaUrl,
      };
      if (content) {
        body.caption = content;
      }
    }

    const response = await fetch(`${connection.api_url}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: connection.api_key,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to send message');
    }

    const result = await response.json();
    return { success: true, messageId: result.key?.id };
  } catch (error) {
    console.error('Evolution API error:', error);
    return { success: false, error: error.message };
  }
}

// Main function to execute scheduled messages
export async function executeScheduledMessages() {
  console.log('📅 [CRON] Checking scheduled messages...');
  
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
  };

  try {
    // Get all pending scheduled messages that are due
    const pendingMessages = await query(`
      SELECT 
        sm.*,
        conv.remote_jid,
        conn.api_url,
        conn.api_key,
        conn.instance_name,
        conn.status as connection_status
      FROM scheduled_messages sm
      JOIN conversations conv ON conv.id = sm.conversation_id
      JOIN connections conn ON conn.id = sm.connection_id
      WHERE sm.status = 'pending'
        AND sm.scheduled_at <= NOW()
      ORDER BY sm.scheduled_at ASC
      LIMIT 50
    `);

    if (pendingMessages.rows.length === 0) {
      console.log('📅 [CRON] No scheduled messages to send');
      return stats;
    }

    console.log(`📅 [CRON] Found ${pendingMessages.rows.length} scheduled messages to send`);

    for (const msg of pendingMessages.rows) {
      stats.processed++;

      // Check if connection is still active
      if (msg.connection_status !== 'connected') {
        console.log(`  ⚠ Connection not active for message ${msg.id}, marking as failed`);
        await query(
          `UPDATE scheduled_messages 
           SET status = 'failed', error_message = 'Conexão não está ativa', updated_at = NOW() 
           WHERE id = $1`,
          [msg.id]
        );
        stats.failed++;
        continue;
      }

      // Send the message
      const connection = {
        api_url: msg.api_url,
        api_key: msg.api_key,
        instance_name: msg.instance_name,
      };

      const result = await sendEvolutionMessage(
        connection,
        msg.remote_jid,
        msg.content,
        msg.message_type,
        msg.media_url
      );

      if (result.success) {
        // Update scheduled message as sent
        await query(
          `UPDATE scheduled_messages 
           SET status = 'sent', sent_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
          [msg.id]
        );

        // Save message to chat_messages
        await query(
          `INSERT INTO chat_messages 
            (conversation_id, message_id, from_me, sender_id, content, message_type, media_url, media_mimetype, status, timestamp)
           VALUES ($1, $2, true, $3, $4, $5, $6, $7, 'sent', NOW())`,
          [
            msg.conversation_id,
            result.messageId || null,
            msg.sender_id,
            msg.content,
            msg.message_type,
            msg.media_url,
            msg.media_mimetype,
          ]
        );

        // Update conversation last_message_at
        await query(
          `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [msg.conversation_id]
        );

        // Create alert for user about sent scheduled message
        const convInfo = await query(
          `SELECT contact_name, contact_phone FROM conversations WHERE id = $1`,
          [msg.conversation_id]
        );
        const contactName = convInfo.rows[0]?.contact_name || convInfo.rows[0]?.contact_phone || 'Contato';
        
        await query(
          `INSERT INTO user_alerts (user_id, type, title, message, metadata)
           VALUES ($1, 'scheduled_message_sent', $2, $3, $4)`,
          [
            msg.sender_id,
            '📅 Mensagem agendada enviada',
            `Mensagem enviada para ${contactName}`,
            JSON.stringify({
              conversation_id: msg.conversation_id,
              scheduled_message_id: msg.id,
              message_preview: msg.content?.substring(0, 100),
            })
          ]
        );

        stats.sent++;
        console.log(`  ✓ Sent scheduled message ${msg.id}`);
      } else {
        await query(
          `UPDATE scheduled_messages 
           SET status = 'failed', error_message = $1, updated_at = NOW() 
           WHERE id = $2`,
          [result.error || 'Unknown error', msg.id]
        );
        stats.failed++;
        console.log(`  ✗ Failed to send scheduled message ${msg.id}: ${result.error}`);
      }

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`📅 [CRON] Scheduled messages execution complete:`, stats);
    return stats;
  } catch (error) {
    console.error('📅 [CRON] Scheduled messages execution error:', error);
    throw error;
  }
}

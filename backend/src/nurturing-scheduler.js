import { query } from './db.js';
import * as whatsappProvider from './lib/whatsapp-provider.js';
import nodemailer from 'nodemailer';
import { log, logError } from './logger.js';

/**
 * Nurturing Sequence Scheduler
 * Executes pending nurturing steps automatically based on delay configuration
 */

// Calculate next step time based on delay
function calculateNextStepTime(delayValue, delayUnit) {
  const now = new Date();
  switch (delayUnit) {
    case 'minutes':
      return new Date(now.getTime() + delayValue * 60 * 1000);
    case 'hours':
      return new Date(now.getTime() + delayValue * 60 * 60 * 1000);
    case 'days':
    default:
      return new Date(now.getTime() + delayValue * 24 * 60 * 60 * 1000);
  }
}

// Replace template variables in content
function replaceVariables(content, variables) {
  if (!content) return content;
  let result = content;
  for (const [key, value] of Object.entries(variables || {})) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }
  // Also handle common variables
  result = result.replace(/\{nome\}/gi, variables?.nome || variables?.contact_name || '');
  result = result.replace(/\{telefone\}/gi, variables?.telefone || variables?.contact_phone || '');
  result = result.replace(/\{email\}/gi, variables?.email || variables?.contact_email || '');
  return result;
}

// Send WhatsApp message
async function sendWhatsAppStep(enrollment, step, connection) {
  const content = replaceVariables(step.whatsapp_content, {
    ...enrollment.variables,
    nome: enrollment.contact_name,
    telefone: enrollment.contact_phone,
    email: enrollment.contact_email,
  });

  const result = await whatsappProvider.sendMessage(
    connection,
    enrollment.contact_phone,
    content,
    step.whatsapp_media_url ? 'media' : 'text',
    step.whatsapp_media_url
  );

  return result;
}

// Send Email
async function sendEmailStep(enrollment, step, smtpConfig) {
  const variables = {
    ...enrollment.variables,
    nome: enrollment.contact_name,
    telefone: enrollment.contact_phone,
    email: enrollment.contact_email,
  };

  const subject = replaceVariables(step.email_subject, variables);
  const body = replaceVariables(step.email_body, variables);

  // Create transporter with SMTP config
  const transportConfig = {
    host: smtpConfig.smtp_host,
    port: smtpConfig.smtp_port,
    secure: smtpConfig.smtp_secure,
    auth: {
      user: smtpConfig.smtp_user,
      pass: smtpConfig.smtp_pass,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
  };

  // Handle STARTTLS (port 587 typically)
  if (!smtpConfig.smtp_secure && smtpConfig.smtp_port === 587) {
    transportConfig.secure = false;
    transportConfig.requireTLS = true;
  }

  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from: smtpConfig.from_email || smtpConfig.smtp_user,
    to: enrollment.contact_email,
    subject: subject,
    html: body,
  });

  return { success: true };
}

// Get SMTP config for organization
async function getSmtpConfig(organizationId) {
  const result = await query(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email
     FROM email_settings
     WHERE organization_id = $1 AND is_active = true
     LIMIT 1`,
    [organizationId]
  );
  return result.rows[0] || null;
}

// Get WhatsApp connection for organization
async function getWhatsAppConnection(organizationId) {
  const result = await query(
    `SELECT 
       id, provider, api_url, api_key, instance_name, 
       instance_id, wapi_token, status
     FROM connections
     WHERE organization_id = $1 
       AND (status = 'connected' OR (instance_id IS NOT NULL AND wapi_token IS NOT NULL))
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId]
  );
  return result.rows[0] || null;
}

// Check if contact has replied (for pause_on_reply logic)
async function hasContactReplied(enrollmentId, conversationId, enrolledAt) {
  if (!conversationId) return false;

  const result = await query(
    `SELECT COUNT(*) as count
     FROM chat_messages
     WHERE conversation_id = $1
       AND from_me = false
       AND timestamp > $2`,
    [conversationId, enrolledAt]
  );

  return parseInt(result.rows[0]?.count || 0) > 0;
}

// Main execution function
export async function executeNurturingSteps() {
  log('info', 'nurturing.scheduler.start');

  const stats = {
    processed: 0,
    sent: 0,
    skipped: 0,
    paused: 0,
    completed: 0,
    failed: 0,
  };

  try {
    // Get all active enrollments that are due for next step
    const pendingEnrollments = await query(`
      SELECT 
        e.*,
        s.name as sequence_name,
        s.is_active as sequence_active,
        s.pause_on_reply,
        s.exit_on_reply
      FROM nurturing_enrollments e
      JOIN nurturing_sequences s ON s.id = e.sequence_id
      WHERE e.status = 'active'
        AND e.next_step_at IS NOT NULL
        AND e.next_step_at <= NOW()
        AND s.is_active = true
      ORDER BY e.next_step_at ASC
      LIMIT 50
    `);

    if (pendingEnrollments.rows.length === 0) {
      log('info', 'nurturing.scheduler.no_pending');
      return stats;
    }

    log('info', 'nurturing.scheduler.found_pending', { count: pendingEnrollments.rows.length });

    for (const enrollment of pendingEnrollments.rows) {
      stats.processed++;

      try {
        // Check if contact has replied (should we pause?)
        if (enrollment.pause_on_reply) {
          const replied = await hasContactReplied(
            enrollment.id,
            enrollment.conversation_id,
            enrollment.enrolled_at
          );

          if (replied) {
            if (enrollment.exit_on_reply) {
              // Exit sequence entirely
              await query(
                `UPDATE nurturing_enrollments
                 SET status = 'exited', pause_reason = 'replied', updated_at = NOW()
                 WHERE id = $1`,
                [enrollment.id]
              );
              stats.paused++;
              log('info', 'nurturing.enrollment.exited', { 
                enrollment_id: enrollment.id, 
                reason: 'contact_replied' 
              });
              continue;
            } else {
              // Pause enrollment
              await query(
                `UPDATE nurturing_enrollments
                 SET status = 'paused', pause_reason = 'replied', paused_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [enrollment.id]
              );
              stats.paused++;
              log('info', 'nurturing.enrollment.paused', { 
                enrollment_id: enrollment.id, 
                reason: 'contact_replied' 
              });
              continue;
            }
          }
        }

        // Get the next step to execute
        const nextStepNum = enrollment.current_step + 1;
        const stepResult = await query(
          `SELECT * FROM nurturing_sequence_steps
           WHERE sequence_id = $1 AND step_order = $2`,
          [enrollment.sequence_id, nextStepNum]
        );

        if (stepResult.rows.length === 0) {
          // No more steps - mark as completed
          await query(
            `UPDATE nurturing_enrollments
             SET status = 'completed', completed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [enrollment.id]
          );

          // Update sequence stats
          await query(
            `UPDATE nurturing_sequences
             SET contacts_completed = contacts_completed + 1, updated_at = NOW()
             WHERE id = $1`,
            [enrollment.sequence_id]
          );

          stats.completed++;
          log('info', 'nurturing.enrollment.completed', { enrollment_id: enrollment.id });
          continue;
        }

        const step = stepResult.rows[0];

        // Check skip_if_replied for this specific step
        if (step.skip_if_replied && enrollment.conversation_id) {
          const replied = await hasContactReplied(
            enrollment.id,
            enrollment.conversation_id,
            enrollment.enrolled_at
          );

          if (replied) {
            // Skip this step, move to next
            const nextStep = await query(
              `SELECT * FROM nurturing_sequence_steps
               WHERE sequence_id = $1 AND step_order = $2`,
              [enrollment.sequence_id, nextStepNum + 1]
            );

            if (nextStep.rows.length === 0) {
              // No more steps
              await query(
                `UPDATE nurturing_enrollments
                 SET status = 'completed', completed_at = NOW(), current_step = $1, updated_at = NOW()
                 WHERE id = $2`,
                [nextStepNum, enrollment.id]
              );
              stats.completed++;
            } else {
              // Schedule next step
              const nextTime = calculateNextStepTime(nextStep.rows[0].delay_value, nextStep.rows[0].delay_unit);
              await query(
                `UPDATE nurturing_enrollments
                 SET current_step = $1, next_step_at = $2, updated_at = NOW()
                 WHERE id = $3`,
                [nextStepNum, nextTime, enrollment.id]
              );
            }

            // Log skipped step
            await query(
              `INSERT INTO nurturing_step_logs
                (enrollment_id, step_id, channel, status, created_at)
               VALUES ($1, $2, $3, 'skipped', NOW())`,
              [enrollment.id, step.id, step.channel]
            );

            stats.skipped++;
            log('info', 'nurturing.step.skipped', { 
              enrollment_id: enrollment.id, 
              step_id: step.id,
              reason: 'skip_if_replied'
            });
            continue;
          }
        }

        // Execute the step based on channel
        let sendResult = { success: false, error: 'Unknown channel' };

        if (step.channel === 'whatsapp') {
          // Need WhatsApp connection and phone number
          if (!enrollment.contact_phone) {
            sendResult = { success: false, error: 'No phone number' };
          } else {
            const connection = await getWhatsAppConnection(enrollment.organization_id);
            if (!connection) {
              sendResult = { success: false, error: 'No active WhatsApp connection' };
            } else {
              sendResult = await sendWhatsAppStep(enrollment, step, connection);
            }
          }
        } else if (step.channel === 'email') {
          // Need SMTP config and email address
          if (!enrollment.contact_email) {
            sendResult = { success: false, error: 'No email address' };
          } else {
            const smtpConfig = await getSmtpConfig(enrollment.organization_id);
            if (!smtpConfig) {
              sendResult = { success: false, error: 'No SMTP configuration' };
            } else {
              try {
                sendResult = await sendEmailStep(enrollment, step, smtpConfig);
              } catch (emailErr) {
                sendResult = { success: false, error: emailErr.message };
              }
            }
          }
        }

        // Log the step execution
        await query(
          `INSERT INTO nurturing_step_logs
            (enrollment_id, step_id, channel, status, error_message, sent_at, message_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            enrollment.id,
            step.id,
            step.channel,
            sendResult.success ? 'sent' : 'failed',
            sendResult.success ? null : sendResult.error,
            sendResult.success ? new Date() : null,
            sendResult.messageId || null,
          ]
        );

        if (sendResult.success) {
          // Update step stats
          await query(
            `UPDATE nurturing_sequence_steps
             SET sent_count = sent_count + 1, updated_at = NOW()
             WHERE id = $1`,
            [step.id]
          );

          // Calculate next step time
          const nextStep = await query(
            `SELECT * FROM nurturing_sequence_steps
             WHERE sequence_id = $1 AND step_order = $2`,
            [enrollment.sequence_id, nextStepNum + 1]
          );

          if (nextStep.rows.length === 0) {
            // Last step executed - mark as completed
            await query(
              `UPDATE nurturing_enrollments
               SET status = 'completed', current_step = $1, completed_at = NOW(), 
                   last_activity_at = NOW(), next_step_at = NULL, updated_at = NOW()
               WHERE id = $2`,
              [nextStepNum, enrollment.id]
            );

            await query(
              `UPDATE nurturing_sequences
               SET contacts_completed = contacts_completed + 1, updated_at = NOW()
               WHERE id = $1`,
              [enrollment.sequence_id]
            );

            stats.completed++;
          } else {
            // Schedule next step
            const nextTime = calculateNextStepTime(nextStep.rows[0].delay_value, nextStep.rows[0].delay_unit);
            await query(
              `UPDATE nurturing_enrollments
               SET current_step = $1, next_step_at = $2, last_activity_at = NOW(), updated_at = NOW()
               WHERE id = $3`,
              [nextStepNum, nextTime, enrollment.id]
            );
          }

          stats.sent++;
          log('info', 'nurturing.step.sent', { 
            enrollment_id: enrollment.id, 
            step_id: step.id,
            channel: step.channel
          });
        } else {
          stats.failed++;
          log('warn', 'nurturing.step.failed', { 
            enrollment_id: enrollment.id, 
            step_id: step.id,
            error: sendResult.error
          });

          // Don't block progression on failure - schedule retry or move to next
          // For now, we'll retry the same step after 1 hour
          const retryTime = new Date(Date.now() + 60 * 60 * 1000);
          await query(
            `UPDATE nurturing_enrollments
             SET next_step_at = $1, updated_at = NOW()
             WHERE id = $2`,
            [retryTime, enrollment.id]
          );
        }

        // Small delay between executions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (enrollmentError) {
        logError('nurturing.enrollment.error', enrollmentError, { 
          enrollment_id: enrollment.id 
        });
        stats.failed++;
      }
    }

    log('info', 'nurturing.scheduler.complete', stats);
    return stats;
  } catch (error) {
    logError('nurturing.scheduler.error', error);
    throw error;
  }
}

// Check for new enrollments that need their first step scheduled
export async function scheduleNewEnrollments() {
  try {
    // Find enrollments that have current_step = 0 and no next_step_at
    const newEnrollments = await query(`
      SELECT e.id, e.sequence_id
      FROM nurturing_enrollments e
      JOIN nurturing_sequences s ON s.id = e.sequence_id
      WHERE e.status = 'active'
        AND e.current_step = 0
        AND e.next_step_at IS NULL
        AND s.is_active = true
    `);

    for (const enrollment of newEnrollments.rows) {
      // Get first step
      const stepResult = await query(
        `SELECT delay_value, delay_unit FROM nurturing_sequence_steps
         WHERE sequence_id = $1 AND step_order = 1`,
        [enrollment.sequence_id]
      );

      if (stepResult.rows.length > 0) {
        const step = stepResult.rows[0];
        const nextTime = calculateNextStepTime(step.delay_value, step.delay_unit);

        await query(
          `UPDATE nurturing_enrollments
           SET next_step_at = $1, updated_at = NOW()
           WHERE id = $2`,
          [nextTime, enrollment.id]
        );

        log('info', 'nurturing.enrollment.scheduled', { 
          enrollment_id: enrollment.id,
          next_step_at: nextTime.toISOString()
        });
      }
    }
  } catch (error) {
    logError('nurturing.schedule_new.error', error);
  }
}

// Combined scheduler function called by cron
export async function executeNurturing() {
  console.log('🔄 [CRON] Nurturing scheduler triggered at', new Date().toISOString());
  
  try {
    // First, schedule any new enrollments
    await scheduleNewEnrollments();
    
    // Then execute pending steps
    const stats = await executeNurturingSteps();
    
    console.log('🔄 [CRON] Nurturing execution complete:', stats);
    return stats;
  } catch (error) {
    console.error('🔄 [CRON] Nurturing scheduler error:', error);
    throw error;
  }
}

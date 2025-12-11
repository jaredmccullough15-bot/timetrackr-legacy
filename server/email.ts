// Outlook Email Service using Microsoft Graph API
// Integration: connection:conn_outlook_01K8764P37X5Z5ACWXK9S117JF

import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

async function getOutlookClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const client = await getOutlookClient();
    
    const message = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content: options.body
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to
          }
        }
      ]
    };

    await client.api('/me/sendMail').post({
      message,
      saveToSentItems: true
    });

    console.log(`Email sent successfully to ${options.to}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function sendPtoRequestNotification(
  managerEmails: string[],
  employeeName: string,
  startDate: string,
  endDate: string,
  hours: string
): Promise<void> {
  const subject = `PTO Request from ${employeeName}`;
  const body = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>New PTO Request</h2>
        <p><strong>${employeeName}</strong> has submitted a PTO request:</p>
        <ul>
          <li><strong>Dates:</strong> ${startDate} - ${endDate}</li>
          <li><strong>Hours Requested:</strong> ${hours}</li>
        </ul>
        <p>Please log in to the time clock system to review and approve or deny this request.</p>
      </body>
    </html>
  `;

  for (const email of managerEmails) {
    if (email) {
      await sendEmail({ to: email, subject, body });
    }
  }
}

export async function sendPtoDecisionNotification(
  employeeEmail: string,
  employeeName: string,
  status: 'approved' | 'denied',
  startDate: string,
  endDate: string,
  hours: string,
  reviewerName: string
): Promise<void> {
  if (!employeeEmail) {
    console.log('Employee has no email address, skipping notification');
    return;
  }

  const statusText = status === 'approved' ? 'Approved' : 'Denied';
  const statusColor = status === 'approved' ? '#22c55e' : '#ef4444';
  
  const subject = `Your PTO Request has been ${statusText}`;
  const body = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: ${statusColor};">PTO Request ${statusText}</h2>
        <p>Hi ${employeeName},</p>
        <p>Your PTO request has been <strong style="color: ${statusColor};">${status}</strong> by ${reviewerName}.</p>
        <ul>
          <li><strong>Dates:</strong> ${startDate} - ${endDate}</li>
          <li><strong>Hours:</strong> ${hours}</li>
        </ul>
        ${status === 'approved' 
          ? '<p>The hours have been deducted from your PTO balance. Enjoy your time off!</p>' 
          : '<p>If you have questions about this decision, please speak with your manager.</p>'
        }
      </body>
    </html>
  `;

  await sendEmail({ to: employeeEmail, subject, body });
}

// Email utility — uses Resend HTTP API (SMTP is blocked on Railway)
// Fallback: logs to console if RESEND_API_KEY is not set

const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'Skill Next Door <onboarding@resend.dev>';

    if (!apiKey) {
        console.log(`[Email] Would send to: ${to}`);
        console.log(`[Email] Subject: ${subject}`);
        console.log(`[Email] Body: ${text || html}`);
        return { messageId: 'console-only' };
    }

    try {
        const response = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from, to, subject, html, text }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`[Email] Failed to send to ${to}:`, data.message || JSON.stringify(data));
            return null;
        }

        console.log(`[Email] Sent to ${to}: ${data.id}`);
        return { messageId: data.id };
    } catch (error) {
        console.error(`[Email] Failed to send to ${to}:`, error.message);
        return null;
    }
}

// --- Template Functions ---

async function sendCoachApprovedEmail(coachEmail, coachName) {
    return sendEmail({
        to: coachEmail,
        subject: 'Your Skill Next Door profile is now live!',
        html: `
            <h2>Congratulations, ${coachName}!</h2>
            <p>Your coach profile has been reviewed and approved by our team.</p>
            <p>Your profile is now visible to learners searching on Skill Next Door.</p>
            <p>You'll receive an email notification when a learner sends you a booking request.</p>
            <br>
            <p>— The Skill Next Door Team</p>
        `,
        text: `Congratulations, ${coachName}! Your coach profile has been approved and is now live on Skill Next Door.`,
    });
}

async function sendCoachRejectedEmail(coachEmail, coachName) {
    return sendEmail({
        to: coachEmail,
        subject: 'Skill Next Door profile update',
        html: `
            <h2>Hi ${coachName},</h2>
            <p>We've reviewed your coach profile application and unfortunately we're unable to approve it at this time.</p>
            <p>If you believe this was in error, please contact our support team.</p>
            <br>
            <p>— The Skill Next Door Team</p>
        `,
        text: `Hi ${coachName}, we've reviewed your coach profile and are unable to approve it at this time.`,
    });
}

async function sendContactRequestToCoach(coachEmail, coachName, requestData) {
    const { learnerName, learnerEmail, message, preferredMode, preferredDays, preferredTimes, preferredSuburb } = requestData;
    const days = JSON.parse(preferredDays || '[]').join(', ') || 'Not specified';
    const times = JSON.parse(preferredTimes || '[]').join(', ') || 'Not specified';

    return sendEmail({
        to: coachEmail,
        subject: `New booking request from ${learnerName}`,
        html: `
            <h2>Hi ${coachName},</h2>
            <p>You have a new booking request on Skill Next Door!</p>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; font-weight: bold;">From:</td><td style="padding: 8px;">${learnerName}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${learnerEmail}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Session type:</td><td style="padding: 8px;">${preferredMode || 'Either'}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Preferred days:</td><td style="padding: 8px;">${days}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Preferred times:</td><td style="padding: 8px;">${times}</td></tr>
                ${preferredSuburb ? `<tr><td style="padding: 8px; font-weight: bold;">Location:</td><td style="padding: 8px;">${preferredSuburb}</td></tr>` : ''}
            </table>
            <h3>Message:</h3>
            <p>${message || 'No message provided.'}</p>
            <br>
            <p>Please respond to the learner directly at <a href="mailto:${learnerEmail}">${learnerEmail}</a>.</p>
            <p>— The Skill Next Door Team</p>
        `,
        text: `New booking request from ${learnerName} (${learnerEmail}). Message: ${message}`,
    });
}

async function sendContactConfirmationToLearner(learnerEmail, learnerName, coachName) {
    return sendEmail({
        to: learnerEmail,
        subject: `Your booking request to ${coachName} has been sent`,
        html: `
            <h2>Hi ${learnerName},</h2>
            <p>Your booking request to <strong>${coachName}</strong> has been sent successfully!</p>
            <p>The coach will review your request and get back to you via email.</p>
            <br>
            <p>— The Skill Next Door Team</p>
        `,
        text: `Hi ${learnerName}, your booking request to ${coachName} has been sent. The coach will respond via email.`,
    });
}

async function sendNewMessageNotification(toEmail, recipientName, senderName, count, threadLink) {
    const plural = count > 1 ? `${count} new messages` : 'a new message';
    return sendEmail({
        to: toEmail,
        subject: `New message from ${senderName} on Skill Next Door`,
        html: `
            <h2>Hi ${recipientName},</h2>
            <p>You have ${plural} from <strong>${senderName}</strong> on Skill Next Door.</p>
            <p style="margin: 24px 0;">
                <a href="${threadLink}" style="background-color: #4C6444; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">View conversation</a>
            </p>
            <p style="color: #62665D;">You're receiving this because you haven't opened the conversation yet.</p>
            <br>
            <p>— The Skill Next Door Team</p>
        `,
        text: `Hi ${recipientName}, you have ${plural} from ${senderName} on Skill Next Door. View it: ${threadLink}`,
    });
}

async function sendNewApplicationNotification(coachName, coachEmail) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;

    return sendEmail({
        to: adminEmail,
        subject: `New coach application: ${coachName}`,
        html: `
            <h2>New Coach Application</h2>
            <p><strong>${coachName}</strong> (${coachEmail}) has submitted a coach application.</p>
            <p>Please review it in the admin panel.</p>
        `,
        text: `New coach application from ${coachName} (${coachEmail}). Please review in admin panel.`,
    });
}

async function sendVerificationEmail(userEmail, userName, verificationLink) {
    return sendEmail({
        to: userEmail,
        subject: 'Verify your Skill Next Door email',
        html: `
            <h2>Hi ${userName},</h2>
            <p>Thanks for signing up to Skill Next Door! Please verify your email address by clicking the button below.</p>
            <p style="margin: 24px 0;">
                <a href="${verificationLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Verify Email</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6366f1;">${verificationLink}</p>
            <p>This link expires in 24 hours.</p>
            <br>
            <p>— The Skill Next Door Team</p>
        `,
        text: `Hi ${userName}, verify your email by visiting: ${verificationLink} — this link expires in 24 hours.`,
    });
}

module.exports = {
    sendEmail,
    sendCoachApprovedEmail,
    sendCoachRejectedEmail,
    sendContactRequestToCoach,
    sendContactConfirmationToLearner,
    sendNewMessageNotification,
    sendNewApplicationNotification,
    sendVerificationEmail,
};

// Throttled email notifications for unread messages.
// A periodic sweep emails the recipient only if a message has stayed unread
// past MESSAGE_EMAIL_DELAY_MINUTES — so a quick back-and-forth never spams.
// Survives restarts (state lives in Message.notifiedAt), batches per thread.

const prisma = require('./prisma');
const { sendNewMessageNotification } = require('./email');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://skillnextdoor.com';
const THRESHOLD_MIN = parseInt(process.env.MESSAGE_EMAIL_DELAY_MINUTES, 10) || 12;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

async function sweepUnreadMessageNotifications() {
    try {
        const cutoff = new Date(Date.now() - THRESHOLD_MIN * 60 * 1000);
        const pending = await prisma.message.findMany({
            where: { readAt: null, notifiedAt: null, createdAt: { lte: cutoff } },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: { select: { name: true } },
                contactRequest: {
                    select: {
                        id: true,
                        learnerName: true,
                        learnerEmail: true,
                        coachProfile: { select: { email: true, user: { select: { name: true, email: true } } } },
                    },
                },
            },
        });
        if (pending.length === 0) return;

        // Group by thread + sender role → one email per thread to the opposite party
        const groups = new Map();
        for (const m of pending) {
            const key = `${m.contactRequestId}:${m.senderRole}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(m);
        }

        for (const msgs of groups.values()) {
            const cr = msgs[0].contactRequest;
            const ids = msgs.map((m) => m.id);
            if (cr) {
                let toEmail, recipientName;
                if (msgs[0].senderRole === 'LEARNER') {
                    toEmail = cr.coachProfile?.email || cr.coachProfile?.user?.email;
                    recipientName = cr.coachProfile?.user?.name || 'there';
                } else {
                    toEmail = cr.learnerEmail;
                    recipientName = cr.learnerName || 'there';
                }
                const senderName = msgs[0].sender?.name || 'Someone';
                const link = `${FRONTEND_URL}/messages?c=${cr.id}`;
                try {
                    if (toEmail) await sendNewMessageNotification(toEmail, recipientName, senderName, msgs.length, link);
                } catch (e) {
                    console.error('Message notification email failed:', e.message);
                }
            }
            // Mark notified (best-effort) so we never re-email the same messages
            await prisma.message.updateMany({ where: { id: { in: ids } }, data: { notifiedAt: new Date() } });
        }
    } catch (e) {
        console.error('sweepUnreadMessageNotifications error:', e.message);
    }
}

function startMessageNotificationSweep() {
    setTimeout(sweepUnreadMessageNotifications, 30 * 1000); // first pass shortly after boot
    setInterval(sweepUnreadMessageNotifications, SWEEP_INTERVAL_MS);
    console.log(`Message notifications: sweep every ${SWEEP_INTERVAL_MS / 60000} min, threshold ${THRESHOLD_MIN} min`);
}

module.exports = { startMessageNotificationSweep, sweepUnreadMessageNotifications };

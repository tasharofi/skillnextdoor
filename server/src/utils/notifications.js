const prisma = require('./prisma');

// Create an in-app notification (best-effort; never throws to the caller).
async function createNotification(userId, { type, title, body = '', link = '' }) {
    if (!userId) return null;
    try {
        return await prisma.notification.create({ data: { userId, type, title, body, link } });
    } catch (e) {
        console.error('createNotification failed:', e.message);
        return null;
    }
}

module.exports = { createNotification };

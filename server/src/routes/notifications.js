const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — unified feed: unread messages + system alerts
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        // Recent conversation threads (as coach or learner)
        const threads = await prisma.contactRequest.findMany({
            where: { OR: [{ learnerUserId: userId }, { coachProfile: { userId } }] },
            include: {
                coachProfile: { select: { userId: true, user: { select: { name: true } } } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
            orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
            take: 10,
        });

        const shownIds = threads.map((t) => t.id);
        const unreadGroups = shownIds.length
            ? await prisma.message.groupBy({
                by: ['contactRequestId'],
                where: { contactRequestId: { in: shownIds }, readAt: null, senderUserId: { not: userId } },
                _count: { _all: true },
            })
            : [];
        const unreadMap = Object.fromEntries(unreadGroups.map((g) => [g.contactRequestId, g._count._all]));

        // Total unread messages across all my threads (for the badge)
        const allThreads = await prisma.contactRequest.findMany({
            where: { OR: [{ learnerUserId: userId }, { coachProfile: { userId } }] },
            select: { id: true },
        });
        const allIds = allThreads.map((t) => t.id);
        const unreadMessages = allIds.length
            ? await prisma.message.count({ where: { contactRequestId: { in: allIds }, readAt: null, senderUserId: { not: userId } } })
            : 0;

        const messageItems = threads
            .filter((t) => t.messages[0])
            .map((t) => {
                const iAmCoach = t.coachProfile?.userId === userId;
                const last = t.messages[0];
                return {
                    kind: 'message',
                    id: t.id,
                    title: iAmCoach ? t.learnerName : t.coachProfile?.user?.name || 'Coach',
                    preview: (last.senderUserId === userId ? 'You: ' : '') + last.body,
                    time: t.lastMessageAt || t.createdAt,
                    unread: (unreadMap[t.id] || 0) > 0,
                    link: `/dashboard?c=${t.id}`,
                };
            });

        const alerts = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 15,
        });
        const unreadAlerts = await prisma.notification.count({ where: { userId, readAt: null } });

        const alertItems = alerts.map((n) => ({
            kind: 'alert',
            id: n.id,
            type: n.type,
            title: n.title,
            preview: n.body,
            time: n.createdAt,
            unread: !n.readAt,
            link: n.link || '',
        }));

        const items = [...messageItems, ...alertItems]
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, 12);

        res.json({ unread: unreadMessages + unreadAlerts, items });
    } catch (error) {
        console.error('Notifications feed error:', error);
        res.json({ unread: 0, items: [] });
    }
});

// POST /api/notifications/:id/read — mark one alert read
router.post('/:id/read', authenticate, async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { id: req.params.id, userId: req.user.id, readAt: null },
            data: { readAt: new Date() },
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// POST /api/notifications/read-all — mark all alerts read
router.post('/read-all', authenticate, async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.id, readAt: null },
            data: { readAt: new Date() },
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

module.exports = router;

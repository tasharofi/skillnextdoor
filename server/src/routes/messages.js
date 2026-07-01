const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Load a thread (ContactRequest) and resolve the requesting user's role in it.
// Returns { thread, role, isCoach, isLearner } or { status, error }.
async function loadThreadForUser(threadId, user) {
    const thread = await prisma.contactRequest.findUnique({
        where: { id: threadId },
        include: {
            coachProfile: {
                select: {
                    userId: true, headline: true, hourlyRate: true, suburb: true, state: true, sessionMode: true,
                    user: { select: { name: true, slug: true } },
                },
            },
        },
    });
    if (!thread) return { status: 404, error: 'Conversation not found' };

    const isLearner = !!thread.learnerUserId && thread.learnerUserId === user.id;
    const isCoach = thread.coachProfile?.userId === user.id;
    if (!isLearner && !isCoach) return { status: 403, error: 'Not allowed' };

    return { thread, role: isCoach ? 'COACH' : 'LEARNER', isCoach, isLearner };
}

// GET /api/messages/unread-count — total unread messages addressed to me
router.get('/unread-count', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const threads = await prisma.contactRequest.findMany({
            where: { OR: [{ learnerUserId: userId }, { coachProfile: { userId } }] },
            select: { id: true },
        });
        const ids = threads.map((t) => t.id);
        const count = ids.length
            ? await prisma.message.count({
                where: { contactRequestId: { in: ids }, readAt: null, senderUserId: { not: userId } },
            })
            : 0;
        res.json({ count });
    } catch (error) {
        console.error('Unread count error:', error);
        res.json({ count: 0 });
    }
});

// GET /api/messages/threads — my conversations (as coach or learner)
router.get('/threads', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const threads = await prisma.contactRequest.findMany({
            where: { OR: [{ learnerUserId: userId }, { coachProfile: { userId } }] },
            include: {
                coachProfile: {
                    select: {
                        userId: true, headline: true, hourlyRate: true, suburb: true, state: true,
                        user: { select: { name: true, slug: true } },
                    },
                },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
            orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        });

        const ids = threads.map((t) => t.id);
        const unreadGroups = ids.length
            ? await prisma.message.groupBy({
                by: ['contactRequestId'],
                where: { contactRequestId: { in: ids }, readAt: null, senderUserId: { not: userId } },
                _count: { _all: true },
            })
            : [];
        const unreadMap = Object.fromEntries(unreadGroups.map((g) => [g.contactRequestId, g._count._all]));

        // Which threads the current user has sent at least one message in (for status labels)
        const mineGroups = ids.length
            ? await prisma.message.groupBy({
                by: ['contactRequestId'],
                where: { contactRequestId: { in: ids }, senderUserId: userId },
                _count: { _all: true },
            })
            : [];
        const mineSet = new Set(mineGroups.map((g) => g.contactRequestId));

        const result = threads.map((t) => {
            const iAmCoach = t.coachProfile?.userId === userId;
            const last = t.messages[0] || null;
            return {
                id: t.id,
                role: iAmCoach ? 'COACH' : 'LEARNER',
                otherName: iAmCoach ? t.learnerName : t.coachProfile?.user?.name || 'Coach',
                coachSlug: t.coachProfile?.user?.slug || null,
                headline: t.coachProfile?.headline || '',
                rate: t.coachProfile?.hourlyRate || 0,
                sessionMode: t.preferredMode || 'EITHER',
                suburb: t.preferredSuburb || t.coachProfile?.suburb || '',
                status: t.status,
                iHaveReplied: mineSet.has(t.id),
                lastMessageAt: t.lastMessageAt || t.createdAt,
                lastMessage: last
                    ? { body: last.body, createdAt: last.createdAt, fromMe: last.senderUserId === userId }
                    : null,
                unread: unreadMap[t.id] || 0,
            };
        });

        res.json({ threads: result });
    } catch (error) {
        console.error('List threads error:', error);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
});

// GET /api/messages/threads/:id — full conversation (marks incoming as read)
router.get('/threads/:id', authenticate, async (req, res) => {
    try {
        const loaded = await loadThreadForUser(req.params.id, req.user);
        if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });
        const { thread, role } = loaded;

        const messages = await prisma.message.findMany({
            where: { contactRequestId: thread.id },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, name: true, avatar: true } } },
        });

        // Mark messages addressed to me as read
        await prisma.message.updateMany({
            where: { contactRequestId: thread.id, readAt: null, senderUserId: { not: req.user.id } },
            data: { readAt: new Date() },
        });

        res.json({
            thread: {
                id: thread.id,
                role,
                status: thread.status,
                otherName: role === 'COACH' ? thread.learnerName : thread.coachProfile?.user?.name || 'Coach',
                coachName: thread.coachProfile?.user?.name || 'Coach',
                coachSlug: thread.coachProfile?.user?.slug || null,
                learnerName: thread.learnerName,
                headline: thread.coachProfile?.headline || '',
                rate: thread.coachProfile?.hourlyRate || 0,
                preferredMode: thread.preferredMode,
                suburb: thread.preferredSuburb || thread.coachProfile?.suburb || '',
                preferredDays: thread.preferredDays || '[]',
                preferredTimes: thread.preferredTimes || '[]',
                iHaveReplied: messages.some((m) => m.senderUserId === req.user.id),
                createdAt: thread.createdAt,
            },
            messages: messages.map((m) => ({
                id: m.id,
                body: m.body,
                senderRole: m.senderRole,
                senderName: m.sender?.name || 'User', senderAvatar: m.sender?.avatar || null,
                fromMe: m.senderUserId === req.user.id,
                createdAt: m.createdAt,
            })),
        });
    } catch (error) {
        console.error('Get thread error:', error);
        res.status(500).json({ error: 'Failed to load conversation' });
    }
});

// POST /api/messages/threads/:id — send a reply
router.post('/threads/:id', authenticate, async (req, res) => {
    try {
        const body = (req.body.body || '').trim();
        if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
        if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });

        const loaded = await loadThreadForUser(req.params.id, req.user);
        if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });
        const { thread, role } = loaded;

        const message = await prisma.message.create({
            data: {
                contactRequestId: thread.id,
                senderUserId: req.user.id,
                senderRole: role,
                body,
            },
            include: { sender: { select: { id: true, name: true, avatar: true } } },
        });

        await prisma.contactRequest.update({
            where: { id: thread.id },
            data: { lastMessageAt: new Date() },
        });

        res.status(201).json({
            message: {
                id: message.id,
                body: message.body,
                senderRole: message.senderRole,
                senderName: message.sender?.name || 'User', senderAvatar: message.sender?.avatar || null,
                fromMe: true,
                createdAt: message.createdAt,
            },
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// POST /api/messages/threads/:id/read — mark conversation read
router.post('/threads/:id/read', authenticate, async (req, res) => {
    try {
        const loaded = await loadThreadForUser(req.params.id, req.user);
        if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });
        await prisma.message.updateMany({
            where: { contactRequestId: req.params.id, readAt: null, senderUserId: { not: req.user.id } },
            data: { readAt: new Date() },
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

module.exports = router;

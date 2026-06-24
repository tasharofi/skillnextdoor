const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate, requireVerified } = require('../middleware/auth');
const { track } = require('../utils/analytics');
const { sendContactRequestToCoach, sendContactConfirmationToLearner } = require('../utils/email');

const router = express.Router();

// POST /api/contacts — Submit a contact/booking request
router.post('/', authenticate, requireVerified, async (req, res) => {
    try {
        const {
            coachProfileId, learnerName, learnerEmail, learnerPhone,
            preferredMode, preferredDays, preferredTimes, message,
            preferredSuburb,
        } = req.body;

        if (!coachProfileId || !learnerName || !learnerEmail) {
            return res.status(400).json({ error: 'Coach, name, and email are required' });
        }

        // Verify coach exists and is approved
        const coachProfile = await prisma.coachProfile.findUnique({
            where: { id: coachProfileId },
            include: { user: { select: { name: true, email: true } } },
        });

        if (!coachProfile || coachProfile.status !== 'APPROVED') {
            return res.status(404).json({ error: 'Coach not found' });
        }

        const trimmedMessage = (message || '').trim();
        const contactRequest = await prisma.contactRequest.create({
            data: {
                coachProfileId,
                learnerUserId: req.user.id,
                learnerName,
                learnerEmail,
                learnerPhone: learnerPhone || null,
                preferredMode: preferredMode || 'EITHER',
                preferredDays: preferredDays || '[]',
                preferredTimes: preferredTimes || '[]',
                message: message || '',
                preferredSuburb: preferredSuburb || null,
                lastMessageAt: new Date(),
                // Seed the conversation thread with the learner's first message
                ...(trimmedMessage
                    ? {
                          messages: {
                              create: {
                                  senderUserId: req.user.id,
                                  senderRole: 'LEARNER',
                                  body: trimmedMessage,
                              },
                          },
                      }
                    : {}),
            },
        });

        track.learnerRequestSubmitted(coachProfileId, req.user.id);

        // Send email to coach (on behalf of platform, keeping coach email private from learner)
        const coachEmail = coachProfile.email || coachProfile.user.email;
        sendContactRequestToCoach(coachEmail, coachProfile.user.name, {
            learnerName, learnerEmail, message,
            preferredMode, preferredDays, preferredTimes, preferredSuburb,
        }).catch(() => {});

        // Send confirmation to learner
        sendContactConfirmationToLearner(learnerEmail, learnerName, coachProfile.user.name).catch(() => {});

        res.status(201).json({ contactRequest, message: 'Your request has been sent to the coach' });
    } catch (error) {
        console.error('Create contact request error:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// GET /api/contacts — Get contact requests (supports role=coach|learner query param)
router.get('/', authenticate, async (req, res) => {
    try {
        let where = {};
        const role = req.query.role; // 'coach' | 'learner' | undefined

        if (req.user.isAdmin && !role) {
            // Admin without role filter sees all
        } else if (role === 'learner') {
            // Explicitly requesting learner's sent requests
            where.learnerUserId = req.user.id;
        } else if (role === 'coach' || (!role && req.user.isCoach && req.user.coachProfile)) {
            // Coach-received requests
            const profile = await prisma.coachProfile.findUnique({
                where: { userId: req.user.id },
                select: { id: true },
            });
            if (profile) {
                where.coachProfileId = profile.id;
            } else {
                return res.json({ contactRequests: [] });
            }
        } else {
            // Fallback: learner sees their sent requests
            where.learnerUserId = req.user.id;
        }

        const contactRequests = await prisma.contactRequest.findMany({
            where,
            include: {
                coachProfile: {
                    include: {
                        user: { select: { name: true, slug: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ contactRequests });
    } catch (error) {
        console.error('Get contact requests error:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

module.exports = router;

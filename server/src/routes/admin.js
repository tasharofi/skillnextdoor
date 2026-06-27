const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendCoachApprovedEmail, sendCoachRejectedEmail } = require('../utils/email');
const { createNotification } = require('../utils/notifications');
const { track } = require('../utils/analytics');

const router = express.Router();

// All routes require admin
router.use(authenticate, requireAdmin);

// ============================================
// Coach Management
// ============================================

// GET /api/admin/coaches — List all coaches with status filter
router.get('/coaches', async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status) where.status = status;

        const coaches = await prisma.coachProfile.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true, name: true, email: true, slug: true, avatar: true,
                        isLearner: true, isCoach: true, suspended: true, createdAt: true,
                    },
                },
                skills: { include: { skill: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ coaches });
    } catch (error) {
        console.error('Admin get coaches error:', error);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
});

// PATCH /api/admin/coaches/:id/approve
router.patch('/coaches/:id/approve', async (req, res) => {
    try {
        const profile = await prisma.coachProfile.update({
            where: { id: req.params.id },
            data: { status: 'APPROVED' },
            include: { user: { select: { name: true, email: true } } },
        });

        track.coachApproved(profile.id);

        // Send approval email
        sendCoachApprovedEmail(profile.email || profile.user.email, profile.user.name).catch(() => {});
        createNotification(profile.userId, {
            type: 'COACH_APPROVED',
            title: 'Your coach profile is live',
            body: 'Learners can now find and message you.',
            link: '/dashboard',
        });

        res.json({ profile, message: 'Coach approved' });
    } catch (error) {
        console.error('Admin approve coach error:', error);
        res.status(500).json({ error: 'Failed to approve coach' });
    }
});

// PATCH /api/admin/coaches/:id/reject
router.patch('/coaches/:id/reject', async (req, res) => {
    try {
        const profile = await prisma.coachProfile.update({
            where: { id: req.params.id },
            data: { status: 'REJECTED' },
            include: { user: { select: { name: true, email: true } } },
        });

        sendCoachRejectedEmail(profile.email || profile.user.email, profile.user.name).catch(() => {});
        createNotification(profile.userId, {
            type: 'COACH_REJECTED',
            title: 'Profile not approved',
            body: 'You can update and resubmit your coach profile.',
            link: '/profile',
        });

        res.json({ profile, message: 'Coach rejected' });
    } catch (error) {
        console.error('Admin reject coach error:', error);
        res.status(500).json({ error: 'Failed to reject coach' });
    }
});

// PATCH /api/admin/coaches/:id/suspend
router.patch('/coaches/:id/suspend', async (req, res) => {
    try {
        const profile = await prisma.coachProfile.update({
            where: { id: req.params.id },
            data: { status: 'SUSPENDED' },
        });
        res.json({ profile, message: 'Coach suspended' });
    } catch (error) {
        console.error('Admin suspend coach error:', error);
        res.status(500).json({ error: 'Failed to suspend coach' });
    }
});

// PATCH /api/admin/coaches/:id/reactivate
router.patch('/coaches/:id/reactivate', async (req, res) => {
    try {
        const profile = await prisma.coachProfile.update({
            where: { id: req.params.id },
            data: { status: 'APPROVED' },
        });
        res.json({ profile, message: 'Coach reactivated' });
    } catch (error) {
        console.error('Admin reactivate coach error:', error);
        res.status(500).json({ error: 'Failed to reactivate coach' });
    }
});

// DELETE /api/admin/coaches/:id — Remove spam/fake coach
router.delete('/coaches/:id', async (req, res) => {
    try {
        await prisma.coachProfile.delete({ where: { id: req.params.id } });
        res.json({ message: 'Coach profile removed' });
    } catch (error) {
        console.error('Admin delete coach error:', error);
        res.status(500).json({ error: 'Failed to remove coach' });
    }
});

// ============================================
// User Management
// ============================================

// GET /api/admin/users — List all users
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, email: true, name: true, slug: true, avatar: true,
                isLearner: true, isCoach: true, isAdmin: true,
                emailVerified: true, suspended: true, createdAt: true,
                coachProfile: { select: { id: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ users });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PATCH /api/admin/users/:id/suspend
router.patch('/users/:id/suspend', async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { suspended: true },
            select: { id: true, name: true, suspended: true },
        });
        res.json({ user, message: 'User suspended' });
    } catch (error) {
        console.error('Admin suspend user error:', error);
        res.status(500).json({ error: 'Failed to suspend user' });
    }
});

// PATCH /api/admin/users/:id/unsuspend
router.patch('/users/:id/unsuspend', async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { suspended: false },
            select: { id: true, name: true, suspended: true },
        });
        res.json({ user, message: 'User unsuspended' });
    } catch (error) {
        console.error('Admin unsuspend user error:', error);
        res.status(500).json({ error: 'Failed to unsuspend user' });
    }
});

// DELETE /api/admin/users/:id — Remove user
router.delete('/users/:id', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: 'User removed' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

// ============================================
// Skill Management
// ============================================

// GET /api/admin/skills — List all skills with aliases and coach count
router.get('/skills', async (req, res) => {
    try {
        const { proposed } = req.query;
        const where = {};
        if (proposed === 'true') where.isProposed = true;
        if (proposed === 'false') where.isProposed = false;

        const skills = await prisma.skill.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                aliases: true,
                _count: { select: { coaches: true } },
            },
        });
        res.json({ skills });
    } catch (error) {
        console.error('Admin get skills error:', error);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

// POST /api/admin/skills — Create canonical skill
router.post('/skills', async (req, res) => {
    try {
        const { name, parentGroup, aliases } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const skill = await prisma.skill.create({
            data: {
                name,
                enabled: true,
                parentGroup: parentGroup || '',
                isProposed: false,
            },
        });

        if (aliases && Array.isArray(aliases)) {
            for (const alias of aliases) {
                if (alias.trim()) {
                    await prisma.skillAlias.create({
                        data: { skillId: skill.id, alias: alias.trim().toLowerCase() },
                    }).catch(() => {});
                }
            }
        }

        const full = await prisma.skill.findUnique({
            where: { id: skill.id },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.status(201).json({ skill: full });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Skill already exists' });
        }
        console.error('Admin create skill error:', error);
        res.status(500).json({ error: 'Failed to create skill' });
    }
});

// PUT /api/admin/skills/:id — Update skill name, parentGroup
router.put('/skills/:id', async (req, res) => {
    try {
        const { name, parentGroup } = req.body;
        const data = {};
        if (name !== undefined) data.name = name;
        if (parentGroup !== undefined) data.parentGroup = parentGroup;

        const skill = await prisma.skill.update({
            where: { id: req.params.id },
            data,
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ skill });
    } catch (error) {
        console.error('Admin update skill error:', error);
        res.status(500).json({ error: 'Failed to update skill' });
    }
});

// PATCH /api/admin/skills/:id/toggle — Enable/disable
router.patch('/skills/:id/toggle', async (req, res) => {
    try {
        const existing = await prisma.skill.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Skill not found' });

        const skill = await prisma.skill.update({
            where: { id: req.params.id },
            data: { enabled: !existing.enabled },
        });
        res.json({ skill });
    } catch (error) {
        console.error('Admin toggle skill error:', error);
        res.status(500).json({ error: 'Failed to toggle skill' });
    }
});

// DELETE /api/admin/skills/:id
router.delete('/skills/:id', async (req, res) => {
    try {
        const count = await prisma.coachSkill.count({
            where: { skillId: req.params.id },
        });
        if (count > 0) {
            return res.status(400).json({ error: `Cannot delete — ${count} coach(es) use this skill. Disable it instead.` });
        }

        await prisma.skill.delete({ where: { id: req.params.id } });
        res.json({ message: 'Skill removed' });
    } catch (error) {
        console.error('Admin delete skill error:', error);
        res.status(500).json({ error: 'Failed to delete skill' });
    }
});

// POST /api/admin/skills/:id/aliases — Add alias
router.post('/skills/:id/aliases', async (req, res) => {
    try {
        const { alias } = req.body;
        if (!alias || !alias.trim()) return res.status(400).json({ error: 'Alias is required' });

        await prisma.skillAlias.create({
            data: { skillId: req.params.id, alias: alias.trim().toLowerCase() },
        });

        const skill = await prisma.skill.findUnique({
            where: { id: req.params.id },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ skill });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Alias already exists for this skill' });
        }
        console.error('Admin add alias error:', error);
        res.status(500).json({ error: 'Failed to add alias' });
    }
});

// DELETE /api/admin/skills/:id/aliases/:aliasId — Remove alias
router.delete('/skills/:id/aliases/:aliasId', async (req, res) => {
    try {
        await prisma.skillAlias.delete({ where: { id: req.params.aliasId } });

        const skill = await prisma.skill.findUnique({
            where: { id: req.params.id },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ skill });
    } catch (error) {
        console.error('Admin remove alias error:', error);
        res.status(500).json({ error: 'Failed to remove alias' });
    }
});

// PATCH /api/admin/skills/:id/approve — Promote proposed → canonical
router.patch('/skills/:id/approve', async (req, res) => {
    try {
        const skill = await prisma.skill.update({
            where: { id: req.params.id },
            data: { isProposed: false },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ skill, message: 'Skill approved as canonical' });
    } catch (error) {
        console.error('Admin approve skill error:', error);
        res.status(500).json({ error: 'Failed to approve skill' });
    }
});

// PATCH /api/admin/skills/:id/merge/:targetId — Merge skill into another
router.patch('/skills/:id/merge/:targetId', async (req, res) => {
    try {
        const sourceId = req.params.id;
        const targetId = req.params.targetId;

        const coachSkills = await prisma.coachSkill.findMany({
            where: { skillId: sourceId },
        });

        for (const cs of coachSkills) {
            const existing = await prisma.coachSkill.findFirst({
                where: { coachProfileId: cs.coachProfileId, skillId: targetId },
            });
            if (!existing) {
                await prisma.coachSkill.update({
                    where: { id: cs.id },
                    data: { skillId: targetId },
                });
            } else {
                await prisma.coachSkill.delete({ where: { id: cs.id } });
            }
        }

        const source = await prisma.skill.findUnique({ where: { id: sourceId } });
        if (source) {
            await prisma.skillAlias.upsert({
                where: { skillId_alias: { skillId: targetId, alias: source.name.toLowerCase() } },
                create: { skillId: targetId, alias: source.name.toLowerCase() },
                update: {},
            }).catch(() => {});
        }

        await prisma.skill.delete({ where: { id: sourceId } });

        const target = await prisma.skill.findUnique({
            where: { id: targetId },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ skill: target, message: 'Skills merged' });
    } catch (error) {
        console.error('Admin merge skill error:', error);
        res.status(500).json({ error: 'Failed to merge skills' });
    }
});

// PATCH /api/admin/skills/:id/reject — Remove proposed skill
router.patch('/skills/:id/reject', async (req, res) => {
    try {
        await prisma.coachSkill.deleteMany({ where: { skillId: req.params.id } });
        await prisma.skill.delete({ where: { id: req.params.id } });
        res.json({ message: 'Proposed skill rejected and removed' });
    } catch (error) {
        console.error('Admin reject skill error:', error);
        res.status(500).json({ error: 'Failed to reject skill' });
    }
});

// ============================================
// Category Management (backward compatibility)
// ============================================

router.get('/categories', async (req, res) => {
    try {
        const categories = await prisma.skill.findMany({
            orderBy: { name: 'asc' },
            include: { aliases: true, _count: { select: { coaches: true } } },
        });
        res.json({ categories });
    } catch (error) {
        console.error('Admin get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const category = await prisma.skill.create({ data: { name, enabled: true } });
        res.status(201).json({ category });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'Skill already exists' });
        res.status(500).json({ error: 'Failed to create skill' });
    }
});

router.put('/categories/:id', async (req, res) => {
    try {
        const category = await prisma.skill.update({ where: { id: req.params.id }, data: { name: req.body.name } });
        res.json({ category });
    } catch (error) { res.status(500).json({ error: 'Failed to update skill' }); }
});

router.patch('/categories/:id/toggle', async (req, res) => {
    try {
        const existing = await prisma.skill.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Skill not found' });
        const category = await prisma.skill.update({ where: { id: req.params.id }, data: { enabled: !existing.enabled } });
        res.json({ category });
    } catch (error) { res.status(500).json({ error: 'Failed to toggle skill' }); }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        const count = await prisma.coachSkill.count({ where: { skillId: req.params.id } });
        if (count > 0) return res.status(400).json({ error: `Cannot delete — ${count} coach(es) use this skill.` });
        await prisma.skill.delete({ where: { id: req.params.id } });
        res.json({ message: 'Skill removed' });
    } catch (error) { res.status(500).json({ error: 'Failed to delete skill' }); }
});

// ============================================
// Contact Request Management
// ============================================

// GET /api/admin/contacts
router.get('/contacts', async (req, res) => {
    try {
        const contactRequests = await prisma.contactRequest.findMany({
            include: {
                coachProfile: {
                    include: {
                        user: { select: { name: true, slug: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ contactRequests });
    } catch (error) {
        console.error('Admin get contacts error:', error);
        res.status(500).json({ error: 'Failed to fetch contact requests' });
    }
});

// PATCH /api/admin/contacts/:id/status
router.patch('/contacts/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['NEW', 'SENT', 'RESOLVED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const contactRequest = await prisma.contactRequest.update({
            where: { id: req.params.id },
            data: { status },
        });
        res.json({ contactRequest });
    } catch (error) {
        console.error('Admin update contact status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ============================================
// Pending Profile Edits
// ============================================

// GET /api/admin/pending-edits — List all pending profile edits
router.get('/pending-edits', async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status) {
            where.status = status;
        } else {
            where.status = 'PENDING';
        }

        const edits = await prisma.pendingProfileEdit.findMany({
            where,
            include: {
                coachProfile: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, slug: true, avatar: true },
                        },
                        skills: { include: { skill: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formatted = edits.map(edit => ({
            ...edit,
            changes: JSON.parse(edit.changes || '{}'),
        }));

        res.json({ pendingEdits: formatted });
    } catch (error) {
        console.error('Admin get pending edits error:', error);
        res.status(500).json({ error: 'Failed to fetch pending edits' });
    }
});

// PATCH /api/admin/pending-edits/:id/approve — Apply pending changes to live profile
router.patch('/pending-edits/:id/approve', async (req, res) => {
    try {
        const edit = await prisma.pendingProfileEdit.findUnique({
            where: { id: req.params.id },
            include: { coachProfile: true },
        });

        if (!edit) {
            return res.status(404).json({ error: 'Pending edit not found' });
        }

        if (edit.status !== 'PENDING') {
            return res.status(400).json({ error: 'This edit has already been processed' });
        }

        const changes = JSON.parse(edit.changes || '{}');

        // Apply changes to live coach profile
        const updateData = {};
        for (const [field, value] of Object.entries(changes)) {
            updateData[field] = value;
        }

        await prisma.coachProfile.update({
            where: { id: edit.coachProfileId },
            data: updateData,
        });

        // Mark as approved
        const updated = await prisma.pendingProfileEdit.update({
            where: { id: edit.id },
            data: {
                status: 'APPROVED',
                adminNotes: req.body.notes || '',
            },
        });

        createNotification(edit.coachProfile?.userId, {
            type: 'EDIT_APPROVED',
            title: 'Profile changes approved',
            body: 'Your latest profile edits are now live.',
            link: '/profile',
        });

        res.json({
            pendingEdit: { ...updated, changes },
            message: 'Changes approved and applied to live profile',
        });
    } catch (error) {
        console.error('Admin approve pending edit error:', error);
        res.status(500).json({ error: 'Failed to approve edit' });
    }
});

// PATCH /api/admin/pending-edits/:id/reject — Reject pending edit
router.patch('/pending-edits/:id/reject', async (req, res) => {
    try {
        const edit = await prisma.pendingProfileEdit.findUnique({
            where: { id: req.params.id },
            include: { coachProfile: { select: { userId: true } } },
        });

        if (!edit) {
            return res.status(404).json({ error: 'Pending edit not found' });
        }

        if (edit.status !== 'PENDING') {
            return res.status(400).json({ error: 'This edit has already been processed' });
        }

        const updated = await prisma.pendingProfileEdit.update({
            where: { id: edit.id },
            data: {
                status: 'REJECTED',
                adminNotes: req.body.notes || '',
            },
        });

        createNotification(edit.coachProfile?.userId, {
            type: 'EDIT_REJECTED',
            title: 'Profile changes not approved',
            body: 'Your recent profile edits were not approved. You can update and resubmit.',
            link: '/profile',
        });

        res.json({
            pendingEdit: { ...updated, changes: JSON.parse(updated.changes || '{}') },
            message: 'Edit rejected',
        });
    } catch (error) {
        console.error('Admin reject pending edit error:', error);
        res.status(500).json({ error: 'Failed to reject edit' });
    }
});

// ============================================
// Profile Reports
// ============================================

// GET /api/admin/reports — List all profile reports
router.get('/reports', async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status) where.status = status;

        const reports = await prisma.profileReport.findMany({
            where,
            include: {
                coachProfile: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, slug: true },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ reports });
    } catch (error) {
        console.error('Admin get reports error:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// PATCH /api/admin/reports/:id/review — Mark report as reviewed
router.patch('/reports/:id/review', async (req, res) => {
    try {
        const report = await prisma.profileReport.update({
            where: { id: req.params.id },
            data: {
                status: 'REVIEWED',
                adminNotes: req.body.notes || '',
            },
        });
        res.json({ report, message: 'Report marked as reviewed' });
    } catch (error) {
        console.error('Admin review report error:', error);
        res.status(500).json({ error: 'Failed to review report' });
    }
});

// PATCH /api/admin/reports/:id/dismiss — Dismiss report
router.patch('/reports/:id/dismiss', async (req, res) => {
    try {
        const report = await prisma.profileReport.update({
            where: { id: req.params.id },
            data: {
                status: 'DISMISSED',
                adminNotes: req.body.notes || '',
            },
        });
        res.json({ report, message: 'Report dismissed' });
    } catch (error) {
        console.error('Admin dismiss report error:', error);
        res.status(500).json({ error: 'Failed to dismiss report' });
    }
});

module.exports = router;


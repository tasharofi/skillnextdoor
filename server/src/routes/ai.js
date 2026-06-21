const express = require('express');
const { authenticate } = require('../middleware/auth');
const AIService = require('../utils/ai-service');

const router = express.Router();

// GET /api/ai/status — Check if AI is available
router.get('/status', (req, res) => {
    res.json({ available: AIService.isAvailableNow() });
});

// (Removed: AI learner search parsing — learner search uses keyword/autocomplete only)

// POST /api/ai/improve-bio — Improve coach bio text
router.post('/improve-bio', authenticate, async (req, res) => {
    try {
        const { text, context } = req.body;
        if (!text || text.trim().length < 10) {
            return res.status(400).json({ error: 'Please write at least a rough bio first' });
        }

        if (!AIService.isAvailableNow()) {
            return res.json({ available: false, suggestion: null });
        }

        const suggestion = await AIService.improveCoachBio(text, context || {});

        if (!suggestion) {
            return res.json({ available: AIService.isAvailableNow(), suggestion: null });
        }

        res.json({ available: true, suggestion });
    } catch (error) {
        console.error('AI improve bio error:', error);
        res.json({ available: false, suggestion: null });
    }
});

// POST /api/ai/improve-headline — Generate headline options
router.post('/improve-headline', authenticate, async (req, res) => {
    try {
        const { text, context } = req.body;
        if (!text || text.trim().length < 3) {
            return res.status(400).json({ error: 'Please write at least a rough headline first' });
        }

        if (!AIService.isAvailableNow()) {
            return res.json({ available: false, suggestions: null });
        }

        const suggestions = await AIService.improveCoachHeadline(text, context || {});

        if (!suggestions || !Array.isArray(suggestions)) {
            return res.json({ available: AIService.isAvailableNow(), suggestions: null });
        }

        res.json({ available: true, suggestions: suggestions.slice(0, 5) });
    } catch (error) {
        console.error('AI improve headline error:', error);
        res.json({ available: false, suggestions: null });
    }
});

// POST /api/ai/suggest-skills — Suggest skills based on profile
router.post('/suggest-skills', authenticate, async (req, res) => {
    try {
        const { context } = req.body;

        if (!AIService.isAvailableNow()) {
            return res.json({ available: false, suggestions: null });
        }

        const suggestions = await AIService.suggestCoachSkillTags(context || {});

        if (!suggestions || !Array.isArray(suggestions)) {
            return res.json({ available: AIService.isAvailableNow(), suggestions: null });
        }

        res.json({ available: true, suggestions: suggestions.slice(0, 6) });
    } catch (error) {
        console.error('AI suggest skills error:', error);
        res.json({ available: false, suggestions: null });
    }
});

// POST /api/ai/normalise-skill — Normalise a coach skill entry
router.post('/normalise-skill', authenticate, async (req, res) => {
    try {
        const { input, existingSkills } = req.body;
        if (!input || input.trim().length < 2) {
            return res.status(400).json({ error: 'Skill input required' });
        }

        if (!AIService.isAvailableNow()) {
            return res.json({ available: false, result: null });
        }

        const result = await AIService.normaliseCoachSkill(input, existingSkills || []);

        if (!result) {
            return res.json({ available: AIService.isAvailableNow(), result: null });
        }

        res.json({ available: true, result });
    } catch (error) {
        console.error('AI normalise skill error:', error);
        res.json({ available: false, result: null });
    }
});

module.exports = router;

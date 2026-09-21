const express = require('express');
const { checkHealth, checkDatabase } = require('../controllers/healthController');
const router = express.Router();

router.get('/', checkHealth);
router.get('/db', checkDatabase);

module.exports = router;

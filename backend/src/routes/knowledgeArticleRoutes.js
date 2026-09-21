const router = require('express').Router();
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const articles = require('../controllers/knowledgeArticleController');

router.use(authenticate, authorizeRoles('EMPLOYEE', 'IT', 'ADMIN'));
router.get('/', articles.list);
router.get('/:id', articles.detail);
router.post('/', authorizeRoles('IT', 'ADMIN'), articles.create);
router.put('/:id', authorizeRoles('IT', 'ADMIN'), articles.update);
router.patch('/:id/status', authorizeRoles('IT', 'ADMIN'), articles.status);

module.exports = router;

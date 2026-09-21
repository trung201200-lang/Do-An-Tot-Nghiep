const router = require('express').Router();
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const tickets = require('../controllers/ticketController');

router.use(authenticate, authorizeRoles('EMPLOYEE', 'IT', 'ADMIN'));
router.post('/', authorizeRoles('EMPLOYEE'), tickets.create);
router.get('/', tickets.list);
router.get('/:id', tickets.detail);
router.patch('/:id/accept', authorizeRoles('IT', 'ADMIN'), tickets.accept);
router.patch('/:id/priority', authorizeRoles('IT', 'ADMIN'), tickets.priority);
router.patch('/:id/status', authorizeRoles('IT', 'ADMIN'), tickets.status);
module.exports = router;

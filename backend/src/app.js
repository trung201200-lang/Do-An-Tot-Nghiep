const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const app = express();

app.use(cors({ origin: 'http://127.0.0.1:5173' }));
app.use(express.json({ limit: '16kb' }));
app.use('/api/health', healthRoutes);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/test', require('./routes/testRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/knowledge', require('./routes/knowledgeArticleRoutes'));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API không tồn tại.' });
});
app.use(require('./middleware/errorMiddleware'));

module.exports = app;

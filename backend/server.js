require('./src/config/env');
const app = require('./src/app');
const port = Number(process.env.PORT || 5000);

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Backend đang chạy tại http://127.0.0.1:${port}`);
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Cổng backend đang được sử dụng. Hãy dừng ứng dụng đang chiếm cổng hoặc đổi PORT trong backend/.env.'
    : 'Không thể khởi động backend. Hãy kiểm tra cấu hình PORT.');
  process.exitCode = 1;
});

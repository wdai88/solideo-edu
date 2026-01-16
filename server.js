const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const SystemMonitor = require('./lib/system-monitor');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const monitor = new SystemMonitor();

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket 연결 처리
io.on('connection', (socket) => {
    console.log('클라이언트 연결됨:', socket.id);

    let intervalId = null;

    // 실시간 모니터링 시작
    const startMonitoring = async () => {
        // 즉시 첫 데이터 전송
        try {
            const metrics = await monitor.getAllMetrics();
            socket.emit('metrics', metrics);
        } catch (error) {
            console.error('메트릭 수집 오류:', error);
        }

        // 1초 간격으로 데이터 전송
        intervalId = setInterval(async () => {
            try {
                const metrics = await monitor.getAllMetrics();
                socket.emit('metrics', metrics);
            } catch (error) {
                console.error('메트릭 수집 오류:', error);
            }
        }, 1000);
    };

    startMonitoring();

    // 연결 해제 시 정리
    socket.on('disconnect', () => {
        console.log('클라이언트 연결 해제:', socket.id);
        if (intervalId) {
            clearInterval(intervalId);
        }
    });
});

// 서버 시작
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     🖥️  시스템 리소스 모니터링 서버가 시작되었습니다     ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   📍 접속 주소: http://localhost:${PORT}                    ║
║   📊 실시간 모니터링 활성화                               ║
║   📄 PDF 리포트 생성 가능                                 ║
║                                                           ║
║   종료하려면 Ctrl+C를 누르세요                            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

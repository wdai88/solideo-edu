const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const SystemMonitor = require('./lib/system-monitor');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

const PORT = process.env.PORT || 3000;
const monitor = new SystemMonitor();
const METRICS_INTERVAL = 1000;
const MAX_RETRIES = 3;
let clientConnections = new Map();

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
    let retryCount = 0;

    // 메트릭 전송 함수
    const sendMetrics = async (retries = 0) => {
        try {
            const metrics = await monitor.getAllMetrics();
            socket.emit('metrics', metrics);
            retryCount = 0; // 성공 시 재시도 카운트 초기화
        } catch (error) {
            console.error(`메트릭 수집 오류 [시도 ${retries + 1}/${MAX_RETRIES}]:`, error.message);
            if (retries < MAX_RETRIES - 1) {
                // 재시도 (지연 포함)
                setTimeout(() => sendMetrics(retries + 1), 100 * (retries + 1));
            } else {
                console.error(`메트릭 수집 최종 실패 (클라이언트: ${socket.id})`);
                socket.emit('error', { message: '시스템 메트릭 수집 실패' });
            }
        }
    };

    // 실시간 모니터링 시작
    const startMonitoring = async () => {
        // 즉시 첫 데이터 전송
        await sendMetrics();

        // 1초 간격으로 데이터 전송
        intervalId = setInterval(async () => {
            await sendMetrics();
        }, METRICS_INTERVAL);
    };

    // 클라이언트 연결 정보 저장
    clientConnections.set(socket.id, {
        connectedAt: new Date(),
        intervalId: null
    });

    startMonitoring();

    // 에러 처리
    socket.on('error', (error) => {
        console.error(`소켓 에러 (${socket.id}):`, error);
    });

    // 연결 해제 시 정리
    socket.on('disconnect', (reason) => {
        console.log(`클라이언트 연결 해제 (${socket.id}): ${reason}`);
        if (intervalId) {
            clearInterval(intervalId);
        }
        clientConnections.delete(socket.id);
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

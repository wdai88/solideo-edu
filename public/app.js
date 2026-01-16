// ===== 전역 변수 =====
const socket = io();
let charts = {};
let trackingData = [];
let isTracking = false;
let trackingStartTime = null;
let trackingInterval = null;
let latestMetrics = null;
const TRACKING_DURATION = 5 * 60 * 1000; // 5분
const MAX_DATA_POINTS = 60;

// ===== 유틸리티 함수 =====
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('ko-KR');
}
setInterval(updateClock, 1000);
updateClock();

// ===== 차트 초기화 =====
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
            x: { display: false },
            y: { display: false, min: 0, max: 100 }
        },
        elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } }
    };

    // CPU 게이지
    charts.cpuGauge = new Chart(document.getElementById('cpuGauge'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#06b6d4', 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                circumference: 270,
                rotation: 225
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '80%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });

    // CPU 라인 차트
    charts.cpu = new Chart(document.getElementById('cpuChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [{
                data: Array(MAX_DATA_POINTS).fill(null),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                fill: true
            }]
        },
        options: chartOptions
    });

    // 메모리 라인 차트
    charts.memory = new Chart(document.getElementById('memoryChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [{
                data: Array(MAX_DATA_POINTS).fill(null),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true
            }]
        },
        options: chartOptions
    });

    // 네트워크 차트
    charts.network = new Chart(document.getElementById('networkChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [
                { data: Array(MAX_DATA_POINTS).fill(null), borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', fill: true, label: 'Download' },
                { data: Array(MAX_DATA_POINTS).fill(null), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, label: 'Upload' }
            ]
        },
        options: { ...chartOptions, scales: { x: { display: false }, y: { display: false } } }
    });

    // 디스크 I/O 차트
    charts.disk = new Chart(document.getElementById('diskChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [
                { data: Array(MAX_DATA_POINTS).fill(null), borderColor: '#f59e0b', fill: false, label: 'Read' },
                { data: Array(MAX_DATA_POINTS).fill(null), borderColor: '#ef4444', fill: false, label: 'Write' }
            ]
        },
        options: { ...chartOptions, scales: { x: { display: false }, y: { display: false } } }
    });

    // 히스토리 차트
    charts.history = new Chart(document.getElementById('historyChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', fill: true, label: 'CPU' },
                { data: [], borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, label: 'Memory' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10 } },
                y: { display: true, min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } }
            },
            elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } }
        }
    });
}

// ===== 데이터 업데이트 =====
function updateUI(data) {
    // CPU
    const cpuUsage = data.cpu.usage;
    document.getElementById('cpuUsage').textContent = cpuUsage.toFixed(1) + '%';
    document.getElementById('cpuGaugeValue').textContent = Math.round(cpuUsage);
    charts.cpuGauge.data.datasets[0].data = [cpuUsage, 100 - cpuUsage];
    charts.cpuGauge.update('none');

    document.getElementById('cpuBrand').textContent = data.cpu.brand ? data.cpu.brand.split(' ').slice(0, 2).join(' ') : '--';
    document.getElementById('cpuCores').textContent = data.cpu.physicalCores || '--';
    document.getElementById('cpuTemp').textContent = data.cpu.temperature ? data.cpu.temperature + '°C' : 'N/A';

    updateChart(charts.cpu, cpuUsage);

    // 메모리
    const memUsage = data.memory.usagePercent;
    document.getElementById('memoryUsage').textContent = memUsage.toFixed(1) + '%';
    document.getElementById('memoryUsedBar').style.width = memUsage + '%';
    document.getElementById('memoryUsedLabel').textContent = '사용: ' + formatBytes(data.memory.used);
    document.getElementById('memoryTotalLabel').textContent = '전체: ' + formatBytes(data.memory.total);
    document.getElementById('memUsed').textContent = formatBytes(data.memory.used);
    document.getElementById('memAvailable').textContent = formatBytes(data.memory.available);
    document.getElementById('memSwap').textContent = formatBytes(data.memory.swapUsed);

    updateChart(charts.memory, memUsage);

    // 네트워크
    const rxSpeed = data.network.total.rxSpeed;
    const txSpeed = data.network.total.txSpeed;
    document.getElementById('downloadSpeed').textContent = formatSpeed(rxSpeed);
    document.getElementById('uploadSpeed').textContent = formatSpeed(txSpeed);
    document.getElementById('totalDownload').textContent = formatBytes(data.network.total.rxTotal);
    document.getElementById('totalUpload').textContent = formatBytes(data.network.total.txTotal);

    updateChart(charts.network, rxSpeed / 1024, 0);
    updateChart(charts.network, txSpeed / 1024, 1);

    // 디스크
    const diskList = document.getElementById('diskList');
    diskList.innerHTML = data.disk.disks.slice(0, 3).map(disk => {
        const mountEscaped = disk.mount.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        return `
    <div class="disk-item">
      <div class="disk-header">
        <span class="disk-mount">${mountEscaped}</span>
        <span class="disk-usage">${disk.usagePercent}%</span>
      </div>
      <div class="disk-bar"><div class="disk-used" style="width: ${disk.usagePercent}%"></div></div>
    </div>
  `;
    }).join('');

    document.getElementById('diskRead').textContent = formatSpeed(data.disk.io.readSpeed);
    document.getElementById('diskWrite').textContent = formatSpeed(data.disk.io.writeSpeed);

    updateChart(charts.disk, data.disk.io.readSpeed / 1024, 0);
    updateChart(charts.disk, data.disk.io.writeSpeed / 1024, 1);

    // GPU
    const gpuInfo = document.getElementById('gpuInfo');
    if (data.gpu && data.gpu.length > 0) {
        const gpu = data.gpu[0];
        const gpuModelEscaped = (gpu.model || 'GPU').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        gpuInfo.innerHTML = `
      <div class="gpu-details">
        <div class="gpu-model">${gpuModelEscaped}</div>
        <div class="gpu-stats">
          <div class="gpu-stat"><span class="stat-label">VRAM</span><span class="stat-value">${gpu.vram ? gpu.vram + ' MB' : 'N/A'}</span></div>
          <div class="gpu-stat"><span class="stat-label">온도</span><span class="stat-value">${gpu.temperatureGpu ? gpu.temperatureGpu + '°C' : 'N/A'}</span></div>
          <div class="gpu-stat"><span class="stat-label">사용률</span><span class="stat-value">${gpu.utilizationGpu ? gpu.utilizationGpu + '%' : 'N/A'}</span></div>
        </div>
      </div>
    `;
    } else {
        gpuInfo.innerHTML = '<div class="gpu-placeholder"><span class="placeholder-icon">🎮</span><span>GPU 정보 없음</span></div>';
    }

    // 시스템 정보
    if (data.system) {
        document.getElementById('uptime').textContent = '업타임: ' + formatUptime(data.system.uptime);
    }

    // 추적 중이면 데이터 저장
    if (isTracking) {
        trackingData.push({
            timestamp: data.timestamp,
            cpu: cpuUsage,
            memory: memUsage,
            networkRx: rxSpeed,
            networkTx: txSpeed,
            diskRead: data.disk.io.readSpeed,
            diskWrite: data.disk.io.writeSpeed
        });
        updateHistoryChart();
    }
}

function updateChart(chart, value, datasetIndex = 0) {
    const dataset = chart.data.datasets[datasetIndex];
    dataset.data.push(value);
    if (dataset.data.length > MAX_DATA_POINTS) dataset.data.shift();
    chart.update('none');
}

function updateHistoryChart() {
    const labels = trackingData.map((d, i) => {
        const elapsed = d.timestamp - trackingStartTime;
        return formatTime(elapsed);
    });
    charts.history.data.labels = labels;
    charts.history.data.datasets[0].data = trackingData.map(d => d.cpu);
    charts.history.data.datasets[1].data = trackingData.map(d => d.memory);
    charts.history.update('none');
}

// ===== 추적 제어 =====
function startTracking() {
    isTracking = true;
    trackingData = [];
    trackingStartTime = Date.now();

    document.getElementById('startTrackingBtn').disabled = true;
    document.getElementById('stopTrackingBtn').disabled = false;
    document.getElementById('exportPdfBtn').disabled = true;
    document.getElementById('trackingStatus').classList.add('active');
    document.getElementById('trackingStatus').innerHTML = '<span class="tracking-icon">🔴</span><span>추적 중...</span>';

    trackingInterval = setInterval(() => {
        const elapsed = Date.now() - trackingStartTime;
        const progress = Math.min((elapsed / TRACKING_DURATION) * 100, 100);
        document.getElementById('trackingTimer').textContent = formatTime(elapsed) + ' / 05:00';
        document.getElementById('trackingProgressBar').style.width = progress + '%';

        if (elapsed >= TRACKING_DURATION) {
            stopTracking();
        }
    }, 100);
}

function stopTracking() {
    isTracking = false;
    clearInterval(trackingInterval);

    document.getElementById('startTrackingBtn').disabled = false;
    document.getElementById('stopTrackingBtn').disabled = true;
    document.getElementById('exportPdfBtn').disabled = trackingData.length === 0;
    document.getElementById('trackingStatus').classList.remove('active');
    document.getElementById('trackingStatus').innerHTML = '<span class="tracking-icon">✅</span><span>추적 완료</span>';
}

// ===== PDF 내보내기 =====
async function exportToPDF() {
    if (trackingData.length === 0) {
        alert('추적 데이터가 없습니다.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();

    // 통계 계산
    const stats = {
        cpu: { avg: 0, max: 0, min: 100 },
        memory: { avg: 0, max: 0, min: 100 },
        networkRx: { avg: 0, max: 0, total: 0 },
        networkTx: { avg: 0, max: 0, total: 0 }
    };

    trackingData.forEach(d => {
        stats.cpu.avg += d.cpu;
        stats.cpu.max = Math.max(stats.cpu.max, d.cpu);
        stats.cpu.min = Math.min(stats.cpu.min, d.cpu);
        stats.memory.avg += d.memory;
        stats.memory.max = Math.max(stats.memory.max, d.memory);
        stats.memory.min = Math.min(stats.memory.min, d.memory);
        stats.networkRx.avg += d.networkRx;
        stats.networkRx.max = Math.max(stats.networkRx.max, d.networkRx);
        stats.networkTx.avg += d.networkTx;
        stats.networkTx.max = Math.max(stats.networkTx.max, d.networkTx);
    });

    const count = trackingData.length;
    stats.cpu.avg = (stats.cpu.avg / count).toFixed(1);
    stats.memory.avg = (stats.memory.avg / count).toFixed(1);
    stats.networkRx.avg = stats.networkRx.avg / count;
    stats.networkTx.avg = stats.networkTx.avg / count;

    // 제목
    pdf.setFontSize(20);
    pdf.setTextColor(59, 130, 246);
    pdf.text('System Resource Monitor Report', pageWidth / 2, 20, { align: 'center' });

    // 시간 정보
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    const startTime = new Date(trackingStartTime).toLocaleString('ko-KR');
    const endTime = new Date(trackingData[trackingData.length - 1].timestamp).toLocaleString('ko-KR');
    pdf.text(`Monitoring Period: ${startTime} ~ ${endTime}`, pageWidth / 2, 30, { align: 'center' });
    pdf.text(`Total Data Points: ${count}`, pageWidth / 2, 36, { align: 'center' });

    // 통계 테이블
    pdf.setFontSize(14);
    pdf.setTextColor(0);
    pdf.text('Resource Statistics', 20, 50);

    pdf.setFontSize(10);
    const tableData = [
        ['Resource', 'Average', 'Maximum', 'Minimum'],
        ['CPU Usage', stats.cpu.avg + '%', stats.cpu.max.toFixed(1) + '%', stats.cpu.min.toFixed(1) + '%'],
        ['Memory Usage', stats.memory.avg + '%', stats.memory.max.toFixed(1) + '%', stats.memory.min.toFixed(1) + '%'],
        ['Download Speed', formatSpeed(stats.networkRx.avg), formatSpeed(stats.networkRx.max), '-'],
        ['Upload Speed', formatSpeed(stats.networkTx.avg), formatSpeed(stats.networkTx.max), '-']
    ];

    let y = 58;
    tableData.forEach((row, i) => {
        pdf.setFillColor(i === 0 ? 59 : (i % 2 === 0 ? 245 : 255), i === 0 ? 130 : (i % 2 === 0 ? 245 : 255), i === 0 ? 246 : (i % 2 === 0 ? 245 : 255));
        pdf.rect(20, y - 5, pageWidth - 40, 8, 'F');
        pdf.setTextColor(i === 0 ? 255 : 0);
        pdf.text(row[0], 25, y);
        pdf.text(row[1], 70, y);
        pdf.text(row[2], 110, y);
        pdf.text(row[3], 150, y);
        y += 8;
    });

    // 차트 캡처
    try {
        const historyCanvas = document.getElementById('historyChart');
        const chartImage = await html2canvas(historyCanvas.parentElement, { backgroundColor: '#12121a' });
        const imgData = chartImage.toDataURL('image/png');
        pdf.text('CPU & Memory Trend (5 Minutes)', 20, 110);
        pdf.addImage(imgData, 'PNG', 20, 115, pageWidth - 40, 60);
    } catch (e) {
        console.error('Chart capture error:', e);
    }

    // 저장
    const filename = `system_monitor_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(filename);
}

// ===== 이벤트 리스너 =====
document.getElementById('startTrackingBtn').addEventListener('click', startTracking);
document.getElementById('stopTrackingBtn').addEventListener('click', stopTracking);
document.getElementById('exportPdfBtn').addEventListener('click', exportToPDF);

// ===== 소켓 연결 =====
socket.on('connect', () => {
    document.getElementById('connectionStatus').innerHTML = '<span class="status-dot connected"></span><span>연결됨</span>';
});

socket.on('disconnect', () => {
    document.getElementById('connectionStatus').innerHTML = '<span class="status-dot disconnected"></span><span>연결 끊김</span>';
});

socket.on('metrics', (data) => {
    updateUI(data);
    latestMetrics = data; // 최신 데이터 저장
});

// ===== 모달 기능 =====
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');

function openModal(title, content) {
    modalTitle.textContent = title;
    modalContent.innerHTML = content;
    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// CPU 상세 정보
document.getElementById('cpuCard').classList.add('clickable');
document.getElementById('cpuCard').addEventListener('click', () => {
    if (!latestMetrics) return;
    const cpu = latestMetrics.cpu;
    const processes = latestMetrics.processes;
    const usageClass = cpu.usage > 80 ? 'danger' : cpu.usage > 50 ? 'warning' : 'highlight';
    const tempClass = cpu.temperature > 80 ? 'danger' : cpu.temperature > 60 ? 'warning' : 'success';

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const coresHtml = cpu.coreLoads ? cpu.coreLoads.map((core, i) => `
        <div class="core-item">
            <div class="core-label">코어 ${i}</div>
            <div class="core-value">${core.load.toFixed(1)}%</div>
        </div>
    `).join('') : '<div>코어 정보 없음</div>';

    const processesHtml = processes && processes.topCpu ? processes.topCpu.map(p => `
        <div class="process-item">
            <span class="process-name">${escapeHtml(p.name)}</span>
            <span class="process-usage">${p.cpu}%</span>
        </div>
    `).join('') : '<div>프로세스 정보 없음</div>';

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    openModal('🔲 CPU 상세 정보', `
        <div class="detail-section">
            <div class="detail-section-title">기본 정보</div>
            <div class="detail-grid">
                <div class="detail-box">
                    <div class="detail-box-label">CPU 모델</div>
                    <div class="detail-box-value">${escapeHtml(cpu.brand || 'N/A')}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">현재 사용률</div>
                    <div class="detail-box-value ${usageClass}">${cpu.usage.toFixed(1)}%</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">물리 코어</div>
                    <div class="detail-box-value">${cpu.physicalCores || 'N/A'}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">논리 코어</div>
                    <div class="detail-box-value">${cpu.coreLoads ? cpu.coreLoads.length : 'N/A'}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">온도</div>
                    <div class="detail-box-value ${tempClass}">${cpu.temperature ? cpu.temperature + '°C' : 'N/A'}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">클럭 속도</div>
                    <div class="detail-box-value">${cpu.speed ? cpu.speed + ' GHz' : 'N/A'}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">코어별 사용률</div>
            <div class="core-grid">${coresHtml}</div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">🔥 CPU 사용률 TOP 10 프로세스</div>
            <div class="process-list">${processesHtml}</div>
        </div>
    `);
});

// 메모리 상세 정보
document.getElementById('memoryCard').classList.add('clickable');
document.getElementById('memoryCard').addEventListener('click', () => {
    if (!latestMetrics) return;
    const mem = latestMetrics.memory;
    const processes = latestMetrics.processes;
    const usageClass = mem.usagePercent > 90 ? 'danger' : mem.usagePercent > 70 ? 'warning' : 'purple';

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const processesHtml = processes && processes.topMemory ? processes.topMemory.map(p => `
        <div class="process-item">
            <span class="process-name">${escapeHtml(p.name)}</span>
            <span class="process-usage" style="color: #8b5cf6;">${p.memory}% (${formatBytes(p.memRss * 1024)})</span>
        </div>
    `).join('') : '<div>프로세스 정보 없음</div>';

    openModal('💾 메모리 상세 정보', `
        <div class="detail-section">
            <div class="detail-section-title">메모리 현황</div>
            <div class="detail-grid">
                <div class="detail-box">
                    <div class="detail-box-label">총 메모리</div>
                    <div class="detail-box-value">${formatBytes(mem.total)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">사용 중</div>
                    <div class="detail-box-value ${usageClass}">${formatBytes(mem.used)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">사용 가능</div>
                    <div class="detail-box-value success">${formatBytes(mem.available)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">여유 공간</div>
                    <div class="detail-box-value">${formatBytes(mem.free)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">사용률</div>
                    <div class="detail-box-value ${usageClass}">${mem.usagePercent.toFixed(1)}%</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">스왑 사용</div>
                    <div class="detail-box-value warning">${formatBytes(mem.swapUsed)} / ${formatBytes(mem.swapTotal)}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">메모리 사용량 시각화</div>
            <div style="background: rgba(255,255,255,0.1); border-radius: 8px; height: 40px; overflow: hidden; position: relative;">
                <div style="background: linear-gradient(135deg, #8b5cf6, #ec4899); height: 100%; width: ${mem.usagePercent}%; transition: width 0.3s;"></div>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: 700;">${mem.usagePercent.toFixed(1)}% 사용 중</div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">💾 메모리 사용량 TOP 10 프로세스</div>
            <div class="process-list">${processesHtml}</div>
        </div>
    `);
});

// 네트워크 상세 정보
document.getElementById('networkCard').classList.add('clickable');
document.getElementById('networkCard').addEventListener('click', () => {
    if (!latestMetrics) return;
    const net = latestMetrics.network;

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const interfacesHtml = net.interfaces.map(iface => `
        <div class="detail-box" style="grid-column: span 2;">
            <div class="detail-box-label">${escapeHtml(iface.name)}</div>
            <div style="display: flex; gap: 2rem; margin-top: 0.5rem;">
                <div><span style="color: #06b6d4;">⬇️ ${formatSpeed(iface.rxSpeed)}</span></div>
                <div><span style="color: #10b981;">⬆️ ${formatSpeed(iface.txSpeed)}</span></div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">총: ${formatBytes(iface.rxTotal)} / ${formatBytes(iface.txTotal)}</div>
            </div>
        </div>
    `).join('');

    openModal('🌐 네트워크 상세 정보', `
        <div class="detail-section">
            <div class="detail-section-title">전체 트래픽</div>
            <div class="detail-grid">
                <div class="detail-box">
                    <div class="detail-box-label">다운로드 속도</div>
                    <div class="detail-box-value highlight">${formatSpeed(net.total.rxSpeed)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">업로드 속도</div>
                    <div class="detail-box-value success">${formatSpeed(net.total.txSpeed)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">총 수신량</div>
                    <div class="detail-box-value">${formatBytes(net.total.rxTotal)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">총 송신량</div>
                    <div class="detail-box-value">${formatBytes(net.total.txTotal)}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">네트워크 인터페이스별</div>
            <div class="detail-grid">${interfacesHtml}</div>
        </div>
    `);
});

// 디스크 상세 정보
document.getElementById('diskCard').classList.add('clickable');
document.getElementById('diskCard').addEventListener('click', () => {
    if (!latestMetrics) return;
    const disk = latestMetrics.disk;

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const disksHtml = disk.disks.map(d => {
        const usageClass = d.usagePercent > 90 ? 'danger' : d.usagePercent > 70 ? 'warning' : 'success';
        return `
        <div class="detail-box" style="grid-column: span 2;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="detail-box-label">${escapeHtml(d.mount)} (${escapeHtml(d.type)})</div>
                <div class="detail-box-value ${usageClass}" style="font-size: 1rem;">${d.usagePercent}%</div>
            </div>
            <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; margin: 0.5rem 0; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); height: 100%; width: ${d.usagePercent}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
                <span>사용: ${formatBytes(d.used)}</span>
                <span>전체: ${formatBytes(d.size)}</span>
                <span>여유: ${formatBytes(d.available)}</span>
            </div>
        </div>
    `}).join('');

    openModal('💿 디스크 상세 정보', `
        <div class="detail-section">
            <div class="detail-section-title">디스크 I/O</div>
            <div class="detail-grid">
                <div class="detail-box">
                    <div class="detail-box-label">읽기 속도</div>
                    <div class="detail-box-value highlight">${formatSpeed(disk.io.readSpeed)}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">쓰기 속도</div>
                    <div class="detail-box-value warning">${formatSpeed(disk.io.writeSpeed)}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">디스크 파티션</div>
            <div class="detail-grid">${disksHtml}</div>
        </div>
    `);
});

// GPU 상세 정보
document.getElementById('gpuCard').classList.add('clickable');
document.getElementById('gpuCard').addEventListener('click', () => {
    if (!latestMetrics || !latestMetrics.gpu || latestMetrics.gpu.length === 0) {
        openModal('🎮 GPU 상세 정보', `
            <div class="detail-section">
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🎮</div>
                    <div>GPU 정보를 가져올 수 없습니다.</div>
                    <div style="font-size: 0.8rem; margin-top: 0.5rem;">macOS에서는 일부 GPU 정보가 제한될 수 있습니다.</div>
                </div>
            </div>
        `);
        return;
    }

    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const gpusHtml = latestMetrics.gpu.map((gpu, i) => `
        <div class="detail-section">
            <div class="detail-section-title">GPU ${i + 1}: ${escapeHtml(gpu.model || 'Unknown')}</div>
            <div class="detail-grid">
                <div class="detail-box">
                    <div class="detail-box-label">제조사</div>
                    <div class="detail-box-value">${escapeHtml(gpu.vendor || 'N/A')}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">VRAM</div>
                    <div class="detail-box-value purple">${gpu.vram ? gpu.vram + ' MB' : 'N/A'}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">온도</div>
                    <div class="detail-box-value ${gpu.temperatureGpu ? (gpu.temperatureGpu > 80 ? 'danger' : 'warning') : 'default'}">${gpu.temperatureGpu ? gpu.temperatureGpu + '°C' : 'N/A'}</div>
                </div>
                <div class="detail-box">
                    <div class="detail-box-label">사용률</div>
                    <div class="detail-box-value highlight">${gpu.utilizationGpu ? gpu.utilizationGpu + '%' : 'N/A'}</div>
                </div>
            </div>
        </div>
    `).join('');

    openModal('🎮 GPU 상세 정보', gpusHtml);
});

// 초기화
initCharts();


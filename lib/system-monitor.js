const si = require('systeminformation');

class SystemMonitor {
    constructor() {
        this.previousNetStats = null;
        this.previousDiskIO = null;
    }

    async getCpuInfo() {
        const [currentLoad, cpuTemperature, cpu] = await Promise.all([
            si.currentLoad(),
            si.cpuTemperature(),
            si.cpu()
        ]);

        return {
            usage: Math.round(currentLoad.currentLoad * 10) / 10,
            coreLoads: currentLoad.cpus.map((core, index) => ({
                core: index,
                load: Math.round(core.load * 10) / 10
            })),
            temperature: cpuTemperature.main || null,
            temperatureMax: cpuTemperature.max || null,
            brand: cpu.brand,
            speed: cpu.speed,
            physicalCores: cpu.physicalCores,
            cores: cpu.cores
        };
    }

    async getMemoryInfo() {
        const mem = await si.mem();

        return {
            total: mem.total,
            used: mem.used,
            free: mem.free,
            available: mem.available,
            usagePercent: Math.round((mem.used / mem.total) * 1000) / 10,
            swapTotal: mem.swaptotal,
            swapUsed: mem.swapused,
            swapPercent: mem.swaptotal > 0
                ? Math.round((mem.swapused / mem.swaptotal) * 1000) / 10
                : 0
        };
    }

    async getDiskInfo() {
        const [fsSize, diskIO] = await Promise.all([
            si.fsSize(),
            si.disksIO()
        ]);

        let readSpeed = 0;
        let writeSpeed = 0;

        if (this.previousDiskIO && diskIO) {
            const timeDiff = (diskIO.ms - this.previousDiskIO.ms) / 1000;
            if (timeDiff > 0) {
                readSpeed = Math.round((diskIO.rIO - this.previousDiskIO.rIO) / timeDiff);
                writeSpeed = Math.round((diskIO.wIO - this.previousDiskIO.wIO) / timeDiff);
            }
        }
        this.previousDiskIO = diskIO;

        const disks = fsSize.map(disk => ({
            mount: disk.mount,
            type: disk.type,
            size: disk.size,
            used: disk.used,
            available: disk.available,
            usagePercent: Math.round(disk.use * 10) / 10
        }));

        return {
            disks,
            io: {
                readSpeed: Math.max(0, readSpeed),
                writeSpeed: Math.max(0, writeSpeed),
                totalRead: diskIO ? diskIO.rIO : 0,
                totalWrite: diskIO ? diskIO.wIO : 0
            }
        };
    }

    async getNetworkInfo() {
        const netStats = await si.networkStats();
        const networkInterfaces = await si.networkInterfaces();

        let totalRxSec = 0;
        let totalTxSec = 0;
        let totalRx = 0;
        let totalTx = 0;

        const activeInterfaces = netStats.filter(iface =>
            iface.operstate === 'up' || iface.rx_bytes > 0 || iface.tx_bytes > 0
        );

        activeInterfaces.forEach(iface => {
            totalRxSec += iface.rx_sec || 0;
            totalTxSec += iface.tx_sec || 0;
            totalRx += iface.rx_bytes || 0;
            totalTx += iface.tx_bytes || 0;
        });

        return {
            interfaces: activeInterfaces.map(iface => ({
                name: iface.iface,
                rxSpeed: Math.round(iface.rx_sec || 0),
                txSpeed: Math.round(iface.tx_sec || 0),
                rxTotal: iface.rx_bytes,
                txTotal: iface.tx_bytes
            })),
            total: {
                rxSpeed: Math.round(totalRxSec),
                txSpeed: Math.round(totalTxSec),
                rxTotal: totalRx,
                txTotal: totalTx
            }
        };
    }

    async getGpuInfo() {
        try {
            const graphics = await si.graphics();

            if (!graphics.controllers || graphics.controllers.length === 0) {
                return null;
            }

            return graphics.controllers.map(gpu => ({
                model: gpu.model,
                vendor: gpu.vendor,
                vram: gpu.vram,
                temperatureGpu: gpu.temperatureGpu || null,
                utilizationGpu: gpu.utilizationGpu || null,
                memoryUsed: gpu.memoryUsed || null,
                memoryTotal: gpu.memoryTotal || null
            }));
        } catch (error) {
            return null;
        }
    }

    async getSystemInfo() {
        const [osInfo, time] = await Promise.all([
            si.osInfo(),
            si.time()
        ]);

        return {
            platform: osInfo.platform,
            distro: osInfo.distro,
            release: osInfo.release,
            hostname: osInfo.hostname,
            uptime: time.uptime,
            timezone: time.timezone
        };
    }

    async getProcessInfo() {
        try {
            const processes = await si.processes();

            // CPU 사용률 상위 10개 프로세스
            const topCpuProcesses = processes.list
                .filter(p => p.name && p.cpu >= 0)
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 10)
                .map(p => ({
                    pid: p.pid,
                    name: p.name,
                    cpu: Math.round(p.cpu * 10) / 10,
                    memory: Math.round(p.mem * 10) / 10,
                    memRss: p.memRss
                }));

            // 메모리 사용률 상위 10개 프로세스
            const topMemoryProcesses = processes.list
                .filter(p => p.name && p.mem >= 0)
                .sort((a, b) => b.mem - a.mem)
                .slice(0, 10)
                .map(p => ({
                    pid: p.pid,
                    name: p.name,
                    cpu: Math.round(p.cpu * 10) / 10,
                    memory: Math.round(p.mem * 10) / 10,
                    memRss: p.memRss
                }));

            return {
                total: processes.all,
                running: processes.running,
                blocked: processes.blocked,
                sleeping: processes.sleeping,
                topCpu: topCpuProcesses,
                topMemory: topMemoryProcesses
            };
        } catch (error) {
            console.error('프로세스 정보 수집 오류:', error);
            return null;
        }
    }

    async getAllMetrics() {
        const timestamp = Date.now();

        const [cpu, memory, disk, network, gpu, system, processes] = await Promise.all([
            this.getCpuInfo(),
            this.getMemoryInfo(),
            this.getDiskInfo(),
            this.getNetworkInfo(),
            this.getGpuInfo(),
            this.getSystemInfo(),
            this.getProcessInfo()
        ]);

        return {
            timestamp,
            cpu,
            memory,
            disk,
            network,
            gpu,
            system,
            processes
        };
    }
}

module.exports = SystemMonitor;


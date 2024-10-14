const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const si = require('systeminformation');
const crypto = require('crypto');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const dataLogFile = path.join(__dirname, 'performance_log.json');
let pollingInterval = 2000; // Default 2 seconds

// Telegram Bot setup
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(telegramToken, { polling: true });

// Generate a random token for command execution
const commandToken = crypto.randomBytes(32).toString('hex');
console.log(`Command execution token: ${commandToken}`);

// Whitelist of allowed commands
const allowedCommands = [
  'uptime',
  'free -h',
  'df -h',
  'ps aux --sort=-%cpu | head -n 5',
  'netstat -tuln',
];

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function getDiskUsage() {
  return new Promise((resolve, reject) => {
    exec('df -h /', (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      const lines = stdout.trim().split('\n');
      const diskInfo = lines[1].split(/\s+/);
      const total = parseFloat(diskInfo[1]);
      const used = parseFloat(diskInfo[2]);
      const free = parseFloat(diskInfo[3]);
      const usagePercentage = (used / total) * 100;
      resolve({
        total: diskInfo[1],
        free: diskInfo[3],
        usagePercentage: usagePercentage.toFixed(2)
      });
    });
  });
}

async function getNetworkInfo() {
  const networkInterfaces = await si.networkInterfaces();
  const networkStats = await si.networkStats();

  const activeInterfaces = networkInterfaces.filter(iface => iface.operstate === 'up');
  const interfaceDetails = activeInterfaces.map(iface => ({
    name: iface.iface,
    ip: iface.ip4,
    mac: iface.mac,
    type: iface.type,
    speed: iface.speed,
  }));

  const speeds = networkStats.map(stat => ({
    interface: stat.iface,
    rx_sec: formatBytes(stat.rx_sec),
    tx_sec: formatBytes(stat.tx_sec),
  }));

  return { interfaces: interfaceDetails, speeds };
}

async function getSystemInfo() {
  const [cpu, mem, osInfo] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.osInfo()
  ]);

  return {
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
    },
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      arch: osInfo.arch,
    },
    totalMemory: formatBytes(mem.total),
  };
}

async function getPerformanceData() {
  const cpuUsage = os.loadavg()[0];
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  const uptime = os.uptime();

  const [diskUsage, networkInfo, systemInfo] = await Promise.all([
    getDiskUsage(),
    getNetworkInfo(),
    getSystemInfo()
  ]);

  return {
    timestamp: new Date().toISOString(),
    cpuUsage: cpuUsage.toFixed(2),
    memoryUsage: memoryUsage.toFixed(2),
    diskUsage: diskUsage.usagePercentage,
    uptime: formatUptime(uptime),
    totalMemory: formatBytes(totalMemory),
    freeMemory: formatBytes(freeMemory),
    totalDisk: diskUsage.total,
    freeDisk: diskUsage.free,
    network: networkInfo,
    system: systemInfo
  };
}

function formatUptime(uptime) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function logData(data) {
  let logData = [];
  if (fs.existsSync(dataLogFile)) {
    const fileContent = fs.readFileSync(dataLogFile, 'utf8');
    logData = JSON.parse(fileContent);
  }
  logData.push(data);
  fs.writeFileSync(dataLogFile, JSON.stringify(logData));
}

function checkAlerts(data) {
  const alerts = [];
  if (parseFloat(data.cpuUsage) > 80) {
    alerts.push(`High CPU usage - ${data.cpuUsage}%`);
  }
  if (parseFloat(data.memoryUsage) > 90) {
    alerts.push(`High memory usage - ${data.memoryUsage}%`);
  }
  if (parseFloat(data.diskUsage) > 90) {
    alerts.push(`High disk usage - ${data.diskUsage}%`);
  }
  return alerts;
}

async function emitPerformanceData() {
  const data = await getPerformanceData();
  const alerts = checkAlerts(data);
  io.emit('performanceData', { ...data, alerts });
  logData(data);
}

// Function to send performance data to Telegram
async function sendTelegramUpdate() {
  const data = await getPerformanceData();
  const alerts = checkAlerts(data);

  let message = `Performance Update:\n`;
  message += `CPU Usage: ${data.cpuUsage}%\n`;
  message += `Memory Usage: ${data.memoryUsage}%\n`;
  message += `Disk Usage: ${data.diskUsage}%\n`;
  message += `Uptime: ${data.uptime}\n\n`;

  message += `Network Interfaces:\n`;
  data.network.interfaces.forEach(iface => {
    message += `- ${iface.name}: ${iface.ip} (${iface.type})\n`;
  });

  message += `\nNetwork Speeds:\n`;
  data.network.speeds.forEach(speed => {
    message += `- ${speed.interface}: ↓${speed.rx_sec}/s ↑${speed.tx_sec}/s\n`;
  });

  if (alerts.length > 0) {
    message += `\nAlerts:\n${alerts.join('\n')}`;
  }

  bot.sendMessage(telegramChatId, message);
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    if (!allowedCommands.includes(command)) {
      reject(new Error('Command not allowed'));
      return;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
  socket.on('setPollingInterval', (interval) => {
    pollingInterval = interval;
    clearInterval(performanceInterval);
    performanceInterval = setInterval(emitPerformanceData, pollingInterval);
  });
});

app.get('/api/performance', async (req, res) => {
  const data = await getPerformanceData();
  res.json(data);
});

app.get('/api/history', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 15;
  const minutes = parseInt(req.query.minutes) || 5;
  const interval = parseInt(req.query.interval) || 5;

  if (fs.existsSync(dataLogFile)) {
    const fileContent = fs.readFileSync(dataLogFile, 'utf8');
    let logData = JSON.parse(fileContent);

    const now = new Date();
    const filterTime = new Date(now - minutes * 60000);

    logData = logData.filter(item => new Date(item.timestamp) >= filterTime);

    // Apply interval filtering
    logData = logData.filter((_, index) => index % (interval / 5) === 0);

    // Apply pagination
    const totalItems = logData.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedData = logData.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      data: paginatedData,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems
      }
    });
  } else {
    res.json({
      data: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalItems: 0
      }
    });
  }
});

app.post('/api/execute-command', express.json(), async (req, res) => {
  const { command, token } = req.body;

  if (token !== commandToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    const output = await executeCommand(command);
    res.json({ output });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Telegram bot is active. You will receive updates every 2 minutes.');
  console.log(`Command execution token: ${commandToken}`);
});

let performanceInterval = setInterval(emitPerformanceData, pollingInterval);
// Set up Telegram update interval (2 minutes)
setInterval(sendTelegramUpdate, 2 * 60 * 1000);

// Handle Telegram bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the Performance Monitoring Bot! You will receive updates every 2 minutes.');
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  await sendTelegramUpdate();
});

bot.onText(/\/system/, async (msg) => {
  const chatId = msg.chat.id;
  const data = await getPerformanceData();

  let message = `System Information:\n`;
  message += `CPU: ${data.system.cpu.manufacturer} ${data.system.cpu.brand} (${data.system.cpu.cores} cores)\n`;
  message += `OS: ${data.system.os.distro} ${data.system.os.release} (${data.system.os.platform})\n`;
  message += `Kernel: ${data.system.os.kernel}\n`;
  message += `Architecture: ${data.system.os.arch}\n`;
  message += `Total Memory: ${data.system.totalMemory}\n`;

  bot.sendMessage(chatId, message);
});

bot.onText(/\/exec (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const command = match[1];

  try {
    const output = await executeCommand(command);
    bot.sendMessage(chatId, `Command output:\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
  }
});

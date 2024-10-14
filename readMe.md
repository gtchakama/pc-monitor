# Enhanced Performance Monitor Dashboard

## Overview

This project is a **Performance Monitoring Dashboard** that tracks real-time system performance metrics (CPU, memory, disk usage, and network activity) and logs data for historical analysis. It integrates with **Telegram Bot** to send performance alerts and status updates at regular intervals.

The application provides a simple web interface that shows real-time system information, and users can adjust the polling interval for data updates. Additionally, it allows users to execute specific system commands via an authenticated API.

### Key Features
- **Real-time performance tracking** (CPU, memory, disk, network stats)
- **Telegram Bot integration** for regular status updates and alerts
- **Command execution** with token-based authentication
- **Historical logging** with paginated access via the API
- **Custom polling interval** setting for real-time data updates

## Technologies
- **Node.js**: Backend server and logic
- **Express.js**: API and web server
- **Socket.IO**: Real-time communication for live performance updates
- **Telegram Bot**: Sends alerts and accepts command execution requests
- **Systeminformation (si)**: Retrieves system metrics
- **File System (fs)**: Logs data to local JSON files for historical analysis
- **Crypto**: Generates secure tokens for command execution
- **HTML & Tailwind CSS**: Frontend for the dashboard

## Setup and Installation

### Prerequisites
- Node.js v18+ and npm
- Telegram account to create a bot (get the bot token and chat ID)
- Basic knowledge of system monitoring

### Installation
1. **Clone the repository:**


2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory with the following contents:
   ```bash
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   TELEGRAM_CHAT_ID=your-telegram-chat-id
   PORT=3000 # or any port you prefer
   ```

4. **Run the application:**
   ```bash
   node app.js
   ```

   This will start the server on the port specified in the `.env` file or default to `3000`.

5. **Access the dashboard:**
   Open `http://localhost:3000` in your browser to view the real-time performance dashboard.

6. **Telegram Bot Setup:**
   The bot will start sending performance updates to your Telegram chat every 2 minutes. Use the `/start`, `/status`, or `/exec` commands in the chat to interact with the bot.

### Available API Endpoints

- `GET /api/performance`: Returns the latest performance data in JSON format.
- `GET /api/history?page=<page>&minutes=<minutes>&interval=<interval>`: Fetches historical data with pagination.
- `POST /api/execute-command`: Executes a whitelisted system command (requires token).

## Usage

### Adjust Polling Interval
- You can adjust the polling interval via the dashboard using a socket message or by calling the `setPollingInterval` socket event.

### Command Execution
- To execute system commands, use the `/exec <command>` command in the Telegram chat. Only whitelisted commands are allowed for security purposes.

### Alerts
- The system will send Telegram alerts if CPU usage exceeds 80%, memory usage exceeds 90%, or disk usage exceeds 90%.

## Command Token

A secure token for executing system commands will be generated upon server start. This token must be provided in API requests to ensure only authorized users can run sensitive commands.

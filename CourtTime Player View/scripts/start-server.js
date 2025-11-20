/**
 * Smart server startup script
 * Automatically handles port conflicts and ensures clean startup
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const DEFAULT_PORT = process.env.PORT || 3001;

/**
 * Check if port is in use
 */
async function isPortInUse(port) {
  try {
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
    return stdout.trim().length > 0;
  } catch (error) {
    // If findstr returns nothing, the command fails with code 1
    return false;
  }
}

/**
 * Kill process using a specific port
 */
async function killProcessOnPort(port) {
  try {
    console.log(`🔍 Checking for processes on port ${port}...`);
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);

    if (!stdout.trim()) {
      console.log(`✅ Port ${port} is free`);
      return true;
    }

    // Extract PIDs from netstat output
    const lines = stdout.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(pid)) {
        pids.add(pid);
      }
    }

    if (pids.size === 0) {
      console.log(`✅ Port ${port} is free`);
      return true;
    }

    console.log(`⚠️  Found ${pids.size} process(es) using port ${port}`);

    for (const pid of pids) {
      try {
        console.log(`🔪 Killing process ${pid}...`);
        await execPromise(`taskkill /PID ${pid} /F`);
        console.log(`✅ Process ${pid} terminated`);
      } catch (error) {
        console.warn(`⚠️  Could not kill process ${pid}: ${error.message}`);
      }
    }

    // Wait a bit for the port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify port is now free
    const stillInUse = await isPortInUse(port);
    if (stillInUse) {
      console.error(`❌ Port ${port} is still in use after cleanup`);
      return false;
    }

    console.log(`✅ Port ${port} is now free`);
    return true;

  } catch (error) {
    // If netstat fails, assume port is free
    console.log(`✅ Port ${port} appears to be free`);
    return true;
  }
}

/**
 * Start the server
 */
async function startServer() {
  console.log('🚀 CourtTime Server Startup Manager\n');
  console.log('=' .repeat(60));

  // Clean up port if needed
  const portCleared = await killProcessOnPort(DEFAULT_PORT);

  if (!portCleared) {
    console.error(`\n❌ FATAL: Cannot free port ${DEFAULT_PORT}`);
    console.error('💡 Try manually running: netstat -ano | findstr :' + DEFAULT_PORT);
    process.exit(1);
  }

  console.log('=' .repeat(60));
  console.log('\n🚀 Starting server...\n');

  // Start the actual server
  const serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: DEFAULT_PORT }
  });

  serverProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n❌ Server exited with code ${code}`);
      process.exit(code);
    }
  });

  // Handle shutdown signals
  const shutdown = () => {
    console.log('\n⚠️  Shutting down server...');
    serverProcess.kill('SIGTERM');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the startup
startServer().catch(error => {
  console.error('❌ Startup failed:', error);
  process.exit(1);
});

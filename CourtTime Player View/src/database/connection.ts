import { Pool, PoolClient } from 'pg';

// Database connection pool
let pool: Pool | null = null;

/**
 * Get database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false // Required for Supabase
      },
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to 10 seconds
      // Retry configuration
      query_timeout: 30000, // 30 second query timeout
      statement_timeout: 30000, // 30 second statement timeout
    });

    // Error handling for the pool with auto-reconnect
    pool.on('error', (err) => {
      console.error('⚠️  Unexpected error on idle database client:', err.message);
      console.log('Connection pool will automatically attempt to recover...');
    });

    // Handle pool connection events
    pool.on('connect', () => {
      console.log('🔌 New database client connected to pool');
    });

    pool.on('remove', () => {
      console.log('🔌 Database client removed from pool');
    });

    console.log('✅ Database pool created successfully');
  }

  return pool;
}

/**
 * Execute a query
 */
export async function query(text: string, params?: any[]) {
  const pool = getPool();
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error', { text, error });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  const client = await pool.connect();
  return client;
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database pool closed');
  }
}

/**
 * Test database connection with retry logic
 */
export async function testConnection(maxRetries = 5, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 Testing database connection (attempt ${attempt}/${maxRetries})...`);
      const pool = getPool();
      const result = await pool.query('SELECT NOW() as current_time, current_database() as database_name, version() as version');
      console.log('✅ Database connection successful!');
      console.log('📊 Connected to:', result.rows[0].database_name);
      console.log('⏰ Server time:', result.rows[0].current_time);
      console.log('🗄️  PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
      return true;
    } catch (error: any) {
      console.error(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delayMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        // Exponential backoff: double the delay for next attempt (max 10 seconds)
        delayMs = Math.min(delayMs * 1.5, 10000);
      } else {
        console.error('❌ All database connection attempts failed');
        console.error('💡 Troubleshooting tips:');
        console.error('   1. Check if DATABASE_URL is set correctly in .env file');
        console.error('   2. Verify your database is running and accessible');
        console.error('   3. Check your internet connection');
        console.error('   4. Verify database credentials are correct');
        return false;
      }
    }
  }
  return false;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

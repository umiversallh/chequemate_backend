import pool from './config/database.js';

async function checkDatabaseConnection() {
    try {
        const client = await pool.connect();
        
        // Get database connection info
        const dbInfo = await client.query(`
            SELECT 
                current_database() as database_name,
                current_user as username,
                inet_server_addr() as server_ip,
                inet_server_port() as server_port,
                version() as postgres_version
        `);
        
        console.log('🔍 Current Database Connection Info:');
        console.log('Database:', dbInfo.rows[0].database_name);
        console.log('User:', dbInfo.rows[0].username);
        console.log('Server IP:', dbInfo.rows[0].server_ip || 'localhost');
        console.log('Server Port:', dbInfo.rows[0].server_port);
        console.log('PostgreSQL Version:', dbInfo.rows[0].postgres_version);
        
        // Check if users table exists and count records
        try {
            const userCount = await client.query('SELECT COUNT(*) FROM users');
            console.log('👥 Users in database:', userCount.rows[0].count);
            
            // Show recent users
            const recentUsers = await client.query('SELECT email, username, created_at FROM users ORDER BY created_at DESC LIMIT 5');
            console.log('📋 Recent users:');
            recentUsers.rows.forEach(user => {
                console.log(`  - ${user.email} (${user.username}) - ${user.created_at}`);
            });
        } catch (err) {
            console.log('❌ Users table error:', err.message);
        }
        
        client.release();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        process.exit(1);
    }
}

checkDatabaseConnection();
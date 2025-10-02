import pool from './config/database.js';

async function checkSchema() {
  try {
    // Check challenges table structure
    const challengesSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenges' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Challenges table columns:');
    challengesSchema.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
    });
    
    // Check payments table structure
    const paymentsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n💳 Payments table columns:');
    if (paymentsSchema.rows.length === 0) {
      console.log('  ❌ Payments table does not exist!');
    } else {
      paymentsSchema.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking schema:', error);
    process.exit(1);
  }
}

checkSchema();
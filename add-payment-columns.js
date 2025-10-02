import pool from './config/database.js';

async function addPaymentColumns() {
  try {
    console.log('🔄 Adding missing payment columns to challenges table...');
    
    // Add bet_amount column
    await pool.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS bet_amount DECIMAL(10,2) DEFAULT 0;
    `);
    console.log('✅ Added bet_amount column');
    
    // Add payment_status column
    await pool.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'none' 
      CHECK (payment_status IN ('none', 'pending', 'completed', 'failed'));
    `);
    console.log('✅ Added payment_status column');
    
    // Verify the changes
    const result = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenges' 
      AND column_name IN ('bet_amount', 'payment_status')
      ORDER BY column_name
    `);
    
    console.log('\n📋 Verification - New columns added:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`);
    });
    
    console.log('\n✅ Payment columns migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error adding payment columns:', error);
  } finally {
    process.exit(0);
  }
}

addPaymentColumns();
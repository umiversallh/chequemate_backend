import pool from './config/database.js';
import paymentService from './services/paymentService.js';

console.log('🔍 [PAYMENT_DEBUG] Starting payment system debugging...');

async function debugPaymentIssue() {
  try {
    // 1. Check recent challenges with bet amounts
    console.log('\n📋 [STEP 1] Checking recent payment challenges...');
    const challengeQuery = await pool.query(`
      SELECT c.id, c.challenger, c.opponent, c.status, c.bet_amount, 
             c.challenger_phone, c.opponent_phone, c.payment_status,
             c.created_at, challenger_user.username as challenger_username,
             opponent_user.username as opponent_username
      FROM challenges c
      LEFT JOIN users challenger_user ON c.challenger = challenger_user.id
      LEFT JOIN users opponent_user ON c.opponent = opponent_user.id
      WHERE c.bet_amount > 0 
      ORDER BY c.created_at DESC 
      LIMIT 5
    `);
    
    console.log(`Found ${challengeQuery.rows.length} recent payment challenges:`);
    challengeQuery.rows.forEach((challenge, index) => {
      console.log(`  ${index + 1}. Challenge ID: ${challenge.id}`);
      console.log(`     Challenger: ${challenge.challenger_username} (${challenge.challenger})`);
      console.log(`     Opponent: ${challenge.opponent_username} (${challenge.opponent})`);
      console.log(`     Amount: ${challenge.bet_amount} KES`);
      console.log(`     Status: ${challenge.status}`);
      console.log(`     Payment Status: ${challenge.payment_status}`);
      console.log(`     Challenger Phone: ${challenge.challenger_phone || 'NOT SET'}`);
      console.log(`     Opponent Phone: ${challenge.opponent_phone || 'NOT SET'}`);
      console.log(`     Created: ${challenge.created_at}`);
      console.log('');
    });

    // 2. Check recent payment attempts
    console.log('\n💳 [STEP 2] Checking recent payment attempts...');
    const paymentQuery = await pool.query(`
      SELECT p.id, p.challenge_id, p.user_id, p.phone_number, p.amount,
             p.transaction_type, p.status, p.request_id, p.created_at,
             u.username
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC 
      LIMIT 10
    `);
    
    console.log(`Found ${paymentQuery.rows.length} recent payment attempts:`);
    paymentQuery.rows.forEach((payment, index) => {
      console.log(`  ${index + 1}. Payment ID: ${payment.id}`);
      console.log(`     User: ${payment.username} (${payment.user_id})`);
      console.log(`     Challenge ID: ${payment.challenge_id}`);
      console.log(`     Phone: ${payment.phone_number}`);
      console.log(`     Amount: ${payment.amount} KES`);
      console.log(`     Type: ${payment.transaction_type}`);
      console.log(`     Status: ${payment.status}`);
      console.log(`     Request ID: ${payment.request_id}`);
      console.log(`     Created: ${payment.created_at}`);
      console.log('');
    });

    // 3. Test payment service with sample data
    console.log('\n🧪 [STEP 3] Testing payment service directly...');
    console.log('This will test the payment initiation function with sample data');
    console.log('Phone: 254759469851 (your number from previous tests)');
    console.log('Amount: 10 KES');
    console.log('Challenge ID: 999 (test)');
    console.log('User ID: 1 (test)');
    
    // You can uncomment this line to actually test the payment
    // const testResult = await paymentService.initiateDeposit('254759469851', 10, 1, 999);
    // console.log('Test payment result:', testResult);
    
    console.log('✅ [PAYMENT_DEBUG] Payment debugging completed successfully');
    
  } catch (error) {
    console.error('❌ [PAYMENT_DEBUG] Error during debugging:', error);
  } finally {
    process.exit(0);
  }
}

debugPaymentIssue();
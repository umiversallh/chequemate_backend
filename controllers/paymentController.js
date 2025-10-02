import paymentService from '../services/paymentService.js';
import pool from '../config/database.js';

class PaymentController {
  // Initiate deposit for a player
  async initiateDeposit(req, res) {
    try {
      const { phoneNumber, amount, challengeId, userId } = req.body;

      console.log(`🏦 [DEPOSIT] Starting deposit initiation:`, {
        phoneNumber,
        amount,
        challengeId,
        userId,
        timestamp: new Date().toISOString()
      });

      if (!phoneNumber || !amount || !challengeId || !userId) {
        console.error(`❌ [DEPOSIT] Missing required fields:`, {
          phoneNumber: !!phoneNumber,
          amount: !!amount,
          challengeId: !!challengeId,
          userId: !!userId
        });
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: phoneNumber, amount, challengeId, userId'
        });
      }

      // Generate unique request ID
      const requestId = `DEP_${challengeId}_${userId}_${Date.now()}`;
      console.log(`🆔 [DEPOSIT] Generated request ID: ${requestId}`);

      // Initiate deposit with payment service
      console.log(`📞 [DEPOSIT] Calling payment service with:`, {
        sourceAccount: phoneNumber,
        amount: amount,
        requestId: requestId,
        destinationAccount: '0001650000002'
      });

      const depositResult = await paymentService.initiateDeposit(phoneNumber, amount, requestId);
      
      console.log(`📋 [DEPOSIT] Payment service response:`, {
        status: depositResult.status,
        data: depositResult.data,
        requestId: depositResult.requestId
      });

      // Store payment record in database
      console.log(`💾 [DEPOSIT] Storing payment record in database...`);
      const insertQuery = `
        INSERT INTO payments (
          challenge_id, 
          user_id, 
          phone_number, 
          amount, 
          transaction_type, 
          request_id, 
          status, 
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *;
      `;

      const paymentRecord = await pool.query(insertQuery, [
        challengeId,
        userId,
        phoneNumber,
        amount,
        'deposit',
        requestId,
        'pending'
      ]);

      console.log(`✅ [DEPOSIT] Payment record stored:`, {
        paymentId: paymentRecord.rows[0].id,
        phoneNumber: phoneNumber,
        amount: amount,
        requestId: requestId
      });

      const responseData = {
        success: true,
        message: 'Deposit initiated successfully',
        data: {
          paymentId: paymentRecord.rows[0].id,
          requestId: requestId,
          amount: amount,
          phoneNumber: phoneNumber,
          depositResponse: depositResult
        }
      };

      console.log(`📤 [DEPOSIT] Sending response:`, responseData);
      res.json(responseData);

    } catch (error) {
      console.error('Error initiating deposit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate deposit',
        error: error.message
      });
    }
  }

  // Initiate withdrawal (payout) for a player
  async initiateWithdrawal(req, res) {
    try {
      const { phoneNumber, amount, gameId, userId, reason } = req.body;

      if (!phoneNumber || !amount || !gameId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: phoneNumber, amount, gameId, userId'
        });
      }

      // Generate unique request ID
      const requestId = `WTH_${gameId}_${userId}_${Date.now()}`;

      // Initiate withdrawal with payment service
      const withdrawalResult = await paymentService.initiateWithdrawal(phoneNumber, amount, requestId);

      // Store payment record in database
      const insertQuery = `
        INSERT INTO payments (
          game_id, 
          user_id, 
          phone_number, 
          amount, 
          transaction_type, 
          request_id, 
          status, 
          payout_reason,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *;
      `;

      const paymentRecord = await pool.query(insertQuery, [
        gameId,
        userId,
        phoneNumber,
        amount,
        'withdrawal',
        requestId,
        'pending',
        reason || 'game_payout'
      ]);

      res.json({
        success: true,
        message: 'Withdrawal initiated successfully',
        data: {
          paymentId: paymentRecord.rows[0].id,
          requestId: requestId,
          amount: amount,
          phoneNumber: phoneNumber,
          withdrawalResponse: withdrawalResult
        }
      });

    } catch (error) {
      console.error('Error initiating withdrawal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate withdrawal',
        error: error.message
      });
    }
  }

  // Handle webhook callbacks from payment provider
  async handleCallback(req, res) {
    try {
      console.log('Payment callback received:', req.body);

      const { requestId, status, transactionId, amount, phoneNumber } = req.body;

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: 'Missing requestId in callback'
        });
      }

      // Update payment status in database
      const updateQuery = `
        UPDATE payments 
        SET 
          status = $1,
          transaction_id = $2,
          callback_data = $3,
          updated_at = NOW()
        WHERE request_id = $4
        RETURNING *;
      `;

      const result = await pool.query(updateQuery, [
        status || 'completed',
        transactionId,
        JSON.stringify(req.body),
        requestId
      ]);

      if (result.rows.length === 0) {
        console.error('Payment record not found for requestId:', requestId);
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      const payment = result.rows[0];

      // Emit socket event to notify user of payment status change
      const io = req.app.get('io');
      if (io && payment.user_id) {
        console.log(`🔔 [PAYMENT] Emitting payment update to user ${payment.user_id}:`, {
          type: payment.transaction_type,
          status: payment.status,
          amount: payment.amount
        });
        
        io.to(`user_${payment.user_id}`).emit('payment-status-update', {
          paymentId: payment.id,
          requestId: payment.request_id,
          transactionType: payment.transaction_type,
          status: payment.status,
          amount: payment.amount,
          transactionId: payment.transaction_id,
          timestamp: new Date().toISOString()
        });

        // Also emit specific events for different payment types
        if (payment.transaction_type === 'deposit' && payment.status === 'completed') {
          io.to(`user_${payment.user_id}`).emit('deposit-completed', {
            amount: payment.amount,
            requestId: payment.request_id,
            timestamp: new Date().toISOString()
          });
        }
      }

      // If this is a deposit callback, check if both players have deposited
      if (payment.transaction_type === 'deposit' && payment.challenge_id) {
        await this.checkBothDepositsComplete(payment.challenge_id);
      }

      res.json({
        success: true,
        message: 'Callback processed successfully'
      });

    } catch (error) {
      console.error('Error processing payment callback:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process callback',
        error: error.message
      });
    }
  }

  // Check if both players have deposited for a challenge
  async checkBothDepositsComplete(challengeId) {
    try {
      const query = `
        SELECT COUNT(*) as deposit_count
        FROM payments 
        WHERE challenge_id = $1 
        AND transaction_type = 'deposit' 
        AND status = 'completed';
      `;

      const result = await pool.query(query, [challengeId]);
      const depositCount = parseInt(result.rows[0].deposit_count);

      if (depositCount >= 2) {
        // Both players have deposited, update challenge status
        const updateChallengeQuery = `
          UPDATE challenges 
          SET status = 'deposits_complete'
          WHERE id = $1;
        `;
        
        await pool.query(updateChallengeQuery, [challengeId]);
        
        console.log(`Both deposits complete for challenge ${challengeId}`);
        
        // TODO: Emit socket event to start the game
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking deposits:', error);
      return false;
    }
  }

  // Get payment status for a challenge or game
  async getPaymentStatus(req, res) {
    try {
      const { challengeId, gameId } = req.query;

      if (!challengeId && !gameId) {
        return res.status(400).json({
          success: false,
          message: 'Either challengeId or gameId is required'
        });
      }

      let query = `
        SELECT * FROM payments 
        WHERE ${challengeId ? 'challenge_id = $1' : 'game_id = $1'}
        ORDER BY created_at DESC;
      `;

      const result = await pool.query(query, [challengeId || gameId]);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Error getting payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment status',
        error: error.message
      });
    }
  }

  // Process game payout based on outcome
  async processGamePayout(gameId, result, challengerData, opponentData) {
    try {
      console.log(`Processing payout for game ${gameId} with result: ${result}`);

      // Get payment details for this game's challenge
      const challengeQuery = `
        SELECT c.*, p.amount, p.phone_number as challenger_phone, p2.phone_number as opponent_phone
        FROM challenges c
        LEFT JOIN payments p ON c.id = p.challenge_id AND p.user_id = c.challenger
        LEFT JOIN payments p2 ON c.id = p2.challenge_id AND p2.user_id = c.opponent
        WHERE c.id = $1;
      `;

      const challengeResult = await pool.query(challengeQuery, [gameId]);

      if (challengeResult.rows.length === 0) {
        console.log('No payment challenge found for challenge:', gameId);
        return;
      }

      const challenge = challengeResult.rows[0];
      const betAmount = challenge.amount;

      if (!betAmount || betAmount <= 0) {
        console.log('No bet amount for challenge:', gameId);
        return;
      }

      // Determine payout logic based on result
      const drawResults = [
        'insufficient', 'timevsinsufficient', 'repetition', 'threefold_repetition',
        'stalemate', 'agreed', 'fifty_move', 'aborted'
      ];

      const winResults = ['win'];
      const opponentWinResults = [
        'resigned', 'timeout', 'checkmated', 'abandoned', 'adjudication', 'rule_violation'
      ];

      if (drawResults.includes(result)) {
        // Refund both players
        await this.refundPlayer(challengerData.id, challenge.challenger_phone, betAmount, gameId, 'draw_refund');
        await this.refundPlayer(opponentData.id, challenge.opponent_phone, betAmount, gameId, 'draw_refund');
      } else if (winResults.includes(result)) {
        // Challenger wins - pay out double amount
        await this.payoutWinner(challengerData.id, challenge.challenger_phone, betAmount * 2, gameId, 'game_win');
      } else if (opponentWinResults.includes(result)) {
        // Opponent wins - pay out double amount  
        await this.payoutWinner(opponentData.id, challenge.opponent_phone, betAmount * 2, gameId, 'game_win');
      } else {
        // Unknown result - treat as draw and refund both
        console.log(`Unknown result ${result}, treating as draw`);
        await this.refundPlayer(challengerData.id, challenge.challenger_phone, betAmount, gameId, 'unknown_result_refund');
        await this.refundPlayer(opponentData.id, challenge.opponent_phone, betAmount, gameId, 'unknown_result_refund');
      }

    } catch (error) {
      console.error('Error processing game payout:', error);
    }
  }

  async refundPlayer(userId, phoneNumber, amount, gameId, reason) {
    try {
      await paymentService.initiateWithdrawal(phoneNumber, amount, `REFUND_${gameId}_${userId}_${Date.now()}`);
      console.log(`Refunded ${amount} to ${phoneNumber} for reason: ${reason}`);
    } catch (error) {
      console.error(`Failed to refund ${amount} to ${phoneNumber}:`, error);
    }
  }

  async payoutWinner(userId, phoneNumber, amount, gameId, reason) {
    try {
      await paymentService.initiateWithdrawal(phoneNumber, amount, `PAYOUT_${gameId}_${userId}_${Date.now()}`);
      console.log(`Paid out ${amount} to ${phoneNumber} for reason: ${reason}`);
    } catch (error) {
      console.error(`Failed to payout ${amount} to ${phoneNumber}:`, error);
    }
  }

  // Get user balance
  async getUserBalance(req, res) {
    try {
      const userId = req.user.id;

      console.log(`🏦 [BALANCE] Fetching balance for user ${userId}`);

      // Calculate balance from completed payments
      const balanceQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_deposits,
          COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_withdrawals,
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' AND status = 'pending' THEN amount ELSE 0 END), 0) as pending_deposits,
          COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' AND status = 'pending' THEN amount ELSE 0 END), 0) as pending_withdrawals
        FROM payments 
        WHERE user_id = $1;
      `;

      const result = await pool.query(balanceQuery, [userId]);
      const balanceData = result.rows[0];

      const availableBalance = parseFloat(balanceData.total_deposits) - parseFloat(balanceData.total_withdrawals);
      const pendingBalance = parseFloat(balanceData.pending_deposits) - parseFloat(balanceData.pending_withdrawals);

      console.log(`💰 [BALANCE] User ${userId} balance calculated:`, {
        available: availableBalance,
        pending: pendingBalance,
        deposits: balanceData.total_deposits,
        withdrawals: balanceData.total_withdrawals
      });

      res.json({
        success: true,
        data: {
          availableBalance: availableBalance,
          pendingBalance: pendingBalance,
          totalDeposits: parseFloat(balanceData.total_deposits),
          totalWithdrawals: parseFloat(balanceData.total_withdrawals),
          pendingDeposits: parseFloat(balanceData.pending_deposits),
          pendingWithdrawals: parseFloat(balanceData.pending_withdrawals)
        }
      });

    } catch (error) {
      console.error('Error getting user balance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user balance',
        error: error.message
      });
    }
  }

  // Get user transaction history
  async getTransactionHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type } = req.query;

      console.log(`📜 [HISTORY] Fetching transaction history for user ${userId}`, {
        page,
        limit,
        type
      });

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build query with optional type filter
      let whereClause = 'WHERE user_id = $1';
      let queryParams = [userId];

      if (type && ['deposit', 'withdrawal'].includes(type)) {
        whereClause += ' AND transaction_type = $2';
        queryParams.push(type);
      }

      const historyQuery = `
        SELECT 
          id,
          challenge_id,
          game_id,
          phone_number,
          amount,
          transaction_type,
          status,
          request_id,
          transaction_id,
          payout_reason,
          created_at,
          updated_at
        FROM payments 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
      `;

      queryParams.push(parseInt(limit), offset);

      const result = await pool.query(historyQuery, queryParams);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM payments 
        ${whereClause};
      `;

      const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].total);

      console.log(`📊 [HISTORY] Found ${result.rows.length} transactions for user ${userId}`);

      res.json({
        success: true,
        data: {
          transactions: result.rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalCount: totalCount,
            hasNextPage: offset + result.rows.length < totalCount,
            hasPrevPage: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction history',
        error: error.message
      });
    }
  }
}

export default new PaymentController();
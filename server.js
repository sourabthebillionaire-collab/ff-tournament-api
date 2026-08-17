const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User');
const Match = require('./models/Match');
const Transaction = require('./models/Transaction');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = 'mongodb://sourabthebillionaire_db_user:sourab@ac-7bhc4dg-shard-00-00.k9rt1ty.mongodb.net:27017,ac-7bhc4dg-shard-00-01.k9rt1ty.mongodb.net:27017,ac-7bhc4dg-shard-00-02.k9rt1ty.mongodb.net:27017/ff-tournament?ssl=true&replicaSet=atlas-pl0qmb-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// AUTH
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, ign } = req.body;
    const user = new User({ email, password, ign, walletBalance: 100 });
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// MATCHES
app.get('/api/matches', async (req, res) => {
  try {
    const active = await Match.find({ isCompleted: false }).sort({ createdAt: -1 });
    const completed = await Match.find({ isCompleted: true }).sort({ createdAt: -1 });
    res.json({ active, completed });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/matches', async (req, res) => {
  try {
    const { title, entryFee, perKill, booyah, map, mode, time, roomId, roomPassword, spotsTotal } = req.body;
    const match = new Match({ title, entryFee, perKill, booyah, map, mode, time, roomId, roomPassword, spotsTotal: spotsTotal || 48 });
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/matches/:id', async (req, res) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ success: true, message: 'Match deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/matches/:id/complete', async (req, res) => {
  try {
    const { winnerIgn } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    match.isCompleted = true;
    match.winnerIgn = winnerIgn;
    
    if (winnerIgn) {
      const winner = await User.findOne({ ign: winnerIgn });
      if (winner) {
        winner.walletBalance += (match.booyah || 0);
        winner.totalEarned += (match.booyah || 0);
        await winner.save();
      }
    }
    
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/matches/:id/room', async (req, res) => {
  try {
    const { roomId, roomPassword } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    match.roomId = roomId;
    match.roomPassword = roomPassword;
    await match.save();
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// JOIN MATCH
app.post('/api/matches/:id/join', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    const match = await Match.findById(req.params.id);

    if (!user || !match) return res.status(404).json({ error: 'User or Match not found' });
    
    if (match.joinedUsers.includes(userId)) {
      return res.status(400).json({ error: 'User already joined' });
    }
    
    if (user.walletBalance < match.entryFee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    if (match.spotsFilled >= match.spotsTotal) {
      return res.status(400).json({ error: 'Match is full' });
    }
    
    user.walletBalance -= match.entryFee;
    user.joinedMatches.push(match._id);
    
    match.joinedUsers.push(user._id);
    match.spotsFilled += 1;
    
    await user.save();
    await match.save();
    
    res.json({ success: true, newBalance: user.walletBalance });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:id/joined-matches', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('joinedMatches');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.joinedMatches);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// LEADERBOARD
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find({ totalEarned: { $gt: 0 } })
      .sort({ totalEarned: -1 })
      .limit(10);
    res.json(topUsers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// USERS (Admin)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/users/:id/wallet', async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.walletBalance += Number(amount);
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id/profile', async (req, res) => {
  try {
    const { ign, uid } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (ign !== undefined) user.ign = ign;
    if (uid !== undefined) user.uid = uid;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// TRANSACTIONS
app.post('/api/transactions', async (req, res) => {
  try {
    const { userId, type, amount, utr, upiId, screenshotUrl } = req.body;
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    const transaction = new Transaction({ userId, type, amount: Number(amount), utr, upiId, screenshotUrl, status: 'PENDING' });
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find({}).populate('userId').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/transactions/:id/approve', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    
    if (transaction.status === 'APPROVED') {
      return res.status(400).json({ error: 'Transaction already approved' });
    }
    
    const user = await User.findById(transaction.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    transaction.status = 'APPROVED';
    if (transaction.type === 'DEPOSIT') {
      user.walletBalance += transaction.amount;
    } else if (transaction.type === 'WITHDRAWAL') {
      user.walletBalance -= transaction.amount;
    }
    
    await user.save();
    await transaction.save();
    
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/transactions/:id/reject', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    transaction.status = 'REJECTED';
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  ign: { type: String, default: '' },
  uid: { type: String, default: '' },
  walletBalance: { type: Number, default: 0 },
  joinedMatches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
  totalEarned: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);

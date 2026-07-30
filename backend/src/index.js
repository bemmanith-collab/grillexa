require('dotenv').config();
const app = require('./app');

// Fails at boot rather than at the first login, where jwt.sign would throw.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

// Backstop for rejections that escape a route (e.g. thrown from a timer or a
// stray promise). Node's default is to exit; log and keep serving instead.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

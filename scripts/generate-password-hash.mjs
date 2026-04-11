import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run auth:hash -- "your-password"');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const derived = await scryptAsync(password, salt, 64);
console.log(`scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`);

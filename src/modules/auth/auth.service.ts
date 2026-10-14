import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../db/mysql.js';
import { signToken } from '../../middlewares/auth.js';
import { HttpError } from '../../utils/http-error.js';
import type { UserRole } from '../../types/express.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const SALT_ROUNDS = 10;

interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export async function register(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [input.email, passwordHash, input.name],
    );
    const user: PublicUser = { id: result.insertId, email: input.email, name: input.name, role: 'customer' };
    return { user, token: signToken(user) };
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw HttpError.conflict('Email is already registered');
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT id, email, name, password_hash, role FROM users WHERE email = ?',
    [input.email],
  );
  const row = rows[0];

  // same message on purpose, so nobody can probe which emails are registered
  if (!row || !(await bcrypt.compare(input.password, row.password_hash))) {
    throw HttpError.unauthorized('Invalid email or password');
  }

  const user: PublicUser = { id: row.id, email: row.email, name: row.name, role: row.role };
  return { user, token: signToken(user) };
}

export async function getProfile(userId: number): Promise<PublicUser> {
  const [rows] = await pool.execute<UserRow[]>('SELECT id, email, name, role FROM users WHERE id = ?', [userId]);
  const row = rows[0];
  if (!row) throw HttpError.notFound('User not found');
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

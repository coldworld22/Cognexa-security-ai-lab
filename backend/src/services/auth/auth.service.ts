import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { RedisClientType } from "redis";
import { randomUUID } from "crypto";

import { env } from "../../config/env";
import { UserEntity } from "../../database/entities/user.entity";
import { UserRepository } from "../../database/repositories/user.repository";
import { AppError } from "../../utils/app-error";

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserEntity["role"];
  preferences: UserEntity["preferences"];
  lastLoginAt?: string;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly redis: RedisClientType
  ) {}

  async register(input: RegisterInput) {
    const existingUser = await this.users.findByEmail(input.email);

    if (existingUser) {
      throw new AppError("A user with this email already exists", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.create({
      email: input.email,
      displayName: input.displayName,
      passwordHash
    });

    return {
      user: this.toAuthenticatedUser(user),
      tokens: await this.issueTokens(user.id, user.email)
    };
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError("Invalid email or password", 401);
    }

    return {
      user: this.toAuthenticatedUser(user),
      tokens: await this.issueTokens(user.id, user.email)
    };
  }

  async refresh(refreshToken: string) {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    const session = await this.redis.get(`refresh:${decoded.jti as string}`);

    if (!session) {
      throw new AppError("Refresh token is no longer valid", 401);
    }

    return this.issueTokens(decoded.sub as string, decoded.email as string);
  }

  verifyAccessToken(token: string) {
    return jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  }

  private toAuthenticatedUser(user: UserEntity): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt
    };
  }

  private async issueTokens(userId: string, email: string) {
    const jti = randomUUID();
    const accessToken = jwt.sign({ email }, env.JWT_SECRET, {
      subject: userId,
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"]
    });
    const refreshToken = jwt.sign({ email, jti }, env.JWT_REFRESH_SECRET, {
      subject: userId,
      expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"]
    });

    await this.redis.set(`refresh:${jti}`, userId, {
      EX: 60 * 60 * 24 * 7
    });

    return {
      accessToken,
      refreshToken
    };
  }
}

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { RedisClientType } from "redis";
import { randomUUID } from "crypto";

import { CanonicalUserRole } from "../../authorization/authorization.types";
import { env } from "../../config/env";
import { normalizeUserRole } from "../../authorization/role-permission-matrix";
import { UserEntity } from "../../database/entities/user.entity";
import { UserRepository } from "../../database/repositories/user.repository";
import { AppError } from "../../utils/app-error";
import { WorkspaceSession, WorkspaceSummary } from "../../workspaces/workspace.types";
import { WorkspaceService } from "../workspace/workspace.service";

interface LoginInput {
  username: string;
  password: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: CanonicalUserRole;
  preferences: UserEntity["preferences"];
  currentWorkspaceId?: string;
  lastLoginAt?: string;
}

export interface AuthenticatedSession extends WorkspaceSession {
  user: AuthenticatedUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly redis: RedisClientType,
    private readonly workspaces: WorkspaceService
  ) {}

  async initialize(): Promise<void> {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    const admin = await this.users.upsert({
      email: env.ADMIN_LOGIN,
      displayName: env.ADMIN_DISPLAY_NAME,
      passwordHash,
      role: "super_admin"
    });
    await this.workspaces.ensureProvisionedForUser(admin);
  }

  async login(input: LoginInput) {
    const user = await this.users.findByLoginIdentifier(input.username);
    if (!user) {
      throw new AppError("Invalid username or password", 401);
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError("Invalid username or password", 401);
    }

    await this.users.updateLastLogin(user.id);
    const nextUser = (await this.users.findById(user.id)) ?? {
      ...user,
      lastLoginAt: new Date().toISOString()
    };
    const workspaceSession = await this.workspaces.listSessionForUser(nextUser);

    return {
      user: this.toAuthenticatedUser(nextUser),
      currentWorkspace: workspaceSession.currentWorkspace,
      workspaces: workspaceSession.workspaces,
      pendingInvitations: workspaceSession.pendingInvitations,
      tokens: await this.issueTokens(user.id, user.email)
    };
  }

  async register() {
    throw new AppError("Registration is disabled for this deployment", 403);
  }

  async refresh(refreshToken: string) {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"]
    }) as jwt.JwtPayload;
    const tokenId = decoded.jti as string | undefined;
    if (!tokenId) {
      throw new AppError("Refresh token is invalid", 401);
    }

    const session = await this.redis.get(`refresh:${tokenId}`);

    if (!session) {
      throw new AppError("Refresh token is no longer valid", 401);
    }

    if (session !== (decoded.sub as string)) {
      await this.redis.del(`refresh:${tokenId}`);
      throw new AppError("Refresh token is invalid", 401);
    }

    await this.redis.del(`refresh:${tokenId}`);
    return this.issueTokens(decoded.sub as string, decoded.email as string);
  }

  async updatePreferences(userId: string, preferences: Record<string, unknown>) {
    const currentUser = await this.users.findById(userId);
    if (!currentUser) {
      throw new AppError("User not found", 404);
    }

    const nextUser = await this.users.updatePreferences(userId, {
      ...currentUser.preferences,
      ...preferences
    });

    return this.toAuthenticatedUser(nextUser);
  }

  verifyAccessToken(token: string) {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"]
    }) as jwt.JwtPayload;
  }

  private toAuthenticatedUser(user: UserEntity): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: normalizeUserRole(user.role),
      preferences: user.preferences,
      currentWorkspaceId: user.currentWorkspaceId,
      lastLoginAt: user.lastLoginAt
    };
  }

  private async issueTokens(userId: string, email: string) {
    const jti = randomUUID();
    const accessToken = jwt.sign({ email }, env.JWT_SECRET, {
      subject: userId,
      algorithm: "HS256",
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"]
    });
    const refreshToken = jwt.sign({ email, jti }, env.JWT_REFRESH_SECRET, {
      subject: userId,
      algorithm: "HS256",
      expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"]
    });
    const decodedRefreshToken = jwt.decode(refreshToken) as jwt.JwtPayload | null;
    const refreshTokenTtlSeconds = decodedRefreshToken?.exp
      ? Math.max(decodedRefreshToken.exp - Math.floor(Date.now() / 1000), 1)
      : 60 * 60 * 24 * 7;

    await this.redis.set(`refresh:${jti}`, userId, {
      EX: refreshTokenTtlSeconds
    });

    return {
      accessToken,
      refreshToken
    };
  }
}

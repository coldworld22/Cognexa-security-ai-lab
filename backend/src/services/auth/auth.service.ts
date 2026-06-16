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
    const user = await this.users.findByEmail(input.username);
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

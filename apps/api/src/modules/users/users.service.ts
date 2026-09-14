import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";
import { PrismaService } from "../../shared/database/prisma.service.js";

@Injectable()
export class UsersService {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(tx: Prisma.TransactionClient, id: string): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  public async findByPhone(tx: Prisma.TransactionClient, phoneE164: string): Promise<User | null> {
    return tx.user.findUnique({ where: { phoneE164 } });
  }

  public async create(tx: Prisma.TransactionClient, phoneE164: string): Promise<User> {
    return tx.user.create({ data: { phoneE164 } });
  }

  public async getAuthenticatedUser(id: string): Promise<{ id: string; phone: string; phoneVerified: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, phoneE164: true, phoneVerifiedAt: true },
    });
    if (!user) {
      throw new UnauthorizedException("Authentication is required");
    }
    return {
      id: user.id,
      phone: user.phoneE164,
      phoneVerified: Boolean(user.phoneVerifiedAt),
    };
  }
}

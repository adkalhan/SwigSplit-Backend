import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";

@Injectable()
export class UsersService {
  public async findById(tx: Prisma.TransactionClient, id: string): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  public async findByPhone(tx: Prisma.TransactionClient, phoneE164: string): Promise<User | null> {
    return tx.user.findUnique({ where: { phoneE164 } });
  }

  public async create(tx: Prisma.TransactionClient, phoneE164: string): Promise<User> {
    return tx.user.create({ data: { phoneE164 } });
  }
}

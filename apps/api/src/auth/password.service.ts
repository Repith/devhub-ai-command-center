import { Injectable } from "@nestjs/common";
import { argon2id, hash, verify } from "argon2";

@Injectable()
export class PasswordService {
  public hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });
  }

  public async verify(hashValue: string, password: string): Promise<boolean> {
    try {
      return await verify(hashValue, password);
    } catch {
      return false;
    }
  }
}

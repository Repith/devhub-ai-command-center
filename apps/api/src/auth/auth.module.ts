import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { JwtService } from "@nestjs/jwt";

import { DatabaseModule } from "../database/database.module";
import { AUTH_CONFIG, loadAuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import {
  AUTH_REFLECTOR,
  AUTH_SERVICE,
  JWT_SERVICE,
  PASSWORD_SERVICE,
  TOKEN_SERVICE
} from "./auth.tokens";
import { MeController } from "./me.controller";
import { PasswordService } from "./password.service";
import { RolesGuard } from "./roles.guard";
import { TokenService } from "./token.service";

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [AuthController, MeController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    { provide: AUTH_REFLECTOR, useExisting: Reflector },
    { provide: JWT_SERVICE, useExisting: JwtService },
    { provide: PASSWORD_SERVICE, useExisting: PasswordService },
    { provide: TOKEN_SERVICE, useExisting: TokenService },
    { provide: AUTH_SERVICE, useExisting: AuthService },
    AuthGuard,
    AuthService,
    PasswordService,
    RolesGuard,
    TokenService
  ],
  exports: [
    AUTH_CONFIG,
    AUTH_REFLECTOR,
    JWT_SERVICE,
    TOKEN_SERVICE,
    AuthGuard,
    RolesGuard
  ]
})
export class AuthModule {}

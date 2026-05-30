import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * API Key Guard
 *
 * Simple but effective auth for IoT device-to-server communication.
 * Devices send a shared secret in the `x-api-key` header.
 *
 * In production: consider rotating keys, per-device keys, or JWT.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.config.get<string>('API_KEY');

    if (!expectedKey) {
      // Fail open only in dev; in prod this would throw
      if (this.config.get('NODE_ENV') === 'production') {
        throw new UnauthorizedException('API key not configured on server');
      }
      return true;
    }

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}

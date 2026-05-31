import { Module } from "@nestjs/common";
import { CacheModule as NestCacheModule } from "@nestjs/cache-manager";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { redisStore } from "cache-manager-redis-yet";

@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        // In test environment, use in-memory cache (no Redis needed)
        if (config.get("NODE_ENV") === "test") {
          return { ttl: 300 };
        }

        const host = config.get("REDIS_HOST", "localhost");
        const port = config.get<number>("REDIS_PORT", 6379);

        const store = await redisStore({
          socket: { host, port },
        });

        return {
          store,
          ttl: 300,
        };
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class AppCacheModule {}

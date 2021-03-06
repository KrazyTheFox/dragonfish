import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { getJwtSecretKey, JWT_EXPIRATION } from '../../util';
import { UsersModule } from '../../db/users/users.module';
import { ApprovalQueueModule } from '../../db/approval-queue/approval-queue.module';
import { QueueController } from './queue/queue.controller';
import { QueueService } from './queue/queue.service';
import { WorksModule } from '../../db/works/works.module';
import { ContentModule } from '../../db/content';

@Module({
    imports: [
        ContentModule,
        UsersModule,
        ApprovalQueueModule,
        WorksModule,
        JwtModule.registerAsync({
            useFactory: () => ({
                secret: getJwtSecretKey(),
                signOptions: { expiresIn: JWT_EXPIRATION },
            }),
        }),
    ],
    controllers: [QueueController],
    providers: [QueueService],
})
export class DashboardModule {}

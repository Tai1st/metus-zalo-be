import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersInternalController } from './users-internal.controller';
import { CustomersController } from './customers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController, UsersInternalController, CustomersController],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';
import { jsonSchemaOptions } from '../../../common/mongoose-json';

@Schema(jsonSchemaOptions)
export class User {
  /** Login name, lowercase (a-z 0-9 . _ -). No email is needed to sign in. */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  /** bcrypt hash — never selected or serialised by default. */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ default: '', trim: true })
  phone: string;

  @Prop({ type: String, enum: Object.values(Role), default: Role.User })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  /** For Role.Staff: the customer (User) that owns this employee. */
  @Prop({ default: '' })
  ownerId: string;

  /** Zalo account ids this user may see/operate — ignored for Role.Admin
   * (always full access). Empty for a new employee until an admin assigns some. */
  @Prop({ type: [String], default: [] })
  allowedZaloIds: string[];
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

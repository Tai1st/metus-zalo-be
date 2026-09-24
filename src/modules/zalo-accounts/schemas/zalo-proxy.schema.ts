import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'zalo_proxies' })
export class ZaloProxy {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ default: '' })
  label: string;

  @Prop({
    type: String,
    required: true,
    enum: ['http', 'socks5'],
    default: 'http',
  })
  protocol: 'http' | 'socks5';

  @Prop({ required: true })
  host: string;

  @Prop({ required: true })
  port: number;

  @Prop({ default: '' })
  username: string;

  @Prop({ default: '' })
  password: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdAt: string;
}

export type ZaloProxyDocument = HydratedDocument<ZaloProxy>;
export const ZaloProxySchema = SchemaFactory.createForClass(ZaloProxy);

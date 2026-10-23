import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** UDID do iPhone gửi về sau khi cài profile; gắn với user qua token trong URL profile. */
@Schema({ collection: 'cert_enrolls' })
export class CertEnroll {
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ required: true }) userId: string;
  @Prop() udid?: string;
  @Prop() product?: string;
  @Prop() version?: string;
  /** TTL 1 giờ. */
  @Prop({ default: () => new Date(), expires: 3600 }) createdAt: Date;
}

export type CertEnrollDocument = HydratedDocument<CertEnroll>;
export const CertEnrollSchema = SchemaFactory.createForClass(CertEnroll);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * App tiện ích có sẵn trên server để chọn nhanh khi ký (vd ESign), khác với app chính của shop
 * (Metus, quản lý ở cert_settings) — khách tự chọn 1 trong các app này làm nguồn ký thay vì tải file lên.
 */
@Schema({ collection: 'cert_quick_apps', timestamps: true })
export class CertQuickApp {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) file: string;
  @Prop() version?: string;
  @Prop() bundleId?: string;
  @Prop() minOs?: string;
  @Prop() size?: number;
}

export type CertQuickAppDocument = HydratedDocument<CertQuickApp>;
export const CertQuickAppSchema = SchemaFactory.createForClass(CertQuickApp);

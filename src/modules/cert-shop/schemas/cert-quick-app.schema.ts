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
  /** Có khi app được tải lên/nhập tay (file nằm trên đĩa server). */
  @Prop() file?: string;
  /** Có khi app nhập hàng loạt từ repo.json: không tải sẵn, BE chỉ tải khi có người thực sự ký app này. */
  @Prop() downloadURL?: string;
  @Prop() version?: string;
  @Prop() bundleId?: string;
  @Prop() minOs?: string;
  @Prop() size?: number;
}

export type CertQuickAppDocument = HydratedDocument<CertQuickApp>;
export const CertQuickAppSchema = SchemaFactory.createForClass(CertQuickApp);

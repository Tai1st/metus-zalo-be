import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Backs `nextSeq()` — gives Mongo documents plain incrementing integer ids
 * (proxies, account labels, chat labels) so the ids stay wire-compatible with
 * the Next app and its frontend types, which are all `id: number`. */
@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export type CounterDocument = HydratedDocument<Counter>;
export const CounterSchema = SchemaFactory.createForClass(Counter);

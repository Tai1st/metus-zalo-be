import { SchemaOptions } from '@nestjs/mongoose';

/** Timestamps + JSON output with `id` instead of `_id`/`__v`, no secrets. */
export const jsonSchemaOptions: SchemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  },
};

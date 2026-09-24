import { PartialType } from '@nestjs/swagger';
import { CreateAddonDto } from './create-addon.dto';

export class UpdateAddonDto extends PartialType(CreateAddonDto) {}

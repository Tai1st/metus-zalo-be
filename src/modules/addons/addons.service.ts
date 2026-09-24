import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Addon, AddonDocument } from './schemas/addon.schema';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { DEFAULT_ADDONS } from './addons.seed';
import { hasDuplicateMonths } from '../../common/pricing';

@Injectable()
export class AddonsService implements OnModuleInit {
  private readonly log = new Logger(AddonsService.name);

  constructor(
    @InjectModel(Addon.name) private readonly model: Model<AddonDocument>,
  ) {}

  async onModuleInit() {
    if ((await this.model.estimatedDocumentCount()) > 0) return;
    await this.model.insertMany(DEFAULT_ADDONS);
    this.log.log(`Đã tạo ${DEFAULT_ADDONS.length} gói mua thêm mặc định`);
  }

  listActive() {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1 });
  }

  listAll() {
    return this.model.find().sort({ sortOrder: 1 });
  }

  async get(id: string) {
    const addon = await this.model.findById(id);
    if (!addon) throw new NotFoundException('Không tìm thấy gói mua thêm');
    return addon;
  }

  async create(dto: CreateAddonDto) {
    if (hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi chu kỳ chỉ được có một mức giá');
    }
    if (await this.model.exists({ code: dto.code })) {
      throw new ConflictException('Mã gói mua thêm đã tồn tại');
    }
    return this.model.create(dto);
  }

  async update(id: string, dto: UpdateAddonDto) {
    if (dto.prices && hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi chu kỳ chỉ được có một mức giá');
    }
    if (
      dto.code &&
      (await this.model.exists({ code: dto.code, _id: { $ne: id } }))
    ) {
      throw new ConflictException('Mã gói mua thêm đã tồn tại');
    }
    const addon = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!addon) throw new NotFoundException('Không tìm thấy gói mua thêm');
    return addon;
  }

  deactivate(id: string) {
    return this.update(id, { isActive: false });
  }
}

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
import { Plan, PlanDocument } from './schemas/plan.schema';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { DEFAULT_PLANS, TRIAL_PLAN } from './plans.seed';
import { hasDuplicateMonths } from '../../common/pricing';

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly log = new Logger(PlansService.name);

  constructor(
    @InjectModel(Plan.name) private readonly model: Model<PlanDocument>,
  ) {}

  async onModuleInit() {
    if ((await this.model.estimatedDocumentCount()) === 0) {
      await this.model.insertMany(DEFAULT_PLANS);
      this.log.log(`Đã tạo ${DEFAULT_PLANS.length} gói cước mặc định`);
    }
    if (!(await this.model.exists({ code: TRIAL_PLAN.code }))) {
      await this.model.create(TRIAL_PLAN);
      this.log.log('Đã tạo gói dùng thử (trial)');
    }
  }

  listActive() {
    return this.model.find({ isActive: true, isPublic: { $ne: false } }).sort({ sortOrder: 1 });
  }

  listAll() {
    return this.model.find().sort({ sortOrder: 1 });
  }

  async get(id: string) {
    const plan = await this.model.findById(id);
    if (!plan) throw new NotFoundException('Không tìm thấy gói cước');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    if (hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi chu kỳ chỉ được có một mức giá');
    }
    if (await this.model.exists({ code: dto.code })) {
      throw new ConflictException('Mã gói cước đã tồn tại');
    }
    return this.model.create(dto);
  }

  async update(id: string, dto: UpdatePlanDto) {
    if (dto.prices && hasDuplicateMonths(dto.prices)) {
      throw new BadRequestException('Mỗi chu kỳ chỉ được có một mức giá');
    }
    if (
      dto.code &&
      (await this.model.exists({ code: dto.code, _id: { $ne: id } }))
    ) {
      throw new ConflictException('Mã gói cước đã tồn tại');
    }
    const plan = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!plan) throw new NotFoundException('Không tìm thấy gói cước');
    return plan;
  }

  /** "Delete" = stop selling; existing subscriptions keep their snapshot. */
  deactivate(id: string) {
    return this.update(id, { isActive: false });
  }
}

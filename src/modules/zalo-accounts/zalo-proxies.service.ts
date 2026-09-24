import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { ProxyInputDto } from './dto/proxy-input.dto';
import { ZaloProxy, ZaloProxyDocument } from './schemas/zalo-proxy.schema';

export type ProxyLike = {
  protocol: 'http' | 'socks5';
  host: string;
  port: number;
  username: string;
  password: string;
};

export type ProxyPublic = ProxyLike & {
  id: number;
  ownerId: string;
  label: string;
  isActive: boolean;
  createdAt: string;
};

const COUNTER = 'zalo_proxies';

@Injectable()
export class ZaloProxiesService {
  constructor(
    @InjectModel(ZaloProxy.name)
    private readonly model: Model<ZaloProxyDocument>,
    private readonly counters: CounterService,
  ) {}

  private toPublic(doc: ZaloProxyDocument): ProxyPublic {
    return {
      id: doc.seq,
      ownerId: doc.ownerId ?? '',
      label: doc.label,
      protocol: doc.protocol,
      host: doc.host,
      port: doc.port,
      username: doc.username,
      password: doc.password,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
    };
  }

  list(): Promise<ProxyPublic[]> {
    return this.model
      .find()
      .sort({ seq: 1 })
      .then((rows) => rows.map((r) => this.toPublic(r)));
  }

  async exists(id: number): Promise<boolean> {
    return (await this.model.exists({ seq: id })) !== null;
  }

  async getLike(id: number): Promise<ProxyLike | null> {
    const row = await this.model.findOne({ seq: id });
    if (!row) return null;
    return {
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
    };
  }

  async create(input: ProxyInputDto): Promise<ProxyPublic> {
    const seq = await this.counters.next(COUNTER);
    const row = await this.model.create({
      seq,
      label: input.label ?? '',
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      username: input.username ?? '',
      password: input.password ?? '',
      isActive: input.isActive ?? true,
      ownerId: input.ownerId ?? '',
      createdAt: new Date().toISOString(),
    });
    return this.toPublic(row);
  }

  async update(id: number, input: ProxyInputDto): Promise<ProxyPublic> {
    const row = await this.model.findOneAndUpdate(
      { seq: id },
      {
        label: input.label ?? '',
        protocol: input.protocol,
        host: input.host,
        port: input.port,
        username: input.username ?? '',
        password: input.password ?? '',
        isActive: input.isActive ?? true,
      },
      { new: true },
    );
    if (!row) throw new NotFoundException('Không tìm thấy proxy');
    return this.toPublic(row);
  }

  async remove(id: number): Promise<void> {
    await this.model.deleteOne({ seq: id });
  }
}

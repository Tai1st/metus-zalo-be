import { IsInt, IsOptional } from 'class-validator';

export class ProxyBodyDto {
  @IsOptional() @IsInt() proxyId?: number | null;
}

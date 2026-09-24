import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ScheduleInputDto {
  @IsString() name: string;
  @IsInt() campaignId: number;
  @IsIn(['once', 'daily', 'hourly']) repeat: string;
  @IsString() timeOfDay: string;
  @IsOptional() @IsString() timeOfDayEnd: string | null;
  @IsInt() @Min(1) intervalDays: number;
  @IsInt() @Min(1) intervalHours: number;
  @IsString() fromDate: string;
  @IsOptional() @IsString() toDate: string | null;
  @IsBoolean() enabled: boolean;
  @IsBoolean() skipFailed: boolean;
  @IsBoolean() skipSucceeded: boolean;
  /** Computed by the Next app (pure date logic) and passed through as-is. */
  @IsOptional() @IsString() nextRun?: string | null;
}

export class UpdateScheduleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() campaignId?: number;
  @IsOptional() @IsIn(['once', 'daily', 'hourly']) repeat?: string;
  @IsOptional() @IsString() timeOfDay?: string;
  @IsOptional() @IsString() timeOfDayEnd?: string | null;
  @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @IsOptional() @IsInt() @Min(1) intervalHours?: number;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() skipFailed?: boolean;
  @IsOptional() @IsBoolean() skipSucceeded?: boolean;
  @IsOptional() @IsString() nextRun?: string | null;
}

export class MarkRanDto {
  @IsOptional() @IsString() nextRun: string | null;
}

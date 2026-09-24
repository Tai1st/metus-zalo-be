import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

const KINDS = [
  'phone',
  'friend',
  'group_member',
  'group_link',
  'sent_request',
  'group',
  'backup_file',
];

export class CreateCampaignDto {
  @IsString() name: string;
  @IsIn(KINDS) kind: string;
  /** JSON-stringified CampaignConfig — validated/merged with defaults on the Next side. */
  @IsString() config: string;
  @IsArray() @ArrayMaxSize(2000) accountIds: string[];
  @IsArray() @ArrayMaxSize(200_000) targets: string[];
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() config?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2000) accountIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200_000) targets?: string[];
}

export class CampaignStatusDto {
  @IsIn(['draft', 'running', 'paused', 'done', 'error'])
  status: string;
}

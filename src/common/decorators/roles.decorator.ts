import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
/** Allow only the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

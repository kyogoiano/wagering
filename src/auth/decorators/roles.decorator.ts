import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export enum JungleRole {
  ADMIN = 'jungle-admin',
  OPERATOR = 'jungle-operator',
  READER = 'jungle-reader',
}

export const Roles = (...roles: JungleRole[]) => SetMetadata(ROLES_KEY, roles);

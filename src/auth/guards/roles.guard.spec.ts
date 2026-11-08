import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { RolesGuard } from './roles.guard';
import { JungleRole } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: Mock<() => any> };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: mock(),
    };
    guard = new RolesGuard(reflector as any);
  });

  it.each([
    // [description, requiredRoles, userRoles, expected]
    ['allows ADMIN when ADMIN is required', [JungleRole.ADMIN], [JungleRole.ADMIN], true],
    ['allows OPERATOR when OPERATOR is required', [JungleRole.OPERATOR], [JungleRole.OPERATOR], true],
    ['allows READER when READER is required', [JungleRole.READER], [JungleRole.READER], true],
    ['allows ADMIN when OPERATOR or ADMIN required', [JungleRole.OPERATOR, JungleRole.ADMIN], [JungleRole.ADMIN], true],
    ['allows OPERATOR when OPERATOR or ADMIN required', [JungleRole.OPERATOR, JungleRole.ADMIN], [JungleRole.OPERATOR], true],
    ['allows user with multiple roles', [JungleRole.ADMIN], [JungleRole.ADMIN, JungleRole.OPERATOR], true],
  ])('%s', (_, requiredRoles, userRoles, _expected) => {
    const context = createMockContext(userRoles);
    reflector.getAllAndOverride.mockReturnValue(requiredRoles);

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([
    // [description, requiredRoles, userRoles]
    ['rejects READER when ADMIN required', [JungleRole.ADMIN], [JungleRole.READER]],
    ['rejects OPERATOR when ADMIN required', [JungleRole.ADMIN], [JungleRole.OPERATOR]],
    ['rejects READER when OPERATOR required', [JungleRole.OPERATOR], [JungleRole.READER]],
    ['rejects user with no matching roles', [JungleRole.ADMIN, JungleRole.OPERATOR], [JungleRole.READER]],
    ['rejects user with empty roles', [JungleRole.ADMIN], []],
  ])('%s', (_, requiredRoles, userRoles) => {
    const context = createMockContext(userRoles);
    reflector.getAllAndOverride.mockReturnValue(requiredRoles);

    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });

  it('returns true when no roles are required', () => {
    const context = createMockContext([JungleRole.READER]);
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns true when requiredRoles is empty array', () => {
    const context = createMockContext([JungleRole.READER]);
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when user has no roles property', () => {
    const context = createMockContext(null);
    reflector.getAllAndOverride.mockReturnValue([JungleRole.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });

  it('rejects when user is undefined', () => {
    const context = createMockContext(undefined);
    reflector.getAllAndOverride.mockReturnValue([JungleRole.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });
});

function createMockContext(roles: string[] | null | undefined) {
  const user = roles !== undefined ? { roles } : undefined;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => {},
    getClass: () => {},
  } as any;
}

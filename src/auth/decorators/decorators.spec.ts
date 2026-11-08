import { describe, it, expect } from 'bun:test';
import { Roles, JungleRole, ROLES_KEY } from './roles.decorator';
import { Public, IS_PUBLIC_KEY } from './public.decorator';

describe('Roles Decorator', () => {
  it('sets metadata with single role', () => {
    function target() {}
    Roles(JungleRole.ADMIN)(target);
    const metadata = Reflect.getMetadata(ROLES_KEY, target);
    expect(metadata).toEqual([JungleRole.ADMIN]);
  });

  it('sets metadata with multiple roles', () => {
    function target() {}
    Roles(JungleRole.ADMIN, JungleRole.OPERATOR)(target);
    const metadata = Reflect.getMetadata(ROLES_KEY, target);
    expect(metadata).toEqual([JungleRole.ADMIN, JungleRole.OPERATOR]);
  });

  it.each([
    [JungleRole.ADMIN, 'jungle-admin'],
    [JungleRole.OPERATOR, 'jungle-operator'],
    [JungleRole.READER, 'jungle-reader'],
  ])('JungleRole.%s equals "%s"', (role, expected) => {
    expect(role).toBe(expected);
  });
});

describe('Public Decorator', () => {
  it('sets isPublic metadata to true', () => {
    function target() {}
    Public()(target);
    const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, target);
    expect(metadata).toBe(true);
  });

  it('can be applied to a class', () => {
    @Public()
    class TestController {}
    const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, TestController);
    expect(metadata).toBe(true);
  });
});

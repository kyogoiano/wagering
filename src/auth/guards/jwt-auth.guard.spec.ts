import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: { getAllAndOverride: Mock<() => any> };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: mock(),
    };
    guard = new JwtAuthGuard(reflector as any);
  });

  it('returns true when handler is marked @Public()', () => {
    const context = createMockContext();
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns true when class is marked @Public()', () => {
    const context = createMockContext();
    // getAllAndOverride returns the first truthy value it finds
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('calls super.canActivate when endpoint is not public', () => {
    const context = createMockContext();
    reflector.getAllAndOverride.mockReturnValue(false);
    // When not public, AuthGuard('jwt').canActivate is called which throws
    // because no real strategy is configured — that's expected in unit tests
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('passes IS_PUBLIC_KEY to reflector', () => {
    const context = createMockContext();
    reflector.getAllAndOverride.mockReturnValue(true);
    guard.canActivate(context);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
  });
});

function createMockContext() {
  const handler = function testHandler() {};
  const cls = class TestController {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({}),
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as any;
}

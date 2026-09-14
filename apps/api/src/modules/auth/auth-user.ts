import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

export type AuthenticatedUser = { id: string; sessionId: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ authenticatedUser?: AuthenticatedUser }>();
    if (!request.authenticatedUser) {
      throw new UnauthorizedException("Authentication is required");
    }
    return request.authenticatedUser;
  },
);

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = typeof payload === "object" && payload !== null ? payload : {};
    const message = typeof payload === "object" && payload !== null && "message" in payload
      ? (Array.isArray(payload.message) ? "Request validation failed" : String(payload.message))
      : status === HttpStatus.INTERNAL_SERVER_ERROR ? "Internal server error" : "Request failed";

    response.status(status).send({
      ...("status" in details ? { status: details.status } : {}),
      ...("dependencies" in details ? { dependencies: details.dependencies } : {}),
      statusCode: status,
      error: HttpStatus[status] ?? "Error",
      message,
      requestId: request.id,
    });
  }
}

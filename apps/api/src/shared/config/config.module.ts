import { Global, Module } from "@nestjs/common";
import { Environment, loadEnvironment } from "./environment.js";

export const ENVIRONMENT = Symbol("ENVIRONMENT");

@Global()
@Module({
  providers: [{ provide: ENVIRONMENT, useFactory: (): Environment => loadEnvironment() }],
  exports: [ENVIRONMENT],
})
export class ConfigModule {}

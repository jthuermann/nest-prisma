import { DynamicModule } from '@nestjs/common';
import { PrismaModuleOptions } from "./options";
export declare class PrismaModule {
    static forRoot(options: PrismaModuleOptions): DynamicModule;
}

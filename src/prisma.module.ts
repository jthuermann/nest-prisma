import {DynamicModule, Global, Module} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {PrismaModuleOptions} from "./options";
import {PRISMA_OPTIONS} from "./constants";

@Global()
@Module({})
export class PrismaModule {

    static forRoot(options: PrismaModuleOptions): DynamicModule {
        return {
            module: PrismaModule,
            providers: [
                {
                    provide: PRISMA_OPTIONS,
                    useValue: options,
                },
                PrismaService,
            ],
            exports: [PrismaService],
        }
    }

}

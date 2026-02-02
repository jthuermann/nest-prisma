import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from "@prisma/client";
import { PrismaModuleOptions } from "./options";
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly moduleOptions;
    private readonly logger;
    private pgClient;
    private listeners;
    private nextListener;
    constructor(moduleOptions: PrismaModuleOptions);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getTables(): string[];
    getTableCaseInsensitive(name: string): any;
    getTable(name: string): any;
    private setupTriggers;
    private initPgListener;
    private handleNotification;
    registerListener(execute: (table: string, method: string, old: any, now: any) => void, tables: string[], methods?: string[]): number;
    private removeListener;
}

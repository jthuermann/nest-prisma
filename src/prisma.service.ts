import {Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {PrismaClient, Prisma} from "@prisma/client";
import {Client} from "pg";
import {TableChangeListener} from "./table-change-listener";
import {PRISMA_OPTIONS} from "./constants";
import {PrismaModuleOptions} from "./options";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(PrismaService.name);
    private pgClient: Client
    private listeners: Map<number, TableChangeListener> = new Map()
    private nextListener: number = 1


    constructor(
        @Inject(PRISMA_OPTIONS) private readonly moduleOptions: PrismaModuleOptions
    ) {
        super()
    }

    async onModuleInit() {
        await this.$connect()
        await this.setupTriggers()
        await this.initPgListener()
    }

    async onModuleDestroy() {
        await this.$disconnect()
    }

    getTables(): string[] {
        return Object.keys(this).filter(k =>
            !k.startsWith("$") && !k.startsWith("_") && typeof this[k] !== "function"
        );
    }

    getTableCaseInsensitive(name: string) {
        const tables = this.getTables()
        for (const table of tables) {
            if (name.toLowerCase() === table.toLowerCase()) {
                return this.getTable(table)
            }
        }
        return null
    }

    getTable(name: string) {
        return (this as any)[name]
    }

    private async setupTriggers() {
        try {
            await this.$executeRawUnsafe(`
                CREATE OR REPLACE FUNCTION notify_table_change()
                RETURNS trigger AS $$
                DECLARE
                    payload JSON;
                    row_id INT;
                BEGIN
                    IF (TG_OP = 'DELETE') THEN
                      row_id := OLD.id;
                    ELSE
                      row_id := NEW.id;
                    END IF;
                    
                    payload := json_build_object(
                      'table', TG_TABLE_NAME,
                      'action', TG_OP,
                      'old', OLD,
                      'now', NEW
                    );
                    
                    PERFORM pg_notify('table_changes', payload::text);
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;
            `);

            await this.$executeRawUnsafe(`
                DO $$
                DECLARE
                tbl RECORD;
                trigger_name TEXT;
                BEGIN
                    FOR tbl IN
                      SELECT table_name
                      FROM information_schema.columns
                      WHERE column_name = 'id'
                        AND table_schema = 'public'
                    LOOP
                      trigger_name := tbl.table_name || '_change_trigger';
                      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', trigger_name, tbl.table_name);
                      EXECUTE format(
                        'CREATE TRIGGER %I
                         AFTER INSERT OR UPDATE OR DELETE ON %I
                         FOR EACH ROW EXECUTE FUNCTION notify_table_change();',
                        trigger_name, tbl.table_name
                      );
                    END LOOP;
                END;
                $$;
            `);
        } catch (error) {
            console.error(error);
        }
    }

    private async initPgListener() {
        this.pgClient = new Client({
            connectionString: this.moduleOptions.url,
        })
        await this.pgClient.connect()
        await this.pgClient.query('LISTEN table_changes')

        this.pgClient.on('notification', (msg: any) => {
            const payload = JSON.parse(msg.payload)
            this.handleNotification(payload)
        })

        this.pgClient.on('error', () => {})
    }

    private handleNotification(payload: any) {
        const { table, action, old, now } = payload
        this.logger.log(`Prisma table ${table} change: ${action} at ${old?.id} -> ${now?.id}`)
        for (const listener of this.listeners.values()) {
            if (
                listener.getMethods().map(m => m.toLowerCase()).includes(action.toLowerCase()) &&
                listener.getTables().map(m => m.toLowerCase()).includes(table.toLowerCase())
            ) {
                listener.execute(table, action, old, now)
            }
        }
    }

    registerListener(execute: (table: string, method: string, old: any, now: any) => void, tables: string[], methods: string[] = ["INSERT", "UPDATE", "DELETE"]) {
        const listener: TableChangeListener = {
            getMethods: () => methods,
            getTables: () => tables,
            execute: execute,
        }
        this.listeners.set(this.nextListener, listener)
        return this.nextListener++;
    }

    private removeListener(key: number) {
        this.listeners.delete(key)
    }

}

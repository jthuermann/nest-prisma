"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const constants_1 = require("./constants");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    constructor(moduleOptions) {
        super({ adapter: new adapter_pg_1.PrismaPg({ connectionString: moduleOptions.url }) });
        this.moduleOptions = moduleOptions;
        this.logger = new common_1.Logger(PrismaService_1.name);
        this.listeners = new Map();
        this.nextListener = 1;
    }
    async onModuleInit() {
        await this.$connect();
        await this.setupTriggers();
        await this.initPgListener();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
    getTables() {
        return Object.keys(this).filter(k => !k.startsWith("$") && !k.startsWith("_") && typeof this[k] !== "function");
    }
    getTableCaseInsensitive(name) {
        const tables = this.getTables();
        for (const table of tables) {
            if (name.toLowerCase() === table.toLowerCase()) {
                return this.getTable(table);
            }
        }
        return null;
    }
    getTable(name) {
        return this[name];
    }
    async setupTriggers() {
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
        }
        catch (error) {
            console.error(error);
        }
    }
    async initPgListener() {
        this.pgClient = new pg_1.Client({
            connectionString: this.moduleOptions.url,
        });
        await this.pgClient.connect();
        await this.pgClient.query('LISTEN table_changes');
        this.pgClient.on('notification', (msg) => {
            const payload = JSON.parse(msg.payload);
            this.handleNotification(payload);
        });
        this.pgClient.on('error', () => { });
    }
    handleNotification(payload) {
        const { table, action, old, now } = payload;
        this.logger.log(`Prisma table ${table} change: ${action} at ${old?.id} -> ${now?.id}`);
        for (const listener of this.listeners.values()) {
            if (listener.getMethods().map(m => m.toLowerCase()).includes(action.toLowerCase()) &&
                listener.getTables().map(m => m.toLowerCase()).includes(table.toLowerCase())) {
                listener.execute(table, action, old, now);
            }
        }
    }
    registerListener(execute, tables, methods = ["INSERT", "UPDATE", "DELETE"]) {
        const listener = {
            getMethods: () => methods,
            getTables: () => tables,
            execute: execute,
        };
        this.listeners.set(this.nextListener, listener);
        return this.nextListener++;
    }
    removeListener(key) {
        this.listeners.delete(key);
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(constants_1.PRISMA_OPTIONS)),
    __metadata("design:paramtypes", [Object])
], PrismaService);

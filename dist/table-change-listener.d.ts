export interface TableChangeListener {
    getMethods(): string[];
    getTables(): string[];
    execute(table: string, method: string, old: any, now: any): void;
}

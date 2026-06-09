export interface TenantContext {
  tenantId: string;
  userId: string;
  correlationId: string;
}

export interface TenantOwnedRecord {
  id: string;
  tenantId: string;
}

export interface TenantRepository<T extends TenantOwnedRecord> {
  findById(context: TenantContext, id: string): Promise<T | null>;
  list(context: TenantContext): Promise<readonly T[]>;
}

export interface TenantMutableRepository<
  T extends TenantOwnedRecord,
  TCreate,
  TUpdate
> extends TenantRepository<T> {
  create(context: TenantContext, input: TCreate): Promise<T>;
  update(context: TenantContext, id: string, input: TUpdate): Promise<T | null>;
  delete(context: TenantContext, id: string): Promise<boolean>;
}

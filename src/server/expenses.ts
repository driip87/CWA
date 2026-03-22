import { adminDb } from './firebaseAdmin';
import { DEFAULT_TENANT_ID } from '../shared/unified';

export const UNASSIGNED_EXPENSE_TENANT_ID = 'cordova-unassigned';

type LookupSource = 'users' | 'accounts' | 'inventory';

interface ExpenseTenantSignalDefinition {
  field: string;
  sources: LookupSource[];
}

interface ExpenseTenantLookupMaps {
  users: Map<string, string>;
  accounts: Map<string, string>;
  inventory: Map<string, string>;
}

export interface ExpenseTenantSignalMatch {
  field: string;
  source: LookupSource;
  referenceId: string;
  tenantId: string;
}

export interface ExpenseTenantAssignment {
  tenantId: string;
  assignment: 'existing' | 'inferred' | 'unassigned';
  reason: string;
  signals: ExpenseTenantSignalMatch[];
}

export interface ExpenseTenantBackfillResult {
  processed: number;
  skipped: number;
  inferred: number;
  unassigned: number;
  updated: number;
  manualReviewCount: number;
  manualReviewExpenseIds: string[];
}

const EXPENSE_TENANT_SIGNALS: ExpenseTenantSignalDefinition[] = [
  { field: 'userId', sources: ['users'] },
  { field: 'customerId', sources: ['users'] },
  { field: 'authorId', sources: ['users', 'accounts'] },
  { field: 'assignedTo', sources: ['users', 'accounts'] },
  { field: 'createdBy', sources: ['accounts', 'users'] },
  { field: 'createdByUid', sources: ['accounts'] },
  { field: 'ownerId', sources: ['accounts', 'users'] },
  { field: 'uid', sources: ['accounts'] },
  { field: 'assetId', sources: ['inventory'] },
  { field: 'vehicleId', sources: ['inventory'] },
  { field: 'inventoryId', sources: ['inventory'] },
  { field: 'equipmentId', sources: ['inventory'] },
];

function nowIso() {
  return new Date().toISOString();
}

function readStringField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function reasonFromSignals(signals: ExpenseTenantSignalMatch[]) {
  if (signals.length === 0) {
    return 'no_reliable_signal';
  }

  const uniqueFields = [...new Set(signals.map((signal) => signal.field))];
  return uniqueFields.join(',');
}

export function inferExpenseTenantAssignment(
  expense: Record<string, unknown>,
  lookups: ExpenseTenantLookupMaps,
): ExpenseTenantAssignment {
  const existingTenantId = readStringField(expense, 'tenantId');
  if (existingTenantId) {
    return {
      tenantId: existingTenantId,
      assignment: 'existing',
      reason: 'existing_tenant_id',
      signals: [],
    };
  }

  const signals: ExpenseTenantSignalMatch[] = [];

  for (const definition of EXPENSE_TENANT_SIGNALS) {
    const referenceId = readStringField(expense, definition.field);
    if (!referenceId) continue;

    for (const source of definition.sources) {
      const tenantId = lookups[source].get(referenceId);
      if (!tenantId) continue;
      signals.push({
        field: definition.field,
        source,
        referenceId,
        tenantId,
      });
      break;
    }
  }

  const uniqueTenantIds = [...new Set(signals.map((signal) => signal.tenantId))];
  if (uniqueTenantIds.length === 1) {
    return {
      tenantId: uniqueTenantIds[0]!,
      assignment: 'inferred',
      reason: reasonFromSignals(signals),
      signals,
    };
  }

  return {
    tenantId: UNASSIGNED_EXPENSE_TENANT_ID,
    assignment: 'unassigned',
    reason: uniqueTenantIds.length > 1 ? 'conflicting_signals' : 'no_reliable_signal',
    signals,
  };
}

function tenantFromUser(record: FirebaseFirestore.DocumentData) {
  const tenantId = typeof record.tenantId === 'string' ? record.tenantId.trim() : '';
  return tenantId || DEFAULT_TENANT_ID;
}

function tenantFromAccount(record: FirebaseFirestore.DocumentData, userTenantById: Map<string, string>) {
  const explicitTenantId = typeof record.tenantId === 'string' ? record.tenantId.trim() : '';
  if (explicitTenantId) {
    return explicitTenantId;
  }

  const customerId = typeof record.customerId === 'string' ? record.customerId.trim() : '';
  if (customerId) {
    return userTenantById.get(customerId) || null;
  }

  return null;
}

function tenantFromInventory(record: FirebaseFirestore.DocumentData, userTenantById: Map<string, string>) {
  const explicitTenantId = typeof record.tenantId === 'string' ? record.tenantId.trim() : '';
  if (explicitTenantId) {
    return explicitTenantId;
  }

  const assignedTo = typeof record.assignedTo === 'string' ? record.assignedTo.trim() : '';
  if (assignedTo) {
    return userTenantById.get(assignedTo) || null;
  }

  return null;
}

async function buildExpenseLookupMaps(): Promise<ExpenseTenantLookupMaps> {
  const [usersSnap, accountsSnap, inventorySnap] = await Promise.all([
    adminDb.collection('users').get(),
    adminDb.collection('accounts').get(),
    adminDb.collection('inventory').get(),
  ]);

  const users = new Map<string, string>();
  usersSnap.docs.forEach((doc) => {
    users.set(doc.id, tenantFromUser(doc.data()));
  });

  const accounts = new Map<string, string>();
  accountsSnap.docs.forEach((doc) => {
    const tenantId = tenantFromAccount(doc.data(), users);
    if (tenantId) {
      accounts.set(doc.id, tenantId);
    }
  });

  const inventory = new Map<string, string>();
  inventorySnap.docs.forEach((doc) => {
    const tenantId = tenantFromInventory(doc.data(), users);
    if (tenantId) {
      inventory.set(doc.id, tenantId);
    }
  });

  return { users, accounts, inventory };
}

export async function backfillExpenseTenantIds(): Promise<ExpenseTenantBackfillResult> {
  const lookups = await buildExpenseLookupMaps();
  const expensesSnap = await adminDb.collection('expenses').get();

  const result: ExpenseTenantBackfillResult = {
    processed: expensesSnap.size,
    skipped: 0,
    inferred: 0,
    unassigned: 0,
    updated: 0,
    manualReviewCount: 0,
    manualReviewExpenseIds: [],
  };

  let batch = adminDb.batch();
  let pendingWrites = 0;
  const backfilledAt = nowIso();

  for (const expenseDoc of expensesSnap.docs) {
    const expense = expenseDoc.data() || {};
    const assignment = inferExpenseTenantAssignment(expense, lookups);

    if (assignment.assignment === 'existing') {
      result.skipped += 1;
      continue;
    }

    batch.set(
      expenseDoc.ref,
      {
        tenantId: assignment.tenantId,
        tenantAssignment: assignment.assignment,
        tenantAssignmentReason: assignment.reason,
        tenantAssignmentSignals: assignment.signals.map(
          (signal) => `${signal.field}:${signal.source}:${signal.referenceId}->${signal.tenantId}`,
        ),
        tenantBackfilledAt: backfilledAt,
      },
      { merge: true },
    );
    pendingWrites += 1;
    result.updated += 1;

    if (assignment.assignment === 'inferred') {
      result.inferred += 1;
    } else {
      result.unassigned += 1;
      result.manualReviewCount += 1;
      if (result.manualReviewExpenseIds.length < 100) {
        result.manualReviewExpenseIds.push(expenseDoc.id);
      }
    }

    if (pendingWrites === 400) {
      await batch.commit();
      batch = adminDb.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0) {
    await batch.commit();
  }

  return result;
}

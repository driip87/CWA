import { backfillExpenseTenantIds } from '../src/server/expenses';

async function main() {
  console.log('Backfilling expense tenant ids...');
  const result = await backfillExpenseTenantIds();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * MySQL allows at most 64 indexes per table. Repeated `sequelize.sync({ alter: true })`
 * can create duplicate indexes on `users` (often on `email`) until ALTER fails with ER_TOO_MANY_KEYS.
 *
 * Usage (from backend folder):
 *   node scripts/fix-users-index-overflow.mjs           # dry-run, lists indexes
 *   node scripts/fix-users-index-overflow.mjs --apply  # drops non-PK indexes, then ensures UNIQUE(email)
 */
import sequelize from "../db.js";

async function main() {
  const apply = process.argv.includes("--apply");

  const [rows] = await sequelize.query(`
    SELECT INDEX_NAME AS name, MAX(NON_UNIQUE) AS non_unique
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    GROUP BY INDEX_NAME
    ORDER BY INDEX_NAME
  `);

  const secondary = rows.filter((r) => r.name !== "PRIMARY");
  console.log(`Table users: ${rows.length} index(es) (${secondary.length} secondary).`);

  if (!apply) {
    console.log("\nSecondary index names:");
    secondary.forEach((r) => console.log(`  - ${r.name} (non_unique=${r.non_unique})`));
    console.log("\nRe-run with --apply to DROP all secondary indexes and add UNIQUE(email).");
    await sequelize.close();
    return;
  }

  for (const { name } of secondary) {
    const safe = String(name).replace(/[^a-zA-Z0-9_]/g, "");
    if (safe !== name) continue;
    try {
      await sequelize.query(`DROP INDEX \`${safe}\` ON \`users\``);
      console.log("Dropped index:", safe);
    } catch (e) {
      console.warn("Could not drop", safe, e.message);
    }
  }

  try {
    await sequelize.query(
      "ALTER TABLE `users` ADD UNIQUE INDEX `users_email_unique` (`email`)"
    );
    console.log("Added UNIQUE index on email.");
  } catch (e) {
    if (e?.parent?.code === "ER_DUP_KEYNAME" || e?.message?.includes("Duplicate")) {
      console.log("UNIQUE on email already present.");
    } else {
      console.error("Could not add UNIQUE on email:", e.message);
    }
  }

  await sequelize.close();
  console.log("Done. Restart the API; keep SQL_SYNC_ALTER=false unless you need a one-off migration.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

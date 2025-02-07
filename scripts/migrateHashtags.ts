import { migrateHashtagsToNormalized } from '../src/services/videoService';

const runMigration = async () => {
  try {
    await migrateHashtagsToNormalized();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration();

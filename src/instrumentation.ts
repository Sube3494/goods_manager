export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { BackupService } = await import('@/lib/backup-service');
    const { startAutoCompleteScheduler } = await import('@/lib/autoPickAutoComplete');
    const { disableInactiveUsers } = await import('@/lib/inactiveUserCleanup');
    
    console.log('--- Initializing Backup Service Watcher ---');
    
    // 启动后立即检查一次
    BackupService.checkAndRunScheduledBackup().catch(err => {
        console.error('Initial backup check failed:', err);
    });

    // 每小时检查一次是否需要执行定期备份
    // 1 小时 = 3600000 毫秒
    setInterval(() => {
      BackupService.checkAndRunScheduledBackup().catch(err => {
        console.error('Scheduled backup check failed:', err);
      });
    }, 3600000);

    console.log('--- Initializing Inactive User Cleanup ---');

    disableInactiveUsers().catch(err => {
      console.error('Initial inactive user cleanup failed:', err);
    });

    setInterval(() => {
      disableInactiveUsers().catch(err => {
        console.error('Scheduled inactive user cleanup failed:', err);
      });
    }, 3600000);

    console.log('--- Initializing Auto Pick Auto Complete Scheduler ---');
    await startAutoCompleteScheduler();
  }
}

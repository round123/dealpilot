import { useEffect, useState } from "react";
import { AlertTriangle, DatabaseBackup } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  type LocalDataInfo,
  useLocalDataOperations,
} from "../providers/localDataOperations";

export const LocalBackupStatus = () => {
  const operations = useLocalDataOperations();
  const [info, setInfo] = useState<LocalDataInfo | null>(null);

  useEffect(() => {
    if (!operations) return;
    const controller = new AbortController();
    operations.getInfo({ signal: controller.signal }).then(setInfo).catch(() => undefined);
    return () => controller.abort();
  }, [operations]);

  if (!info || !["first_import", "overdue"].includes(info.backup_recommendation)) {
    return null;
  }

  const firstImport = info.backup_recommendation === "first_import";
  return (
    <Alert>
      {firstImport ? <DatabaseBackup /> : <AlertTriangle />}
      <AlertTitle>
        {firstImport ? "首次导入已完成，请创建加密备份" : "本地数据需要备份"}
      </AlertTitle>
      <AlertDescription>
        {firstImport
          ? "在继续整理客户前，建议先保存一份 .dpbk 加密备份。"
          : `距离上次备份已超过 ${info.backup_reminder_days} 天。`}
      </AlertDescription>
    </Alert>
  );
};

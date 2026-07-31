import { Database, HardDrive, LockKeyhole, Puzzle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useLocalDataOperations } from "../providers/localDataOperations";

export const LOCAL_PRIVACY_NOTICE_KEY = "dealpilot.local-privacy-notice.v1";

export const LocalPrivacyNotice = ({ firstUse = false }: { firstUse?: boolean }) => {
  const operations = useLocalDataOperations();
  const [dataPath, setDataPath] = useState("正在读取本地数据位置...");
  const [open, setOpen] = useState(
    () => firstUse && localStorage.getItem(LOCAL_PRIVACY_NOTICE_KEY) !== "accepted",
  );

  useEffect(() => {
    if (!operations) return;
    const controller = new AbortController();
    operations.getInfo({ signal: controller.signal })
      .then((info) => setDataPath(info.data_path))
      .catch(() => setDataPath("DealPilot Agent 的本地 data 目录"));
    return () => controller.abort();
  }, [operations]);

  if (!operations) return null;

  if (!firstUse) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LockKeyhole className="size-5" />
            隐私、权限与本地数据说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PrivacyContent dataPath={dataPath} />
        </CardContent>
      </Card>
    );
  }

  const accept = () => {
    localStorage.setItem(LOCAL_PRIVACY_NOTICE_KEY, "accepted");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>开始使用前，请了解本地数据与扩展权限</DialogTitle>
          <DialogDescription>
            DealPilot V1 无需注册登录，业务数据默认只保存在这台电脑。
          </DialogDescription>
        </DialogHeader>
        <PrivacyContent dataPath={dataPath} />
        <DialogFooter>
          <Button onClick={accept}>我已了解，开始使用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PrivacyContent = ({ dataPath }: { dataPath: string }) => (
  <div className="space-y-4 text-sm">
    <NoticeItem icon={Puzzle} title="扩展权限用途">
      仅访问 WhatsApp Web 与 Telegram Web 的当前页面，用于识别当前会话、展示档案和处理提醒；
      nativeMessaging 用于连接本地 Agent，storage 保存本机配对配置，activeTab 与 alarms
      用于当前标签页交互和定时刷新。DealPilot 不批量抓取历史对话，也不自动发送、修改或删除平台消息。
    </NoticeItem>
    <NoticeItem icon={Database} title="本地保存内容">
      客户、联系人、社媒账号、项目、跟进、提醒以及用户主动标记的单条消息正文保存在本地 SQLite。
      清除浏览器数据或卸载扩展不会删除这些业务数据，但扩展需要重新配对。
    </NoticeItem>
    <NoticeItem icon={HardDrive} title="数据位置">
      <span className="break-all font-mono text-xs">{dataPath}</span>
      <span className="mt-1 block text-muted-foreground">
        数据安全依赖当前设备和操作系统账号，无法防御已经取得本机权限的访问者。
      </span>
    </NoticeItem>
    <NoticeItem icon={LockKeyhole} title="备份方式">
      在“设置 / 本地数据”创建受密码保护的 .dpbk 加密备份。密码不会保存且无法找回；更换设备时使用该备份恢复。
    </NoticeItem>
    <NoticeItem icon={Trash2} title="删除方式">
      客户删除后可在 30 天内恢复；“清空全部数据”会不可撤销地清空本地数据库，已下载到其他位置的备份不受影响。
    </NoticeItem>
  </div>
);

const NoticeItem = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Puzzle;
  title: string;
  children: ReactNode;
}) => (
  <section className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
    <Icon className="mt-0.5 size-5 text-muted-foreground" />
    <div>
      <h3 className="font-medium">{title}</h3>
      <div className="mt-1 leading-6 text-muted-foreground">{children}</div>
    </div>
  </section>
);

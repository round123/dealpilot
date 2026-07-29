import { useState } from "react";
import { useMergeCustomer } from "../api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomerMergeDialog({
  sourceId,
  targetId,
  open,
  onOpenChange,
}: {
  sourceId?: string;
  targetId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [source, setSource] = useState(sourceId ?? "");
  const [target, setTarget] = useState(targetId ?? "");
  const mergeM = useMergeCustomer();

  const handleMerge = () => {
    if (!source || !target) return;
    mergeM.mutate(
      { source_id: source, target_id: target },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="合并客户" description="合并后将把源客户的跟进、项目、提醒和社媒绑定迁移到目标客户。">
        <div className="space-y-4">
          <div>
            <Label>源客户 ID（将被合并）</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="客户 UUID" />
          </div>
          <div>
            <Label>目标客户 ID（保留）</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="客户 UUID" />
          </div>
          <div className="rounded-md bg-warning-light p-3 text-xs text-warning-dark">
            合并操作不可撤销，请确认源客户和目标客户选择正确。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleMerge}
            loading={mergeM.isPending}
            disabled={!source || !target || source === target}
          >
            确认合并
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

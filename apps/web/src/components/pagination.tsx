import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  range,
  total,
}: {
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  range?: string;
  total?: number;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-sm text-text-tertiary">
        {range && total ? `显示 ${range} / 共 ${total}` : ""}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft size={14} />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={onNext}
        >
          下一页
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

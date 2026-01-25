import { Badge } from "@/components/ui/badge";

export const getStatusBadge = (status: string) => {
    switch (status) {
        case 'reception': return <Badge className="bg-blue-500 hover:bg-blue-600">受付</Badge>;
        case 'diagnosing': return <Badge className="bg-amber-500 hover:bg-amber-600">見積中</Badge>;
        case 'parts_wait': return <Badge className="bg-orange-400 hover:bg-orange-500">部品待 (未注文)</Badge>;
        case 'parts_wait_ordered': return <Badge className="bg-orange-600 hover:bg-orange-700">部品待 (注文済)</Badge>;
        case 'in_progress': return <Badge className="bg-indigo-500 hover:bg-indigo-600">作業中</Badge>;
        case 'completed': return <Badge className="bg-emerald-500 hover:bg-emerald-600">完了</Badge>;
        case 'delivered': return <Badge className="bg-zinc-500 hover:bg-zinc-600">納品済</Badge>;
        case 'canceled': return <Badge variant="destructive">キャンセル</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
};
